import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';

const router = Router();
router.use(authenticate);

// ─── Cache en memoria para reducir carga a la réplica ─────────────────────────
const monitorCache = new Map<string, { data: any; expires: number }>();

function getCached(key: string): any | null {
  const entry = monitorCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { monitorCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: any, ttlMs: number): void {
  monitorCache.set(key, { data, expires: Date.now() + ttlMs });
  if (monitorCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of monitorCache) { if (now > v.expires) monitorCache.delete(k); }
  }
}

const CACHE_5MIN = 5 * 60 * 1000;
const CACHE_30MIN = 30 * 60 * 1000;

// Mapeo país → moneda
const COUNTRY_CURRENCY: Record<string, string> = {
  'PE': 'PEN', 'CL': 'CLP', 'EC': 'USD', 'BR': 'BRL', 'MX': 'MXN', 'CO': 'COP', 'AR': 'ARS',
};

// Limitar rango de fechas a máximo 14 días
function limitDateRange(from: string, to: string): { from: string; to: string } {
  const maxDays = 14;
  const toDate = new Date(to);
  const fromDate = new Date(from);
  const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > maxDays) {
    const limitedFrom = new Date(toDate.getTime() - maxDays * 24 * 60 * 60 * 1000);
    return { from: limitedFrom.toISOString().slice(0, 10), to };
  }
  return { from, to };
}

// ─── GET /api/v1/monitoring/commerce-info/:id — Info del comercio (moneda, país, métodos activos)
router.get('/commerce-info/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `commerce-info:${id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Info básica del comercio
    const commerceRows = await mysqlQuery(
      `SELECT id, name, country FROM commerce WHERE id = ? LIMIT 1`,
      [Number(id)]
    );
    if (!commerceRows.length) return res.status(404).json({ error: 'Comercio no encontrado' });

    const commerce = commerceRows[0];
    const currency = COUNTRY_CURRENCY[commerce.country?.toUpperCase()] || 'USD';

    // Métodos de payin activos (commerce_gateway)
    const payinMethods = await mysqlQuery(
      `SELECT cg.id, gp.name as method_name, cg.status
       FROM commerce_gateway cg
       JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       WHERE cg.commerce_id = ? AND cg.deleted_at IS NULL AND cg.status = 'active'
       ORDER BY gp.name`,
      [Number(id)]
    );

    // Métodos de payout activos (commerce_gateway_withdrawal)
    const payoutMethods = await mysqlQuery(
      `SELECT cgw.id, gw.name as method_name, cgw.status
       FROM commerce_gateway_withdrawal cgw
       JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       WHERE cgw.commerce_id = ? AND cgw.deleted_at IS NULL AND cgw.status = 'active'
       ORDER BY gw.name`,
      [Number(id)]
    );

    const result = {
      id: commerce.id,
      name: commerce.name,
      country: commerce.country,
      currency,
      payin_methods: payinMethods.map((m: any) => m.method_name),
      payout_methods: payoutMethods.map((m: any) => m.method_name),
    };

    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] commerce-info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/daily-volume — Transacciones y monto por día (payin/payout)
router.get('/daily-volume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    if (!commerce_id) return res.json({ payin: [], payout: [] });

    const rawFrom = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rawTo = date_to || new Date().toISOString().slice(0, 10);
    const { from, to } = limitDateRange(rawFrom, rawTo);

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];
    let countryFilter = '';
    if (country) { countryFilter = ` AND country = ?`; params.push(country); }

    const payinSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM payment WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? AND commerce_id = ?${countryFilter}
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payoutParams = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];
    let payoutCountryFilter = '';
    if (country) { payoutCountryFilter = ` AND country = ?`; payoutParams.push(country); }

    const payoutSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM withdrawal WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? AND commerce_id = ?${payoutCountryFilter}
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payin = await mysqlQuery(payinSql, params);
    const payout = await mysqlQuery(payoutSql, payoutParams);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] daily-volume error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /api/v1/monitoring/by-method — Volumen por método de pago separado payin/payout
router.get('/by-method', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    if (!commerce_id) return res.json({ payin: [], payout: [] });

    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `by-method:${from}:${to}:${commerce_id}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];
    let countryFilter = '';
    if (country) { countryFilter = ` AND country = ?`; params.push(country); }

    // Payin por método
    const payinSql = `SELECT method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND created_at BETWEEN ? AND ? AND commerce_id = ?${countryFilter}
      GROUP BY method ORDER BY monto DESC LIMIT 25`;

    // Payout por método (type en withdrawal)
    const payoutParams = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];
    let payoutCountryFilter = '';
    if (country) { payoutCountryFilter = ` AND country = ?`; payoutParams.push(country); }

    const payoutSql = `SELECT type as method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM withdrawal WHERE deleted_at IS NULL AND type IS NOT NULL
      AND created_at BETWEEN ? AND ? AND commerce_id = ?${payoutCountryFilter}
      GROUP BY type ORDER BY monto DESC LIMIT 25`;

    const payin = await mysqlQuery(payinSql, params);
    const payout = await mysqlQuery(payoutSql, payoutParams);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] by-method error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /api/v1/monitoring/approval-rate — Tasa de aprobación por método (solo del comercio)
router.get('/approval-rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    if (!commerce_id) return res.json([]);

    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `approval:${from}:${to}:${commerce_id}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];
    let countryFilter = '';
    if (country) { countryFilter = ` AND country = ?`; params.push(country); }

    const sql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      ROUND(SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_aprobacion
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND status IN ('success','completed','error','canceled','expired','bank_error','authentication_error','rejected','chargeback')
      AND created_at BETWEEN ? AND ? AND commerce_id = ?${countryFilter}
      GROUP BY method HAVING total >= 5 ORDER BY tasa_aprobacion ASC LIMIT 20`;

    const results = await mysqlQuery(sql, params);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] approval-rate error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/alerts — Alertas filtradas por comercio seleccionado
router.get('/alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commerce_id } = req.query as any;
    if (!commerce_id) return res.json({ inactivity: [], drops: [], payoutTime: [] });

    const cacheKey = `alerts:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Inactividad: métodos del comercio sin trx en últimas 3h
    const inactivitySql = `SELECT method, MAX(created_at) as ultima_transaccion,
      TIMESTAMPDIFF(HOUR, MAX(created_at), NOW()) as horas_inactivo
      FROM payment
      WHERE deleted_at IS NULL AND method IS NOT NULL AND commerce_id = ?
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY method
      HAVING horas_inactivo >= 3
      ORDER BY horas_inactivo DESC
      LIMIT 20`;

    // Caídas: tasa error > 50% en última hora para el comercio
    const dropSql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('error','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as errores,
      ROUND(SUM(CASE WHEN status IN ('error','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_error
      FROM payment
      WHERE deleted_at IS NULL AND method IS NOT NULL AND commerce_id = ?
      AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY method
      HAVING total >= 3 AND tasa_error > 50
      ORDER BY tasa_error DESC
      LIMIT 10`;

    // Payouts lentos del comercio: promedio > 30 min en últimas 24h
    const payoutTimeSql = `SELECT w.commerce_id, c.name as commerce_name,
      w.type as method,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min
      FROM withdrawal w INNER JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.status IN ('success','completed') AND w.date_success IS NOT NULL
      AND w.commerce_id = ?
      AND w.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY w.commerce_id, c.name, w.type
      HAVING tiempo_promedio_min > 30
      ORDER BY tiempo_promedio_min DESC
      LIMIT 15`;

    const inactivity = await mysqlQuery(inactivitySql, [Number(commerce_id)]);
    const drops = await mysqlQuery(dropSql, [Number(commerce_id)]);
    const payoutTime = await mysqlQuery(payoutTimeSql, [Number(commerce_id)]);

    const result = { inactivity, drops, payoutTime };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] alerts error:', err.message);
    res.json({ inactivity: [], drops: [], payoutTime: [] });
  }
});

// ─── GET /api/v1/monitoring/payout-time — Tiempo de payouts del comercio por método
router.get('/payout-time', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id } = req.query as any;
    if (!commerce_id) return res.json([]);

    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `payout-time:${from}:${to}:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const sql = `SELECT w.type as method,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min,
      ROUND(MIN(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_min,
      ROUND(MAX(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_max
      FROM withdrawal w
      WHERE w.deleted_at IS NULL AND w.status IN ('success','completed') AND w.date_success IS NOT NULL
      AND w.commerce_id = ? AND w.created_at BETWEEN ? AND ?
      GROUP BY w.type
      ORDER BY tiempo_promedio_min DESC
      LIMIT 30`;

    const results = await mysqlQuery(sql, [Number(commerce_id), from + ' 00:00:00', to + ' 23:59:59']);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] payout-time error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/commerces — Lista de comercios (cache largo)
router.get('/commerces', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'commerces-list';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const results = await mysqlQuery(
      `SELECT id, name, country FROM commerce WHERE deleted_at IS NULL AND enabled = 1 ORDER BY name`
    );
    setCache(cacheKey, results, CACHE_30MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] commerces error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/countries — Lista de países (cache largo)
router.get('/countries', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'countries-list';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const results = await mysqlQuery(
      `SELECT DISTINCT country FROM commerce WHERE country IS NOT NULL AND deleted_at IS NULL ORDER BY country`
    );
    const countries = results.map((r: any) => r.country);
    setCache(cacheKey, countries, CACHE_30MIN);
    res.json(countries);
  } catch (err: any) {
    console.error('[Monitoring] countries error:', err.message);
    res.json([]);
  }
});

export default router;
