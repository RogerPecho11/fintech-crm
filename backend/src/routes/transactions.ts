import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery } from '../database/mysqlConnection';
import { query } from '../database/connection';
import nodemailer from 'nodemailer';

const router = Router();
router.use(authenticate);

// Helper: si date_to no tiene hora (solo fecha), agregar 23:59:59
function formatDateTo(val: string): string {
  if (!val) return val;
  // datetime-local format: 2026-05-11T14:30
  if (val.includes('T')) return val.replace('T', ' ') + ':59';
  return val + ' 23:59:59';
}
function formatDateFrom(val: string): string {
  if (!val) return val;
  if (val.includes('T')) return val.replace('T', ' ') + ':00';
  return val;
}

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

// ─── GET /api/v1/transactions/daily-trend — tendencia diaria para gráfico lineal
router.get('/daily-trend', async (req: AuthenticatedRequest, res: Response) => {
  const { ids, date_from, date_to } = req.query as Record<string, string>;

  if (!ids) return res.status(400).json({ error: 'ids es requerido' });

  try {
    const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idList.length === 0) return res.json({ data: [] });

    const placeholders = idList.map(() => '?').join(',');
    const params: any[] = [...idList];

    // Por defecto últimos 30 días
    let dateFilter = '';
    if (date_from) { dateFilter += ' AND p.created_at >= ?'; params.push(date_from); }
    else { dateFilter += ' AND p.created_at >= ?'; const d = new Date(); d.setDate(d.getDate() - 30); params.push(d.toISOString().slice(0, 10)); }
    if (date_to) { dateFilter += ' AND p.created_at <= ?'; params.push(formatDateTo(date_to)); }

    const data = await mysqlQuery(
      `SELECT 
        DATE(p.created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN p.status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN p.status != 'success' THEN 1 ELSE 0 END) as failed_count
       FROM payment p
       WHERE p.commerce_id IN (${placeholders}) AND p.deleted_at IS NULL ${dateFilter}
       GROUP BY DATE(p.created_at)
       ORDER BY date ASC`,
      params
    );

    res.json({ data });
  } catch (err: any) {
    console.error('[Transactions] Error fetching daily-trend:', err.message);
    res.status(500).json({ error: 'Error al consultar tendencia diaria.' });
  }
});

// ─── GET /api/v1/transactions/quick-summary/:commerceId — resumen rápido para popup hover
router.get('/quick-summary/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to } = req.query as Record<string, string>;

  try {
    const params: any[] = [commerceId];
    let dateFilter = '';

    if (date_from) { dateFilter += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to) { dateFilter += ' AND p.created_at <= ?'; params.push(formatDateTo(date_to)); }

    // Si no hay filtro de fecha, limitar a últimos 30 días por defecto
    if (!date_from && !date_to) {
      dateFilter += ' AND p.created_at >= ?';
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      params.push(thirtyDaysAgo.toISOString().slice(0, 10));
    }

    const totals = await mysqlQuery(
      `SELECT 
        COUNT(p.id) as total_transactions,
        COALESCE(SUM(p.amount), 0) as total_amount,
        MIN(p.created_at) as first_date,
        MAX(p.created_at) as last_date
       FROM payment p
       WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter}`,
      params
    );

    const params2: any[] = [commerceId];
    let dateFilter2 = '';
    if (date_from) { dateFilter2 += ' AND p.created_at >= ?'; params2.push(date_from); }
    if (date_to) { dateFilter2 += ' AND p.created_at <= ?'; params2.push(formatDateTo(date_to)); }
    if (!date_from && !date_to) {
      dateFilter2 += ' AND p.created_at >= ?';
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      params2.push(thirtyDaysAgo.toISOString().slice(0, 10));
    }

    const byStatus = await mysqlQuery(
      `SELECT 
        p.type,
        p.status,
        COUNT(*) as total_transactions,
        COALESCE(SUM(p.amount), 0) as total_amount
       FROM payment p
       WHERE p.commerce_id = ? AND p.deleted_at IS NULL ${dateFilter2}
       GROUP BY p.type, p.status
       ORDER BY total_transactions DESC
       LIMIT 20`,
      params2
    );

    const commerceInfo = await mysqlQuery(
      `SELECT c.name, c.country FROM commerce c WHERE c.id = ? LIMIT 1`,
      [commerceId]
    );

    const countryToCurrency: Record<string, string> = {
      'PE': 'PEN', 'CL': 'CLP', 'EC': 'USD', 'BR': 'BRL', 'MX': 'MXN', 'CO': 'COP', 'AR': 'ARS',
    };
    const country = commerceInfo[0]?.country || '';
    const currency = countryToCurrency[country?.toUpperCase()] || 'USD';
    const totalCount = Number(totals[0]?.total_transactions || 0);

    const summary = byStatus.map((s: any) => ({
      ...s,
      percentage: totalCount > 0 ? Math.round((Number(s.total_transactions) / totalCount) * 10000) / 100 : 0,
    }));

    const successCount = byStatus.filter((s: any) => s.status === 'success').reduce((acc: number, s: any) => acc + Number(s.total_transactions), 0);
    const pendingCount = byStatus.filter((s: any) => s.status === 'pending').reduce((acc: number, s: any) => acc + Number(s.total_transactions), 0);
    const failedCount = totalCount - successCount - pendingCount;

    res.json({
      name: commerceInfo[0]?.name || '',
      country,
      currency,
      total_transactions: totalCount,
      total_amount: Number(totals[0]?.total_amount || 0),
      first_date: totals[0]?.first_date || null,
      last_date: totals[0]?.last_date || null,
      success_count: successCount,
      pending_count: pendingCount,
      failed_count: failedCount,
      summary,
    });
  } catch (err: any) {
    console.error('[Transactions] Error fetching quick-summary:', err.message);
    res.status(500).json({ error: 'Error al consultar resumen.' });
  }
});

// ─── GET /api/v1/transactions/summary-multi — resumen de múltiples comercios seleccionados
router.get('/summary-multi', async (req: AuthenticatedRequest, res: Response) => {
  const { ids, date_from, date_to } = req.query as Record<string, string>;

  if (!ids) return res.status(400).json({ error: 'ids es requerido' });

  try {
    const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idList.length === 0) return res.json({ data: [] });

    const placeholders = idList.map(() => '?').join(',');
    const params: any[] = [...idList];

    let dateFilter = '';
    if (date_from) { dateFilter += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to) { dateFilter += ' AND p.created_at <= ?'; params.push(formatDateTo(date_to)); }

    const data = await mysqlQuery(
      `SELECT c.id, c.name, c.country,
              COUNT(p.id) as total_transactions,
              COALESCE(SUM(p.amount), 0) as total_amount,
              SUM(CASE WHEN p.status = 'success' THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
              SUM(CASE WHEN p.status NOT IN ('success','pending') THEN 1 ELSE 0 END) as failed_count
       FROM commerce c
       LEFT JOIN payment p ON p.commerce_id = c.id AND p.deleted_at IS NULL
       WHERE c.id IN (${placeholders}) AND (c.is_deleted IS NULL OR c.is_deleted = 0) ${dateFilter}
       GROUP BY c.id, c.name, c.country
       ORDER BY total_transactions DESC`,
      params
    );

    res.json({ data });
  } catch (err: any) {
    console.error('[Transactions] Error fetching summary-multi:', err.message);
    res.status(500).json({ error: 'Error al consultar resumen múltiple.' });
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
      params.push(formatDateTo(date_to));
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
      params.push(formatDateTo(date_to));
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
    // Query: comercios + monedas configuradas + moneda de gateway en una sola query
    const data = await mysqlQuery(
      `SELECT c.id, c.name, c.country, c.enabled,
              GROUP_CONCAT(DISTINCT cc_cur.isocode SEPARATOR ', ') as currencies,
              GROUP_CONCAT(DISTINCT cg_cur.isocode SEPARATOR ', ') as tx_currencies
       FROM commerce c
       LEFT JOIN commerce_currency cc ON cc.commerce_id = c.id
       LEFT JOIN currency cc_cur ON cc_cur.id = cc.currency_id
       LEFT JOIN commerce_gateway cg ON cg.commerce_id = c.id AND cg.deleted_at IS NULL
       LEFT JOIN currency cg_cur ON cg_cur.id = cg.currency_id
       WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
       GROUP BY c.id, c.name, c.country, c.enabled
       ORDER BY c.name ASC`
    );

    const txCurrencyMap: Record<number, string> = {};
    for (const c of data as any[]) {
      if (c.tx_currencies) txCurrencyMap[c.id] = c.tx_currencies;
    }

    // Generar Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Historial de Comercios');

    sheet.columns = [
      { header: 'ID Comercio', key: 'id', width: 12 },
      { header: 'Comercio', key: 'name', width: 35 },
      { header: 'País', key: 'country', width: 15 },
      { header: 'Estado del Comercio', key: 'status', width: 18 },
      { header: 'Monedas Configuradas', key: 'currencies', width: 25 },
      { header: 'Monedas Utilizadas en Transacciones', key: 'tx_currencies', width: 35 },
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
        tx_currencies: c.tx_currencies || '—',
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
router.get('/gateway-changes-export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query as Record<string, string>;

    let dateFilterPayIn = '';
    let dateFilterPayOut = '';
    const paramsPayIn: any[] = [];
    const paramsPayOut: any[] = [];

    if (date_from) {
      dateFilterPayIn += ' AND h.created_at >= ?';
      dateFilterPayOut += ' AND hw.created_at >= ?';
      paramsPayIn.push(date_from);
      paramsPayOut.push(date_from);
    }
    if (date_to) {
      dateFilterPayIn += ' AND h.created_at <= ?';
      dateFilterPayOut += ' AND hw.created_at <= ?';
      paramsPayIn.push(formatDateTo(date_to));
      paramsPayOut.push(formatDateTo(date_to));
    }

    const payInData = await mysqlQuery(
      `SELECT 
        h.id,
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay In' as flow_type,
        gp.name as gateway_name,
        h.type as change_type,
        h.description,
        h.created_by as modified_by,
        h.created_at as modified_at
       FROM history_update_commerce_gateway h
       JOIN commerce_gateway cg ON cg.id = h.commerce_gateway_id
       JOIN commerce c ON c.id = cg.commerce_id
       LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       WHERE h.deleted_at IS NULL${dateFilterPayIn}
       ORDER BY h.created_at DESC
       LIMIT 2000`,
      paramsPayIn
    );

    const payOutData = await mysqlQuery(
      `SELECT 
        hw.id,
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay Out' as flow_type,
        gw.name as gateway_name,
        hw.type as change_type,
        hw.description,
        hw.created_by as modified_by,
        hw.created_at as modified_at
       FROM history_update_commerce_gwithdrawal hw
       JOIN commerce_gateway_withdrawal cgw ON cgw.id = hw.commerce_gateway_withdrawal_id
       JOIN commerce c ON c.id = cgw.commerce_id
       LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       WHERE hw.deleted_at IS NULL${dateFilterPayOut}
       ORDER BY hw.created_at DESC
       LIMIT 2000`,
      paramsPayOut
    );

    const data = [...payInData, ...payOutData].sort((a: any, b: any) => 
      new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
    );

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cambios de Pasarelas');

    sheet.columns = [
      { header: 'ID Comercio', key: 'commerce_id', width: 12 },
      { header: 'Comercio', key: 'commerce_name', width: 30 },
      { header: 'País', key: 'commerce_country', width: 12 },
      { header: 'Flujo', key: 'flow_type', width: 10 },
      { header: 'Pasarela', key: 'gateway_name', width: 25 },
      { header: 'Tipo de Cambio', key: 'change_type', width: 20 },
      { header: 'Modificado por', key: 'modified_by', width: 20 },
      { header: 'Fecha Modificación', key: 'modified_at', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of data as any[]) {
      const r = sheet.addRow({
        commerce_id: row.commerce_id,
        commerce_name: row.commerce_name,
        commerce_country: row.commerce_country || '—',
        flow_type: row.flow_type,
        gateway_name: row.gateway_name || '—',
        change_type: row.change_type || '—',
        modified_by: row.modified_by || '—',
        modified_at: row.modified_at ? new Date(row.modified_at).toLocaleString('es-PE') : '—',
      });
      if (r.number % 2 === 0) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      const typeCell = r.getCell('flow_type');
      typeCell.font = { color: { argb: row.flow_type === 'Pay In' ? 'FF3B82F6' : 'FF8B5CF6' }, bold: true };
    }

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
    res.setHeader('Content-Disposition', `attachment; filename=cambios_pasarelas_${new Date().toISOString().slice(0,10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

    // Enviar el mismo Excel por correo al equipo de onboarding (async, no bloquea la respuesta)
    setImmediate(async () => {
      try {
        const configRow = await query('SELECT value FROM app_config WHERE key = $1', ['gateway_report_emails']);
        const emails: string[] = configRow[0]?.value || [];
        if (!emails.length) return;

        const buffer = await workbook.xlsx.writeBuffer();
        const dateLabel = date_from && date_to ? `${date_from} a ${date_to}` : date_from ? `desde ${date_from}` : date_to ? `hasta ${date_to}` : new Date().toISOString().slice(0, 10);

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'gtxm1326.siteground.biz',
          port: parseInt(process.env.SMTP_PORT || '465'),
          secure: true,
          auth: {
            user: process.env.SMTP_USER || 'gestion@certificaciones.prontopaga.com',
            pass: process.env.SMTP_PASS || 'uf146%4J^9~1',
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
        });

        await transporter.sendMail({
          from: process.env.EMAIL_FROM || 'gestion@certificaciones.prontopaga.com',
          to: emails.join(', '),
          subject: `[ProntoPaga] Reporte Cambios de Pasarelas — ${dateLabel}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#FC2B5F;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="color:white;margin:0;font-size:16px;">ProntoPaga — Cambios de Pasarelas</h2>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-radius:0 0 8px 8px;">
                <p>Se adjunta el reporte de cambios de pasarelas (${data.length} registros).</p>
                <p style="color:#6B7280;font-size:12px;">Período: ${dateLabel}</p>
              </div>
            </div>`,
          attachments: [{
            filename: `cambios_pasarelas_${new Date().toISOString().slice(0, 10)}.xlsx`,
            content: buffer as Buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }],
        });

        console.log(`[GatewayExport] Email enviado a ${emails.join(', ')}`);
      } catch (emailErr: any) {
        console.error('[GatewayExport] Error enviando email:', emailErr.message);
      }
    });
  } catch (err: any) {
    console.error('[Transactions] Error generating gateway export:', err.message);
    res.status(500).json({ error: 'Error al generar reporte: ' + err.message });
  }
});

// ─── POST /api/v1/transactions/gateway-report-test — Enviar correo de prueba
router.post('/gateway-report-test', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { sendDailyGatewayReport } = require('../services/gatewayReportService');
    await sendDailyGatewayReport();
    res.json({ message: 'Correo de prueba enviado correctamente.' });
  } catch (err: any) {
    console.error('[Transactions] Error sending test report:', err.message);
    res.status(500).json({ error: 'Error al enviar correo: ' + err.message });
  }
});

export default router;
