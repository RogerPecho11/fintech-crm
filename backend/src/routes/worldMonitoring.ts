import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';
import { query as pgQuery } from '../database/connection';

const router = Router();
router.use(authenticate);

// ─── Cache en memoria con TTL ────────────────────────────────────────────────
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_1MIN = 60 * 1000;
const CACHE_5MIN = 5 * 60 * 1000;
const CACHE_15MIN = 15 * 60 * 1000;

function cached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: any, ttl: number) {
  cache.set(key, { data, expires: Date.now() + ttl });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now > v.expires) cache.delete(k); }
  }
}

// Fecha mínima de monitoreo
const MIN_DATE = '2026-06-08';

// ─── GET /overview — Métricas globales ───────────────────────────────────────
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '1h', commerce_ids } = req.query as any;
    const cacheKey = `wm:overview:${period}:${commerce_ids || 'all'}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    // Calcular rango según período
    const intervals: Record<string, string> = {
      '15m': '15 MINUTE', '1h': '1 HOUR', '6h': '6 HOUR',
      '24h': '24 HOUR', '7d': '7 DAY', '30d': '30 DAY',
    };
    const interval = intervals[period] || '1 HOUR';

    // Filtro de comercios
    let commerceFilter = '';
    if (commerce_ids) {
      const ids = commerce_ids.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (ids.length > 0) commerceFilter = ` AND commerce_id IN (${ids.join(',')})`;
    }

    // Métricas PayIn
    const [payinMetrics] = await Promise.all([
      mysqlQuery(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status IN ('error','bank_error','rejected','authentication_error') THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
          SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as cancelled,
          COALESCE(SUM(amount), 0) as volume,
          COUNT(*) / GREATEST(TIMESTAMPDIFF(MINUTE, MIN(created_at), MAX(created_at)), 1) as tpm
        FROM payment
        WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
        AND created_at >= '${MIN_DATE}'${commerceFilter}
      `),
    ]);

    // Métricas PayOut
    const payoutMetrics = await mysqlQuery(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status IN ('error','bank_error','rejected') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as cancelled,
        COALESCE(SUM(amount), 0) as volume
      FROM withdrawal
      WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      AND created_at >= '${MIN_DATE}'${commerceFilter}
    `);

    const pi = payinMetrics[0] || {};
    const po = payoutMetrics[0] || {};
    const piTotal = Number(pi.total) || 0;
    const poTotal = Number(po.total) || 0;

    const result = {
      payin: {
        total: piTotal,
        success: Number(pi.success) || 0,
        failed: Number(pi.failed) || 0,
        pending: Number(pi.pending) || 0,
        expired: Number(pi.expired) || 0,
        cancelled: Number(pi.cancelled) || 0,
        volume: Number(pi.volume) || 0,
        successRate: piTotal > 0 ? ((Number(pi.success) || 0) / piTotal * 100).toFixed(1) : '0',
        tpm: Number(pi.tpm) || 0,
      },
      payout: {
        total: poTotal,
        success: Number(po.success) || 0,
        failed: Number(po.failed) || 0,
        pending: Number(po.pending) || 0,
        expired: Number(po.expired) || 0,
        cancelled: Number(po.cancelled) || 0,
        volume: Number(po.volume) || 0,
        successRate: poTotal > 0 ? ((Number(po.success) || 0) / poTotal * 100).toFixed(1) : '0',
      },
      period,
    };

    setCache(cacheKey, result, CACHE_15MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[WorldMonitoring] overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /timeline — Datos para gráfico de línea temporal ────────────────────
router.get('/timeline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin', commerce_ids } = req.query as any;
    const cacheKey = `wm:timeline:${period}:${type}:${commerce_ids || 'all'}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const table = type === 'payout' ? 'withdrawal' : 'payment';
    let groupBy = 'HOUR';
    let interval = '24 HOUR';
    let dateFormat = '%Y-%m-%d %H:00';

    if (period === '7d') { groupBy = 'DAY'; interval = '7 DAY'; dateFormat = '%Y-%m-%d'; }
    else if (period === '30d') { groupBy = 'DAY'; interval = '30 DAY'; dateFormat = '%Y-%m-%d'; }
    else if (period === '1h') { interval = '1 HOUR'; dateFormat = '%Y-%m-%d %H:%i'; }

    let commerceFilter = '';
    if (commerce_ids) {
      const ids = commerce_ids.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (ids.length > 0) commerceFilter = ` AND commerce_id IN (${ids.join(',')})`;
    }

    const data = await mysqlQuery(`
      SELECT 
        DATE_FORMAT(created_at, '${dateFormat}') as time_bucket,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status IN ('error','bank_error','rejected','authentication_error') THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(amount), 0) as volume
      FROM ${table}
      WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      AND created_at >= '${MIN_DATE}'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `);

    const result = (data as any[]).map(r => ({
      time: r.time_bucket,
      total: Number(r.total),
      success: Number(r.success),
      failed: Number(r.failed),
      volume: Number(r.volume),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[WorldMonitoring] timeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /by-gateway — Métricas por pasarela ─────────────────────────────────
router.get('/by-gateway', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin' } = req.query as any;
    const cacheKey = `wm:gateway:${period}:${type}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = {
      '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY', '30d': '30 DAY',
    };
    const interval = intervals[period] || '24 HOUR';

    let data;
    if (type === 'payout') {
      data = await mysqlQuery(`
        SELECT gw.name as gateway, w.country,
          COUNT(*) as total,
          SUM(CASE WHEN w.status IN ('success','completed') THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN w.status IN ('error','bank_error','rejected') THEN 1 ELSE 0 END) as failed,
          COALESCE(SUM(w.amount), 0) as volume
        FROM withdrawal w
        LEFT JOIN commerce_gateway_withdrawal cgw ON cgw.id = w.gateway_withdrawal_id
        LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
        WHERE w.deleted_at IS NULL AND w.created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
        AND w.created_at >= '${MIN_DATE}'
        GROUP BY gw.name, w.country
        ORDER BY total DESC
        LIMIT 30
      `);
    } else {
      data = await mysqlQuery(`
        SELECT gp.name as gateway, p.country,
          COUNT(*) as total,
          SUM(CASE WHEN p.status IN ('success','completed') THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN p.status IN ('error','bank_error','rejected','authentication_error') THEN 1 ELSE 0 END) as failed,
          COALESCE(SUM(p.amount), 0) as volume
        FROM payment p
        LEFT JOIN commerce_gateway cg ON cg.id = p.gateway_payment_id
        LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
        WHERE p.deleted_at IS NULL AND p.created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
        AND p.created_at >= '${MIN_DATE}'
        GROUP BY gp.name, p.country
        ORDER BY total DESC
        LIMIT 30
      `);
    }

    const result = (data as any[]).map(r => ({
      gateway: r.gateway || 'Sin pasarela',
      country: r.country || '—',
      total: Number(r.total),
      success: Number(r.success),
      failed: Number(r.failed),
      volume: Number(r.volume),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[WorldMonitoring] by-gateway error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /by-commerce — Top comercios ────────────────────────────────────────
router.get('/by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h', type = 'payin', sort = 'total' } = req.query as any;
    const cacheKey = `wm:commerce:${period}:${type}:${sort}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = {
      '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY', '30d': '30 DAY',
    };
    const interval = intervals[period] || '24 HOUR';
    const table = type === 'payout' ? 'withdrawal' : 'payment';
    const orderBy = sort === 'failed' ? 'failed DESC' : sort === 'volume' ? 'volume DESC' : 'total DESC';

    const data = await mysqlQuery(`
      SELECT c.id as commerce_id, c.name, c.country,
        COUNT(*) as total,
        SUM(CASE WHEN ${table === 'payment' ? 'p' : 'w'}.status IN ('success','completed') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN ${table === 'payment' ? 'p' : 'w'}.status IN ('error','bank_error','rejected') THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(${table === 'payment' ? 'p' : 'w'}.amount), 0) as volume
      FROM ${table} ${table === 'payment' ? 'p' : 'w'}
      JOIN commerce c ON c.id = ${table === 'payment' ? 'p' : 'w'}.commerce_id
      WHERE ${table === 'payment' ? 'p' : 'w'}.deleted_at IS NULL 
      AND ${table === 'payment' ? 'p' : 'w'}.created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      AND ${table === 'payment' ? 'p' : 'w'}.created_at >= '${MIN_DATE}'
      GROUP BY c.id, c.name, c.country
      ORDER BY ${orderBy}
      LIMIT 20
    `);

    const result = (data as any[]).map(r => ({
      commerce_id: r.commerce_id,
      name: r.name,
      country: r.country,
      total: Number(r.total),
      success: Number(r.success),
      failed: Number(r.failed),
      volume: Number(r.volume),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[WorldMonitoring] by-commerce error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /errors — Top errores ───────────────────────────────────────────────
router.get('/errors', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h' } = req.query as any;
    const cacheKey = `wm:errors:${period}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = {
      '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY', '30d': '30 DAY',
    };
    const interval = intervals[period] || '24 HOUR';

    const data = await mysqlQuery(`
      SELECT method, status, internal_state, COUNT(*) as cantidad
      FROM payment
      WHERE deleted_at IS NULL 
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      AND created_at >= '${MIN_DATE}'
      GROUP BY method, status, internal_state
      ORDER BY cantidad DESC
      LIMIT 20
    `);

    setCache(cacheKey, data, CACHE_5MIN);
    res.json(data);
  } catch (err: any) {
    console.error('[WorldMonitoring] errors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /by-country — Métricas por país ─────────────────────────────────────
router.get('/by-country', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '24h' } = req.query as any;
    const cacheKey = `wm:country:${period}`;
    const c = cached(cacheKey);
    if (c) return res.json(c);

    const intervals: Record<string, string> = {
      '1h': '1 HOUR', '6h': '6 HOUR', '24h': '24 HOUR', '7d': '7 DAY', '30d': '30 DAY',
    };
    const interval = intervals[period] || '24 HOUR';

    const data = await mysqlQuery(`
      SELECT country,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status IN ('error','bank_error','rejected','authentication_error') THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(amount), 0) as volume
      FROM payment
      WHERE deleted_at IS NULL AND country IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      AND created_at >= '${MIN_DATE}'
      GROUP BY country
      ORDER BY total DESC
    `);

    const result = (data as any[]).map(r => ({
      country: r.country,
      total: Number(r.total),
      success: Number(r.success),
      failed: Number(r.failed),
      volume: Number(r.volume),
      successRate: Number(r.total) > 0 ? (Number(r.success) / Number(r.total) * 100).toFixed(1) : '0',
    }));

    setCache(cacheKey, result, CACHE_5MIN);
    res.json(result);
  } catch (err: any) {
    console.error('[WorldMonitoring] by-country error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
