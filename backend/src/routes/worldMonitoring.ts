import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';

const router = Router();
router.use(authenticate);

// Cache en memoria - 15 min para no sobrecargar
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_15MIN = 15 * 60 * 1000;

function cached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: any, ttl: number = CACHE_15MIN) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

// GET /overview - Metricas globales (query liviana)
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '1h' } = req.query as any;
    const cacheKey = `wm:ov:${period}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = {
      '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY',
    };
    const interval = intervals[period] || '1 HOUR';

    const pi = await mysqlQuery(
      `SELECT COUNT(*) as total,
        SUM(status IN ('success','completed')) as success,
        SUM(status IN ('error','bank_error','rejected','authentication_error')) as failed,
        SUM(status = 'pending') as pending,
        SUM(status = 'expired') as expired,
        SUM(status = 'canceled') as cancelled,
        COALESCE(SUM(amount), 0) as volume
      FROM payment WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`
    );

    const po = await mysqlQuery(
      `SELECT COUNT(*) as total,
        SUM(status IN ('success','completed')) as success,
        SUM(status IN ('error','bank_error','rejected')) as failed,
        SUM(status = 'pending') as pending,
        SUM(status = 'expired') as expired,
        SUM(status = 'canceled') as cancelled,
        COALESCE(SUM(amount), 0) as volume
      FROM withdrawal WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`
    );

    const piR = pi[0] || {};
    const poR = po[0] || {};
    const piT = Number(piR.total) || 0;
    const poT = Number(poR.total) || 0;

    const result = {
      payin: {
        total: piT, success: Number(piR.success) || 0, failed: Number(piR.failed) || 0,
        pending: Number(piR.pending) || 0, expired: Number(piR.expired) || 0,
        cancelled: Number(piR.cancelled) || 0, volume: Number(piR.volume) || 0,
        successRate: piT > 0 ? ((Number(piR.success) || 0) / piT * 100).toFixed(1) : '0',
        tpm: period === '1h' ? Math.round(piT / 60) : Math.round(piT / (period === '6h' ? 360 : period === '24h' ? 1440 : 10080)),
      },
      payout: {
        total: poT, success: Number(poR.success) || 0, failed: Number(poR.failed) || 0,
        pending: Number(poR.pending) || 0, expired: Number(poR.expired) || 0,
        cancelled: Number(poR.cancelled) || 0, volume: Number(poR.volume) || 0,
        successRate: poT > 0 ? ((Number(poR.success) || 0) / poT * 100).toFixed(1) : '0',
      },
      period,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[WM] overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /timeline - Grafico temporal (max 24 puntos)
router.get('/timeline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin' } = req.query as any;
    const cacheKey = `wm:tl:${period}:${type}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const table = type === 'payout' ? 'withdrawal' : 'payment';
    let interval = '24 HOUR';
    let fmt = '%H:00';
    if (period === '1h') { interval = '1 HOUR'; fmt = '%H:%i'; }
    else if (period === '6h') { interval = '6 HOUR'; fmt = '%H:00'; }
    else if (period === '7d') { interval = '7 DAY'; fmt = '%m-%d'; }

    const data = await mysqlQuery(
      `SELECT DATE_FORMAT(created_at, '${fmt}') as t,
        COUNT(*) as total,
        SUM(status IN ('success','completed')) as success,
        SUM(status IN ('error','bank_error','rejected')) as failed
      FROM ${table} WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY t ORDER BY MIN(created_at) ASC`
    );

    const result = (data as any[]).map(r => ({
      time: r.t, total: Number(r.total), success: Number(r.success), failed: Number(r.failed),
    }));

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[WM] timeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /by-commerce - Top 15 comercios
router.get('/by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin' } = req.query as any;
    const cacheKey = `wm:cm:${period}:${type}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const table = type === 'payout' ? 'withdrawal' : 'payment';
    const alias = type === 'payout' ? 'w' : 'p';
    const intervals: Record<string, string> = { '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY' };
    const interval = intervals[period] || '24 HOUR';

    const data = await mysqlQuery(
      `SELECT c.id as cid, c.name, c.country, COUNT(*) as total,
        SUM(${alias}.status IN ('success','completed')) as success,
        SUM(${alias}.status IN ('error','bank_error','rejected')) as failed,
        COALESCE(SUM(${alias}.amount), 0) as volume
      FROM ${table} ${alias}
      JOIN commerce c ON c.id = ${alias}.commerce_id
      WHERE ${alias}.deleted_at IS NULL AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY c.id, c.name, c.country ORDER BY total DESC LIMIT 15`
    );

    const result = (data as any[]).map(r => ({
      commerce_id: r.cid, name: r.name, country: r.country,
      total: Number(r.total), success: Number(r.success), failed: Number(r.failed),
      volume: Number(r.volume),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[WM] by-commerce error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /by-country - Por pais
router.get('/by-country', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h' } = req.query as any;
    const cacheKey = `wm:ct:${period}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = { '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY' };
    const interval = intervals[period] || '24 HOUR';

    const data = await mysqlQuery(
      `SELECT country, COUNT(*) as total,
        SUM(status IN ('success','completed')) as success,
        SUM(status IN ('error','bank_error','rejected')) as failed
      FROM payment WHERE deleted_at IS NULL AND country IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY country ORDER BY total DESC`
    );

    const result = (data as any[]).map(r => ({
      country: r.country, total: Number(r.total),
      success: Number(r.success), failed: Number(r.failed),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[WM] by-country error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /errors - Top errores
router.get('/errors', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h' } = req.query as any;
    const cacheKey = `wm:er:${period}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = { '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY' };
    const interval = intervals[period] || '24 HOUR';

    const data = await mysqlQuery(
      `SELECT method, status, COUNT(*) as cantidad
      FROM payment WHERE deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY method, status ORDER BY cantidad DESC LIMIT 15`
    );

    setCache(cacheKey, data);
    res.json(data);
  } catch (err: any) {
    console.error('[WM] errors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /by-gateway - Por pasarela
router.get('/by-gateway', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin' } = req.query as any;
    const cacheKey = `wm:gw:${period}:${type}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = { '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY' };
    const interval = intervals[period] || '24 HOUR';

    // Query simple por metodo (no join pesado a gateway tables)
    const table = type === 'payout' ? 'withdrawal' : 'payment';
    const methodCol = type === 'payout' ? 'type' : 'method';

    const data = await mysqlQuery(
      `SELECT ${methodCol} as gateway, country, COUNT(*) as total,
        SUM(status IN ('success','completed')) as success,
        SUM(status IN ('error','bank_error','rejected')) as failed
      FROM ${table} WHERE deleted_at IS NULL AND ${methodCol} IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY ${methodCol}, country ORDER BY total DESC LIMIT 20`
    );

    const result = (data as any[]).map(r => ({
      gateway: r.gateway || 'N/A', country: r.country || '-',
      total: Number(r.total), success: Number(r.success), failed: Number(r.failed),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[WM] by-gateway error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
