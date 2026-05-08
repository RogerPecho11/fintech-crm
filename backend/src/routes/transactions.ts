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
      `SELECT c.country FROM commerce c WHERE c.id = ? LIMIT 1`,
      [commerceId]
    );

    // Mapear país a moneda
    const countryToCurrency: Record<string, string> = {
      'PE': 'PEN', 'CL': 'CLP', 'EC': 'USD', 'BR': 'BRL', 'MX': 'MXN', 'CO': 'COP', 'AR': 'ARS',
    };
    const country = commerceInfo[0]?.country || '';
    const currency = countryToCurrency[country?.toUpperCase()] || 'USD';
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

// ─── GET /api/v1/transactions/history-export — Excel con historial de comercios
router.get('/history-export', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Obtener todos los comercios con su estado
    const commerces = await mysqlQuery(
      `SELECT c.id, c.name, c.country, c.enabled
       FROM commerce c
       WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
       ORDER BY c.name ASC`
    );

    // Obtener monedas configuradas por comercio
    let configuredCurrencies: any[] = [];
    try {
      configuredCurrencies = await mysqlQuery(
        `SELECT cc.commerce_id, cur.isocode as currency_code
         FROM commerce_currency cc
         JOIN currency cur ON cur.id = cc.currency_id
         LIMIT 5000`
      );
    } catch { /* tabla puede no existir o estar vacía */ }

    // Obtener monedas usadas en transacciones (solo últimos 6 meses para performance)
    const usedCurrencies = await mysqlQuery(
      `SELECT p.commerce_id, cur.isocode as currency_code
       FROM payment p
       JOIN currency cur ON cur.id = p.currency_id
       WHERE p.deleted_at IS NULL AND p.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY p.commerce_id, cur.isocode
       LIMIT 5000`
    );

    // Mapear monedas configuradas por commerce_id
    const configMap: Record<number, Set<string>> = {};
    for (const row of configuredCurrencies as any[]) {
      if (!configMap[row.commerce_id]) configMap[row.commerce_id] = new Set();
      configMap[row.commerce_id].add(row.currency_code);
    }

    // Mapear monedas usadas por commerce_id
    const usedMap: Record<number, Set<string>> = {};
    for (const row of usedCurrencies as any[]) {
      if (!usedMap[row.commerce_id]) usedMap[row.commerce_id] = new Set();
      usedMap[row.commerce_id].add(row.currency_code);
    }

    // Generar Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Historial de Comercios');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Nombre del Comercio', key: 'name', width: 35 },
      { header: 'País de Origen', key: 'country', width: 15 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Monedas Configuradas', key: 'configured_currencies', width: 25 },
      { header: 'Monedas en Transacciones', key: 'used_currencies', width: 25 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const c of commerces as any[]) {
      sheet.addRow({
        id: c.id,
        name: c.name,
        country: c.country || '—',
        status: c.enabled ? 'Habilitado' : 'Deshabilitado',
        configured_currencies: configMap[c.id] ? Array.from(configMap[c.id]).join(', ') : '—',
        used_currencies: usedMap[c.id] ? Array.from(usedMap[c.id]).join(', ') : '—',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=historial_comercios_${new Date().toISOString().slice(0,10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Transactions] Error generating history export:', err.message);
    res.status(500).json({ error: 'Error al generar el reporte.' });
  }
});

export default router;
