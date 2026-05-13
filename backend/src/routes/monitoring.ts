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

    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Obtener moneda del comercio
    const commerceRows = await mysqlQuery(`SELECT country FROM commerce WHERE id = ? LIMIT 1`, [Number(commerce_id)]);
    const country = commerceRows[0]?.country || '';
    const currency = COUNTRY_CURRENCY[country?.toUpperCase()] || 'USD';

    const params = [from + ' 00:00:00', to + ' 23:59:59', Number(commerce_id)];

    const payinSql = `SELECT DATE(created_at) as fecha,
      COUNT(*) as cantidad,
      COALESCE(SUM(amount), 0) as monto
      FROM payment
      WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? AND commerce_id = ?
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payoutSql = `SELECT DATE(created_at) as fecha,
      COUNT(*) as cantidad,
      COALESCE(SUM(amount), 0) as monto
      FROM withdrawal
      WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? AND commerce_id = ?
      GROUP BY DATE(created_at) ORDER BY fecha`;

    const payin = await mysqlQuery(payinSql, params);
    const payout = await mysqlQuery(payoutSql, params);

    const result = { payin, payout, currency };
    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[Monitoring] daily-volume error:', err.message);
    res.json({ payin: [], payout: [], currency: 'USD' });
  }
});

// ─── Legacy endpoints (para evitar 404 de JS cacheado viejo) ──────────────────
router.get('/by-method', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/approval-rate', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/alerts', (_req: AuthenticatedRequest, res: Response) => res.json({ inactivity: [], drops: [], payoutTime: [] }));
router.get('/payout-time', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/methods-by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/commerce-info/:id', (_req: AuthenticatedRequest, res: Response) => res.json({}));

export default router;
