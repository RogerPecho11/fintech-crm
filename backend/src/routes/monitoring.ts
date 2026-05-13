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
  // Limpiar entradas viejas
  if (monitorCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of monitorCache) { if (now > v.expires) monitorCache.delete(k); }
  }
}

const CACHE_5MIN = 5 * 60 * 1000;
const CACHE_10MIN = 10 * 60 * 1000;
const CACHE_15MIN = 15 * 60 * 1000;
const CACHE_30MIN = 30 * 60 * 1000;

// Limitar rango de fechas a máximo 14 días para proteger la réplica
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

// ─── GET /api/v1/monitoring/daily-volume — Transacciones y monto por día (payin/payout)
router.get('/daily-volume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;

    // commerce_id es obligatorio para proteger la réplica
    if (!commerce_id) return res.json({ payin: [], payout: [] });

    const rawFrom = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rawTo = date_to || new Date().toISOString().slice(0, 10);
    const { from, to } = limitDateRange(rawFrom, rawTo);

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id || ''}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    let whereExtra = '';
    if (commerce_id) { whereExtra += ` AND commerce_id = ?`; params.push(Number(commerce_id)); }
    if (country) { whereExtra += ` AND country = ?`; params.push(country); }

    // Usar solo status finales para reducir escaneo
    const payinSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM payment WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?${whereExtra}
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payoutSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM withdrawal WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?${whereExtra}
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payin = await mysqlQuery(payinSql, [...params]);
    const payout = await mysqlQuery(payoutSql, [...params]);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] daily-volume error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /api/v1/monitoring/by-commerce — Volumen por comercio (TOP 30)
router.get('/by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, country } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `by-commerce:${from}:${to}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    let whereExtra = '';
    if (country) { whereExtra = ` AND p.country = ?`; params.push(country); }

    const payinSql = `SELECT p.commerce_id, c.name as commerce_name, COUNT(*) as cantidad, COALESCE(SUM(p.amount), 0) as monto
      FROM payment p INNER JOIN commerce c ON c.id = p.commerce_id
      WHERE p.deleted_at IS NULL AND p.created_at BETWEEN ? AND ?${whereExtra}
      GROUP BY p.commerce_id, c.name ORDER BY monto DESC LIMIT 30`;

    const payoutSql = `SELECT w.commerce_id, c.name as commerce_name, COUNT(*) as cantidad, COALESCE(SUM(w.amount), 0) as monto
      FROM withdrawal w INNER JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.created_at BETWEEN ? AND ?${whereExtra.replace('p.country', 'w.country')}
      GROUP BY w.commerce_id, c.name ORDER BY monto DESC LIMIT 30`;

    const payin = await mysqlQuery(payinSql, [...params]);
    const payout = await mysqlQuery(payoutSql, [...params]);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] by-commerce error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /api/v1/monitoring/by-method — Volumen por método de pago (TOP 25)
router.get('/by-method', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    if (!commerce_id) return res.json([]);

    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `by-method:${from}:${to}:${commerce_id || ''}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    let whereExtra = '';
    if (commerce_id) { whereExtra += ` AND commerce_id = ?`; params.push(Number(commerce_id)); }
    if (country) { whereExtra += ` AND country = ?`; params.push(country); }

    const sql = `SELECT method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error') THEN 1 ELSE 0 END) as rechazadas
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL AND created_at BETWEEN ? AND ?${whereExtra}
      GROUP BY method ORDER BY monto DESC LIMIT 25`;

    const results = await mysqlQuery(sql, params);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] by-method error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/approval-rate — Tasa de aprobación por método
router.get('/approval-rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    if (!commerce_id) return res.json([]);

    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `approval:${from}:${to}:${commerce_id || ''}:${country || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    let whereExtra = '';
    if (commerce_id) { whereExtra += ` AND commerce_id = ?`; params.push(Number(commerce_id)); }
    if (country) { whereExtra += ` AND country = ?`; params.push(country); }

    // Solo considerar transacciones con status final (no pending/new/created)
    const sql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as aprobadas,
      ROUND(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_aprobacion
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND status IN ('completed','error','canceled','expired','bank_error','authentication_error','rejected','chargeback')
      AND created_at BETWEEN ? AND ?${whereExtra}
      GROUP BY method HAVING total >= 10 ORDER BY tasa_aprobacion ASC LIMIT 20`;

    const results = await mysqlQuery(sql, params);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] approval-rate error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/alerts — Alertas de inactividad y caídas
router.get('/alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'alerts';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Inactividad: métodos sin trx en últimas 3h (solo busca en últimas 24h para limitar escaneo)
    const inactivitySql = `SELECT method, MAX(created_at) as ultima_transaccion,
      TIMESTAMPDIFF(HOUR, MAX(created_at), NOW()) as horas_inactivo
      FROM payment
      WHERE deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY method
      HAVING horas_inactivo >= 3
      ORDER BY horas_inactivo DESC
      LIMIT 20`;

    // Caídas: tasa error > 50% en última hora (mínimo 5 trx)
    const dropSql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('error','bank_error','authentication_error') THEN 1 ELSE 0 END) as errores,
      ROUND(SUM(CASE WHEN status IN ('error','bank_error','authentication_error') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_error
      FROM payment
      WHERE deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY method
      HAVING total >= 5 AND tasa_error > 50
      ORDER BY tasa_error DESC
      LIMIT 10`;

    // Payouts lentos: promedio > 30 min en últimas 24h
    const payoutTimeSql = `SELECT w.commerce_id, c.name as commerce_name,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min
      FROM withdrawal w INNER JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.status = 'completed' AND w.date_success IS NOT NULL
      AND w.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY w.commerce_id, c.name
      HAVING tiempo_promedio_min > 30
      ORDER BY tiempo_promedio_min DESC
      LIMIT 15`;

    // Ejecutar secuencialmente para no saturar la réplica
    const inactivity = await mysqlQuery(inactivitySql);
    const drops = await mysqlQuery(dropSql);
    const payoutTime = await mysqlQuery(payoutTimeSql);

    const result = { inactivity, drops, payoutTime };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] alerts error:', err.message);
    res.json({ inactivity: [], drops: [], payoutTime: [] });
  }
});

// ─── GET /api/v1/monitoring/payout-time — Tiempo de payouts por comercio
router.get('/payout-time', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `payout-time:${from}:${to}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const sql = `SELECT w.commerce_id, c.name as commerce_name,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min,
      ROUND(MIN(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_min,
      ROUND(MAX(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_max
      FROM withdrawal w INNER JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.status = 'completed' AND w.date_success IS NOT NULL
      AND w.created_at BETWEEN ? AND ?
      GROUP BY w.commerce_id, c.name
      ORDER BY tiempo_promedio_min DESC
      LIMIT 30`;

    const results = await mysqlQuery(sql, [from + ' 00:00:00', to + ' 23:59:59']);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] payout-time error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/methods-by-commerce — MDP activos por comercio (matriz)
router.get('/methods-by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'methods-matrix';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Solo últimos 7 días y status completed para reducir escaneo
    const payinSql = `SELECT p.commerce_id, c.name as commerce_name, p.method
      FROM payment p INNER JOIN commerce c ON c.id = p.commerce_id
      WHERE p.deleted_at IS NULL AND p.method IS NOT NULL
      AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND p.status = 'completed'
      GROUP BY p.commerce_id, c.name, p.method
      ORDER BY c.name, p.method`;

    const payoutSql = `SELECT w.commerce_id, c.name as commerce_name, w.type as method
      FROM withdrawal w INNER JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.type IS NOT NULL
      AND w.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND w.status = 'completed'
      GROUP BY w.commerce_id, c.name, w.type
      ORDER BY c.name, w.type`;

    const payin = await mysqlQuery(payinSql);
    const payout = await mysqlQuery(payoutSql);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_10MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] methods-by-commerce error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /api/v1/monitoring/commerces — Lista de comercios (cache largo)
router.get('/commerces', async (req: AuthenticatedRequest, res: Response) => {
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
    // Si falla, devolver array vacío en vez de 500
    console.error('[Monitoring] commerces error:', err.message);
    res.json([]);
  }
});

// ─── GET /api/v1/monitoring/countries — Lista de países (cache largo)
router.get('/countries', async (req: AuthenticatedRequest, res: Response) => {
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
