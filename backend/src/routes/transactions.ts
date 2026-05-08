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
    // Query simple: comercios + monedas configuradas en una sola query
    const data = await mysqlQuery(
      `SELECT c.id, c.name, c.country, c.enabled,
              GROUP_CONCAT(DISTINCT cur.isocode SEPARATOR ', ') as currencies
       FROM commerce c
       LEFT JOIN commerce_currency cc ON cc.commerce_id = c.id
       LEFT JOIN currency cur ON cur.id = cc.currency_id
       WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
       GROUP BY c.id, c.name, c.country, c.enabled
       ORDER BY c.name ASC`
    );

    // Generar Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Historial de Comercios');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Nombre del Comercio', key: 'name', width: 35 },
      { header: 'País de Origen', key: 'country', width: 15 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Monedas Configuradas', key: 'currencies', width: 30 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;

    for (const c of data as any[]) {
      const row = sheet.addRow({
        id: c.id,
        name: c.name,
        country: c.country || '—',
        status: c.enabled ? 'Habilitado' : 'Deshabilitado',
        currencies: c.currencies || '—',
      });
      // Color alterno en filas
      if (row.number % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      // Color estado
      const statusCell = row.getCell('status');
      if (c.enabled) {
        statusCell.font = { color: { argb: 'FF16A34A' }, bold: true };
      } else {
        statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
      }
    }

    // Bordes
    sheet.eachRow((row: any) => {
      row.eachCell((cell: any) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=historial_comercios_${new Date().toISOString().slice(0,10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Transactions] Error generating history export:', err.message);
    res.status(500).json({ error: 'Error al generar el reporte: ' + err.message });
  }
});

// ─── GET /api/v1/transactions/gateway-changes — Reporte de cambios en pasarelas
router.get('/gateway-changes', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await mysqlQuery(
      `SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay In' as type,
        gp.name as gateway_name,
        cg.status as gateway_status,
        cg.updated_at as last_modified,
        cg.created_at
       FROM commerce_gateway cg
       JOIN commerce c ON c.id = cg.commerce_id
       LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       WHERE cg.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)
       
       UNION ALL
       
       SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay Out' as type,
        gw.name as gateway_name,
        cgw.status as gateway_status,
        cgw.updated_at as last_modified,
        cgw.created_at
       FROM commerce_gateway_withdrawal cgw
       JOIN commerce c ON c.id = cgw.commerce_id
       LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       WHERE cgw.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)
       
       ORDER BY last_modified DESC
       LIMIT 500`
    );

    res.json(data);
  } catch (err: any) {
    console.error('[Transactions] Error fetching gateway changes:', err.message);
    res.status(500).json({ error: 'Error al consultar cambios de pasarelas: ' + err.message });
  }
});

// ─── GET /api/v1/transactions/gateway-changes-export — Excel de cambios en pasarelas
router.get('/gateway-changes-export', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await mysqlQuery(
      `SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay In' as type,
        gp.name as gateway_name,
        cg.status as gateway_status,
        cg.updated_at as last_modified,
        cg.created_at
       FROM commerce_gateway cg
       JOIN commerce c ON c.id = cg.commerce_id
       LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       WHERE cg.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)
       
       UNION ALL
       
       SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay Out' as type,
        gw.name as gateway_name,
        cgw.status as gateway_status,
        cgw.updated_at as last_modified,
        cgw.created_at
       FROM commerce_gateway_withdrawal cgw
       JOIN commerce c ON c.id = cgw.commerce_id
       LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       WHERE cgw.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)
       
       ORDER BY last_modified DESC`
    );

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cambios de Pasarelas');

    sheet.columns = [
      { header: 'ID Comercio', key: 'commerce_id', width: 12 },
      { header: 'Comercio', key: 'commerce_name', width: 30 },
      { header: 'País', key: 'commerce_country', width: 12 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Pasarela', key: 'gateway_name', width: 25 },
      { header: 'Estado', key: 'gateway_status', width: 12 },
      { header: 'Última Modificación', key: 'last_modified', width: 20 },
      { header: 'Fecha Creación', key: 'created_at', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of data as any[]) {
      const r = sheet.addRow({
        commerce_id: row.commerce_id,
        commerce_name: row.commerce_name,
        commerce_country: row.commerce_country || '—',
        type: row.type,
        gateway_name: row.gateway_name || '—',
        gateway_status: row.gateway_status ? 'Activo' : 'Inactivo',
        last_modified: row.last_modified ? new Date(row.last_modified).toLocaleString('es-PE') : '—',
        created_at: row.created_at ? new Date(row.created_at).toLocaleString('es-PE') : '—',
      });
      if (r.number % 2 === 0) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      const statusCell = r.getCell('gateway_status');
      statusCell.font = { color: { argb: row.gateway_status ? 'FF16A34A' : 'FFDC2626' }, bold: true };
      const typeCell = r.getCell('type');
      typeCell.font = { color: { argb: row.type === 'Pay In' ? 'FF3B82F6' : 'FF8B5CF6' }, bold: true };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cambios_pasarelas_${new Date().toISOString().slice(0,10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Transactions] Error generating gateway export:', err.message);
    res.status(500).json({ error: 'Error al generar reporte: ' + err.message });
  }
});

export default router;
