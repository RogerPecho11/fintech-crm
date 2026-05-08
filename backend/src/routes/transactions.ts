import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/transactions/commerces — lista comercios de la BD de transacciones
router.get('/commerces', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const commerces = await mysqlQuery(
      `SELECT id, name, slug, rut, country, enabled, created_at
       FROM commerce
       WHERE (is_deleted IS NULL OR is_deleted = 0)
       ORDER BY name ASC
       LIMIT 200`
    );
    res.json(commerces);
  } catch (err: any) {
    console.error('[Transactions] Error fetching commerces:', err.message);
    res.status(500).json({ error: 'Error al conectar con la base de datos de transacciones.' });
  }
});

// ─── GET /api/v1/transactions/summary/:commerceId — resumen de pagos
router.get('/summary/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to } = req.query as Record<string, string>;

  try {
    let dateFilter = '';
    const params: any[] = [commerceId];

    if (date_from) {
      dateFilter += ' AND p.created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      dateFilter += ' AND p.created_at <= ?';
      params.push(date_to + ' 23:59:59');
    }

    const summary = await mysqlQuery(
      `SELECT 
        p.type,
        p.status,
        COUNT(*) as total_transactions,
        SUM(p.amount) as total_amount
       FROM payment p
       WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter}
       GROUP BY p.type, p.status
       ORDER BY total_transactions DESC`,
      params
    );

    const totals = await mysqlQuery(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(p.amount) as total_amount,
        MIN(p.created_at) as first_date,
        MAX(p.created_at) as last_date
       FROM payment p
       WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter}`,
      params
    );

    // Obtener moneda del comercio
    const commerceInfo = await mysqlQuery(
      `SELECT c.country, cc.code as currency_code
       FROM commerce c
       LEFT JOIN commerce_currency cc ON cc.commerce_id = c.id
       WHERE c.id = ?
       LIMIT 1`,
      [commerceId]
    );

    const currency = commerceInfo[0]?.currency_code || null;
    const totalCount = Number(totals[0]?.total_transactions || 0);

    // Agregar porcentaje a cada fila del summary
    const summaryWithPct = summary.map((s: any) => ({
      ...s,
      percentage: totalCount > 0 ? Math.round((Number(s.total_transactions) / totalCount) * 10000) / 100 : 0,
    }));

    res.json({ summary: summaryWithPct, totals: { ...totals[0], currency }, currency });
  } catch (err: any) {
    console.error('[Transactions] Error fetching summary:', err.message);
    res.status(500).json({ error: 'Error al consultar transacciones.' });
  }
});

// ─── GET /api/v1/transactions/movements/:commerceId — pagos detallados
router.get('/movements/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to, page = '1', limit = '50' } = req.query as Record<string, string>;

  try {
    let dateFilter = '';
    const params: any[] = [commerceId];

    if (date_from) {
      dateFilter += ' AND p.created_at >= ?';
      params.push(date_from);
    }
    if (date_to) {
      dateFilter += ' AND p.created_at <= ?';
      params.push(date_to + ' 23:59:59');
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    const movements = await mysqlQuery(
      `SELECT p.id, p.commerce_id, p.amount, p.type, p.method, p.status,
              p.reference, p.uid, p.country, p.created_at, p.internal_state
       FROM payment p
       WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter}
       ORDER BY p.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    const countResult = await mysqlQuery(
      `SELECT COUNT(*) as total FROM payment p WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter}`,
      params
    );

    res.json({
      data: movements,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err: any) {
    console.error('[Transactions] Error fetching movements:', err.message);
    res.status(500).json({ error: 'Error al consultar movimientos.' });
  }
});

export default router;
