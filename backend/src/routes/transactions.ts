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
       WHERE is_deleted = 0
       ORDER BY name ASC
       LIMIT 200`
    );
    res.json(commerces);
  } catch (err: any) {
    console.error('[Transactions] Error fetching commerces:', err.message);
    res.status(500).json({ error: 'Error al conectar con la base de datos de transacciones.' });
  }
});

// ─── GET /api/v1/transactions/summary/:commerceId — resumen de movimientos
router.get('/summary/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to } = req.query as Record<string, string>;

  try {
    let dateFilter = '';
    const params: any[] = [commerceId];

    if (date_from) {
      dateFilter += ' AND cm.period_origin >= ?';
      params.push(date_from);
    }
    if (date_to) {
      dateFilter += ' AND cm.period_origin <= ?';
      params.push(date_to);
    }

    const summary = await mysqlQuery(
      `SELECT 
        cm.transaction_type,
        COUNT(*) as total_transactions,
        SUM(cm.amount) as total_amount,
        AVG(cm.amount) as avg_amount,
        MIN(cm.period_origin) as first_date,
        MAX(cm.period_origin) as last_date
       FROM commerce_movement cm
       WHERE cm.commerce_id = ? AND cm.is_reverse = 0 ${dateFilter}
       GROUP BY cm.transaction_type
       ORDER BY total_amount DESC`,
      params
    );

    const totals = await mysqlQuery(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(cm.amount) as total_amount,
        MIN(cm.period_origin) as first_date,
        MAX(cm.period_origin) as last_date
       FROM commerce_movement cm
       WHERE cm.commerce_id = ? AND cm.is_reverse = 0 ${dateFilter}`,
      params
    );

    res.json({ summary, totals: totals[0] || {} });
  } catch (err: any) {
    console.error('[Transactions] Error fetching summary:', err.message);
    res.status(500).json({ error: 'Error al consultar transacciones.' });
  }
});

// ─── GET /api/v1/transactions/movements/:commerceId — movimientos detallados
router.get('/movements/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to, page = '1', limit = '50' } = req.query as Record<string, string>;

  try {
    let dateFilter = '';
    const params: any[] = [commerceId];

    if (date_from) {
      dateFilter += ' AND cm.period_origin >= ?';
      params.push(date_from);
    }
    if (date_to) {
      dateFilter += ' AND cm.period_origin <= ?';
      params.push(date_to);
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    const movements = await mysqlQuery(
      `SELECT cm.id, cm.commerce_id, cm.amount, cm.transaction_type, cm.amount_type,
              cm.period_origin, cm.period_apply, cm.validation_status, cm.is_reverse,
              cm.comment, cm.created_at
       FROM commerce_movement cm
       WHERE cm.commerce_id = ? ${dateFilter}
       ORDER BY cm.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const countResult = await mysqlQuery(
      `SELECT COUNT(*) as total FROM commerce_movement cm WHERE cm.commerce_id = ? ${dateFilter}`,
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
