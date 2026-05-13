import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/monitoring/daily-volume — Transacciones y monto por día (payin/payout)
router.get('/daily-volume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    let payinSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM payment WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?`;
    let payoutSql = `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto
      FROM withdrawal WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?`;

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];

    if (commerce_id) {
      payinSql += ` AND commerce_id = ?`;
      payoutSql += ` AND commerce_id = ?`;
      params.push(Number(commerce_id));
    }
    if (country) {
      payinSql += ` AND country = ?`;
      payoutSql += ` AND country = ?`;
      params.push(country);
    }

    payinSql += ` GROUP BY DATE(created_at) ORDER BY fecha`;
    payoutSql += ` GROUP BY DATE(created_at) ORDER BY fecha`;

    const [payin, payout] = await Promise.all([
      mysqlQuery(payinSql, [...params]),
      mysqlQuery(payoutSql, [...params]),
    ]);

    res.json({ payin, payout });
  } catch (err: any) {
    console.error('[Monitoring] daily-volume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/by-commerce — Volumen por comercio
router.get('/by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, country } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    let payinSql = `SELECT p.commerce_id, c.name as commerce_name, COUNT(*) as cantidad, COALESCE(SUM(p.amount), 0) as monto
      FROM payment p LEFT JOIN commerce c ON c.id = p.commerce_id
      WHERE p.deleted_at IS NULL AND p.created_at BETWEEN ? AND ?`;
    let payoutSql = `SELECT w.commerce_id, c.name as commerce_name, COUNT(*) as cantidad, COALESCE(SUM(w.amount), 0) as monto
      FROM withdrawal w LEFT JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.created_at BETWEEN ? AND ?`;

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    if (country) {
      payinSql += ` AND p.country = ?`;
      payoutSql += ` AND w.country = ?`;
      params.push(country);
    }

    payinSql += ` GROUP BY p.commerce_id, c.name ORDER BY monto DESC`;
    payoutSql += ` GROUP BY w.commerce_id, c.name ORDER BY monto DESC`;

    const [payin, payout] = await Promise.all([
      mysqlQuery(payinSql, [...params]),
      mysqlQuery(payoutSql, [...params]),
    ]);

    res.json({ payin, payout });
  } catch (err: any) {
    console.error('[Monitoring] by-commerce error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/by-method — Volumen por método de pago
router.get('/by-method', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    let sql = `SELECT method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error') THEN 1 ELSE 0 END) as rechazadas
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL AND created_at BETWEEN ? AND ?`;

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    if (commerce_id) { sql += ` AND commerce_id = ?`; params.push(Number(commerce_id)); }
    if (country) { sql += ` AND country = ?`; params.push(country); }

    sql += ` GROUP BY method ORDER BY monto DESC`;

    const results = await mysqlQuery(sql, params);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] by-method error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/approval-rate — Tasa de aprobación por método
router.get('/approval-rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id, country } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    let sql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as aprobadas,
      ROUND(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_aprobacion
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND status NOT IN ('new','created','pending')
      AND created_at BETWEEN ? AND ?`;

    const params: any[] = [from + ' 00:00:00', to + ' 23:59:59'];
    if (commerce_id) { sql += ` AND commerce_id = ?`; params.push(Number(commerce_id)); }
    if (country) { sql += ` AND country = ?`; params.push(country); }

    sql += ` GROUP BY method HAVING total >= 10 ORDER BY tasa_aprobacion ASC`;

    const results = await mysqlQuery(sql, params);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] approval-rate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/alerts — Alertas de inactividad y caídas
router.get('/alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Métodos sin transacciones en las últimas 3 horas
    const inactivitySql = `SELECT method, MAX(created_at) as ultima_transaccion,
      TIMESTAMPDIFF(HOUR, MAX(created_at), NOW()) as horas_inactivo
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY method
      HAVING horas_inactivo >= 3
      ORDER BY horas_inactivo DESC`;

    // Caídas: métodos con tasa de error > 50% en la última hora
    const dropSql = `SELECT method,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('error','bank_error','authentication_error') THEN 1 ELSE 0 END) as errores,
      ROUND(SUM(CASE WHEN status IN ('error','bank_error','authentication_error') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as tasa_error
      FROM payment WHERE deleted_at IS NULL AND method IS NOT NULL
      AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY method
      HAVING total >= 5 AND tasa_error > 50
      ORDER BY tasa_error DESC`;

    // Payouts lentos: tiempo promedio > 30 min
    const payoutTimeSql = `SELECT commerce_id, c.name as commerce_name,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min
      FROM withdrawal w LEFT JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.status = 'completed' AND w.date_success IS NOT NULL
      AND w.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY w.commerce_id, c.name
      HAVING tiempo_promedio_min > 30
      ORDER BY tiempo_promedio_min DESC`;

    const [inactivity, drops, payoutTime] = await Promise.all([
      mysqlQuery(inactivitySql),
      mysqlQuery(dropSql),
      mysqlQuery(payoutTimeSql),
    ]);

    res.json({ inactivity, drops, payoutTime });
  } catch (err: any) {
    console.error('[Monitoring] alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/payout-time — Tiempo de payouts por comercio
router.get('/payout-time', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query as any;
    const from = date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    const sql = `SELECT w.commerce_id, c.name as commerce_name,
      COUNT(*) as total,
      ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_promedio_min,
      ROUND(MIN(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_min,
      ROUND(MAX(TIMESTAMPDIFF(MINUTE, w.created_at, w.date_success)), 0) as tiempo_max
      FROM withdrawal w LEFT JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.status = 'completed' AND w.date_success IS NOT NULL
      AND w.created_at BETWEEN ? AND ?
      GROUP BY w.commerce_id, c.name
      ORDER BY tiempo_promedio_min DESC`;

    const results = await mysqlQuery(sql, [from + ' 00:00:00', to + ' 23:59:59']);
    res.json(results);
  } catch (err: any) {
    console.error('[Monitoring] payout-time error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/methods-by-commerce — MDP activos por comercio (matriz)
router.get('/methods-by-commerce', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Payin: métodos usados por comercio en los últimos 30 días
    const payinSql = `SELECT p.commerce_id, c.name as commerce_name, p.method,
      COUNT(*) as transacciones
      FROM payment p LEFT JOIN commerce c ON c.id = p.commerce_id
      WHERE p.deleted_at IS NULL AND p.method IS NOT NULL
      AND p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND p.status = 'completed'
      GROUP BY p.commerce_id, c.name, p.method
      ORDER BY c.name, p.method`;

    // Payout: métodos usados por comercio
    const payoutSql = `SELECT w.commerce_id, c.name as commerce_name, w.type as method,
      COUNT(*) as transacciones
      FROM withdrawal w LEFT JOIN commerce c ON c.id = w.commerce_id
      WHERE w.deleted_at IS NULL AND w.type IS NOT NULL
      AND w.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND w.status = 'completed'
      GROUP BY w.commerce_id, c.name, w.type
      ORDER BY c.name, w.type`;

    const [payin, payout] = await Promise.all([
      mysqlQuery(payinSql),
      mysqlQuery(payoutSql),
    ]);

    res.json({ payin, payout });
  } catch (err: any) {
    console.error('[Monitoring] methods-by-commerce error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/commerces — Lista de comercios para filtros
router.get('/commerces', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results = await mysqlQuery(
      `SELECT id, name, country FROM commerce WHERE deleted_at IS NULL AND enabled = 1 ORDER BY name`
    );
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/monitoring/countries — Lista de países
router.get('/countries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results = await mysqlQuery(
      `SELECT DISTINCT country FROM payment WHERE country IS NOT NULL AND deleted_at IS NULL ORDER BY country`
    );
    res.json(results.map((r: any) => r.country));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
