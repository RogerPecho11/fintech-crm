import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';

const router = Router();
router.use(authenticate);

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_5MIN = 5 * 60 * 1000;
const CACHE_30MIN = 30 * 60 * 1000;

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: any, ttl: number): void {
  cache.set(key, { data, expires: Date.now() + ttl });
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now > v.expires) cache.delete(k); }
  }
}

// País → Moneda
const COUNTRY_CURRENCY: Record<string, string> = {
  'PE': 'PEN', 'CL': 'CLP', 'EC': 'USD', 'BR': 'BRL', 'MX': 'MXN', 'CO': 'COP', 'AR': 'ARS',
};

// ─── GET /countries — países disponibles
router.get('/countries', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'countries';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const results = await mysqlQuery(
      `SELECT DISTINCT country FROM commerce WHERE country IS NOT NULL AND deleted_at IS NULL AND enabled = 1 ORDER BY country`
    );
    const countries = results.map((r: any) => r.country);
    setCache(cacheKey, countries, CACHE_30MIN);
    res.json(countries);
  } catch (err: any) {
    console.error('[Monitoring] countries error:', err.message);
    res.json([]);
  }
});

// ─── GET /commerces?country=XX — comercios filtrados por país
router.get('/commerces', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { country } = req.query as any;
    const cacheKey = `commerces:${country || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    let sql = `SELECT id, name, country FROM commerce WHERE deleted_at IS NULL AND enabled = 1`;
    const params: any[] = [];
    if (country) { sql += ` AND country = ?`; params.push(country); }
    sql += ` ORDER BY name`;

    const results = await mysqlQuery(sql, params);
    setCache(cacheKey, results, CACHE_30MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] commerces error:', err.message);
    res.json([]);
  }
});

// ─── GET /daily-volume — Volumen diario payin/payout por comercio
router.get('/daily-volume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id } = req.query as any;
    if (!commerce_id) return res.json({ payin: [], payout: [], currency: 'USD' });

    const rawFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rawTo = date_to || new Date().toISOString().slice(0, 10);

    // Limitar a máximo 60 días para proteger la réplica
    const toDate = new Date(rawTo);
    const fromDate = new Date(rawFrom);
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    const from = diffDays > 60
      ? new Date(toDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : rawFrom;
    const to = rawTo;

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cid = Number(commerce_id);

    // Obtener moneda del comercio (usa cache de commerces si existe)
    const commerceRows = await mysqlQuery(`SELECT country FROM commerce WHERE id = ? LIMIT 1`, [cid]);
    const country = commerceRows[0]?.country || '';
    const currency = COUNTRY_CURRENCY[country?.toUpperCase()] || 'USD';

    const dateParams = [from + ' 00:00:00', to + ' 23:59:59', cid];

    // Una sola query para payin agrupada por fecha — usa índice (commerce_id, created_at)
    const payinSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payoutSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM withdrawal
      WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at) ORDER BY fecha`;

    // commerce_id primero en params para que use el índice
    const [payin, payout] = await Promise.all([
      mysqlQuery(payinSql, [cid, from + ' 00:00:00', to + ' 23:59:59']),
      mysqlQuery(payoutSql, [cid, from + ' 00:00:00', to + ' 23:59:59']),
    ]);

    const result = { payin, payout, currency };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] daily-volume error:', err.message);
    res.json({ payin: [], payout: [], currency: 'USD' });
  }
});

// ─── GET /by-method — Volumen por método payin y payout con evolución diaria
router.get('/by-method', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id } = req.query as any;
    if (!commerce_id) return res.json({ payin: [], payout: [] });

    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);
    const cid = Number(commerce_id);

    const cacheKey = `by-method:${from}:${to}:${cid}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Payin: volumen por método con evolución diaria
    const payinSql = `SELECT method, DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL AND method IS NOT NULL AND created_at BETWEEN ? AND ?
      GROUP BY method, DATE(created_at) ORDER BY method, fecha`;

    // Payout: volumen por tipo con evolución diaria
    const payoutSql = `SELECT type as method, DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM withdrawal
      WHERE commerce_id = ? AND deleted_at IS NULL AND type IS NOT NULL AND created_at BETWEEN ? AND ?
      GROUP BY type, DATE(created_at) ORDER BY type, fecha`;

    const [payin, payout] = await Promise.all([
      mysqlQuery(payinSql, [cid, from + ' 00:00:00', to + ' 23:59:59']),
      mysqlQuery(payoutSql, [cid, from + ' 00:00:00', to + ' 23:59:59']),
    ]);

    const result = { payin, payout };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] by-method error:', err.message);
    res.json({ payin: [], payout: [] });
  }
});

// ─── GET /approval-rate — Tasa de aprobación por método del comercio
router.get('/approval-rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id } = req.query as any;
    if (!commerce_id) return res.json([]);

    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);
    const cid = Number(commerce_id);

    const cacheKey = `approval:${from}:${to}:${cid}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const sql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as rechazadas,
      ROUND(SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as tasa_aprobacion
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL AND method IS NOT NULL
      AND status NOT IN ('pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY method ORDER BY tasa_aprobacion ASC`;

    const results = await mysqlQuery(sql, [cid, from + ' 00:00:00', to + ' 23:59:59']);
    setCache(cacheKey, results, CACHE_5MIN);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] approval-rate error:', err.message);
    res.json([]);
  }
});

// ─── GET /alerts — Alertas: inactividad >3h, caídas por método
router.get('/alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commerce_id } = req.query as any;
    if (!commerce_id) return res.json({ inactivity: [], drops: [] });

    const cid = Number(commerce_id);
    const cacheKey = `alerts:${cid}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Inactividad: métodos sin transacciones en últimas 3 horas
    const inactivitySql = `SELECT method, MAX(created_at) as ultima_transaccion,
      TIMESTAMPDIFF(HOUR, MAX(created_at), NOW()) as horas_inactivo
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
      GROUP BY method
      HAVING horas_inactivo >= 3
      ORDER BY horas_inactivo DESC`;

    // Caídas: tasa error > 40% en última hora
    const dropSql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('error','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as errores,
      ROUND(SUM(CASE WHEN status IN ('error','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as tasa_error
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY method
      HAVING total >= 3 AND tasa_error > 40
      ORDER BY tasa_error DESC`;

    const [inactivity, drops] = await Promise.all([
      mysqlQuery(inactivitySql, [cid]),
      mysqlQuery(dropSql, [cid]),
    ]);

    const result = { inactivity, drops };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] alerts error:', err.message);
    res.json({ inactivity: [], drops: [] });
  }
});

// ─── Legacy endpoints (para evitar 404 de JS cacheado viejo) ──────────────────
router.get('/by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/payout-time', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/methods-by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/commerce-info/:id', (_req: AuthenticatedRequest, res: Response) => res.json({}));

export default router;
