import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery, mysqlQueryCached, MysqlCache, getMysqlStats } from '../database/mysqlConnection';
import { query as pgQuery } from '../database/connection';

const router = Router();
router.use(authenticate);

// ─── Cache centralizado (usa mysqlCache global) ──────────────────────────────
const CACHE_5MIN = MysqlCache.TTL_SUMMARY;
const CACHE_30MIN = MysqlCache.TTL_STATIC;

// Helpers de compatibilidad que usan el cache centralizado
import { mysqlCache } from '../database/mysqlCache';
function getCached(key: string): any | null { return mysqlCache.get(key); }
function setCache(key: string, data: any, ttl: number): void { mysqlCache.set(key, data, ttl); }

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

    // Limitar a máximo 365 días para proteger la réplica
    const toDate = new Date(rawTo);
    const fromDate = new Date(rawFrom);
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    const from = diffDays > 365
      ? new Date(toDate.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : rawFrom;
    const to = rawTo;

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cid = Number(commerce_id);

    // Obtener moneda de la pasarela activa del comercio
    const gwCurRows = await mysqlQuery(
      `SELECT cur.isocode FROM commerce_gateway cg
       JOIN currency cur ON cur.id = cg.currency_id
       WHERE cg.commerce_id = ? AND cg.deleted_at IS NULL 
       AND (cg.status = 'active' OR cg.status = '1' OR cg.status = 1)
       AND cur.isocode IS NOT NULL LIMIT 1`, [cid]
    );
    const commerceRows = await mysqlQuery(`SELECT country FROM commerce WHERE id = ? LIMIT 1`, [cid]);
    const country = commerceRows[0]?.country || '';
    const currency = gwCurRows[0]?.isocode || COUNTRY_CURRENCY[country?.toUpperCase()] || 'USD';

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

// ─── GET /report-pdf — Genera PDF del informe de monitoreo
router.get('/report-pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to, commerce_id } = req.query as any;
    if (!commerce_id) return res.status(400).json({ error: 'commerce_id requerido' });

    const cid = Number(commerce_id);
    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    // Info del comercio
    const commerceRows = await mysqlQuery(`SELECT id, name, country FROM commerce WHERE id = ? LIMIT 1`, [cid]);
    if (!commerceRows.length) return res.status(404).json({ error: 'Comercio no encontrado' });
    const commerce = commerceRows[0];

    // Obtener moneda de la pasarela activa del comercio (no del país)
    const gatewayCurrencyRows = await mysqlQuery(
      `SELECT cur.isocode 
       FROM commerce_gateway cg
       JOIN currency cur ON cur.id = cg.currency_id
       WHERE cg.commerce_id = ? AND cg.deleted_at IS NULL 
       AND (cg.status = 'active' OR cg.status = '1' OR cg.status = 1)
       AND cur.isocode IS NOT NULL
       LIMIT 1`,
      [cid]
    );
    const currency = gatewayCurrencyRows[0]?.isocode || COUNTRY_CURRENCY[commerce.country?.toUpperCase()] || 'USD';
    const sym = currency === 'PEN' ? 'S/' : currency === 'CLP' ? '$' : currency === 'BRL' ? 'R$' : currency === 'MXN' ? '$' : currency === 'COP' ? '$' : '$';

    // Datos payin
    const payinSql = `SELECT method, status, COUNT(*) as cantidad
      FROM payment WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY method, status ORDER BY method, cantidad DESC`;
    const payinData = await mysqlQuery(payinSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Datos payout
    const payoutSql = `SELECT type as method, status, COUNT(*) as cantidad
      FROM withdrawal WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY type, status ORDER BY type, cantidad DESC`;
    const payoutData = await mysqlQuery(payoutSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Totales payin
    const payinTotalSql = `SELECT status, COUNT(*) as cantidad
      FROM payment WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY status ORDER BY cantidad DESC`;
    const payinTotals = await mysqlQuery(payinTotalSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Totales payout
    const payoutTotalSql = `SELECT status, COUNT(*) as cantidad
      FROM withdrawal WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
      GROUP BY status ORDER BY cantidad DESC`;
    const payoutTotals = await mysqlQuery(payoutTotalSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Volumen por método payin
    const payinVolSql = `SELECT method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','authentication_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM payment WHERE commerce_id = ? AND deleted_at IS NULL AND method IS NOT NULL AND created_at BETWEEN ? AND ?
      GROUP BY method ORDER BY monto DESC`;
    const payinVol = await mysqlQuery(payinVolSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Volumen por método payout
    const payoutVolSql = `SELECT type as method, COUNT(*) as cantidad, COALESCE(SUM(amount), 0) as monto,
      SUM(CASE WHEN status IN ('success','completed') THEN 1 ELSE 0 END) as aprobadas,
      SUM(CASE WHEN status IN ('error','canceled','expired','bank_error','rejected') THEN 1 ELSE 0 END) as rechazadas
      FROM withdrawal WHERE commerce_id = ? AND deleted_at IS NULL AND type IS NOT NULL AND created_at BETWEEN ? AND ?
      GROUP BY type ORDER BY monto DESC`;
    const payoutVol = await mysqlQuery(payoutVolSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // ─── NUEVO: Motivos de error Payin (por status + internal_state + método) ───
    const payinErrorsSql = `SELECT method, status, internal_state, method_detail,
      COUNT(*) as cantidad
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY method, status, internal_state, method_detail
      ORDER BY cantidad DESC
      LIMIT 50`;
    const payinErrors = await mysqlQuery(payinErrorsSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Resumen de motivos de rechazo Payin (agrupado solo por status + internal_state)
    const payinRejectReasonsSql = `SELECT 
      CONCAT(status, ' → ', COALESCE(internal_state, 'sin detalle')) as motivo,
      COUNT(*) as cantidad
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY motivo
      ORDER BY cantidad DESC
      LIMIT 20`;
    const payinRejectReasons = await mysqlQuery(payinRejectReasonsSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // ─── NUEVO: Motivos de error Payout (por status + internal_state + tipo) ───
    const payoutErrorsSql = `SELECT type as method, status, internal_state,
      COUNT(*) as cantidad
      FROM withdrawal
      WHERE commerce_id = ? AND deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY type, status, internal_state
      ORDER BY cantidad DESC
      LIMIT 50`;
    const payoutErrors = await mysqlQuery(payoutErrorsSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Resumen de motivos de rechazo Payout
    const payoutRejectReasonsSql = `SELECT 
      CONCAT(status, ' → ', COALESCE(internal_state, 'sin detalle')) as motivo,
      COUNT(*) as cantidad
      FROM withdrawal
      WHERE commerce_id = ? AND deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY motivo
      ORDER BY cantidad DESC
      LIMIT 20`;
    const payoutRejectReasons = await mysqlQuery(payoutRejectReasonsSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Generar PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=informe_monitoreo_${commerce.name.replace(/\s+/g, '_')}_${from}_${to}.pdf`);
    doc.pipe(res);

    // Header con fondo de color ProntoPaga
    doc.rect(0, 0, 595, 80).fill('#FC2B5F');
    doc.fontSize(22).fillColor('#FFFFFF').text('Informe de Monitoreo', 50, 25, { align: 'center' });
    doc.fontSize(10).fillColor('#FFFFFF').text('ProntoPaga — Sistema de Gestión de Comercios', 50, 52, { align: 'center' });
    doc.y = 100;

    // Info comercio
    doc.fontSize(14).fillColor('#111111').text(commerce.name);
    doc.fontSize(10).fillColor('#A0A0A0').text(`País: ${commerce.country} | Moneda: ${currency} | ID: ${commerce.id}`);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#333333').text(`Período: ${from}  →  ${to}`);
    doc.moveDown(0.8);

    // Línea separadora
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#A0A0A0').lineWidth(1).stroke();
    doc.moveDown(0.8);

    doc.fontSize(9).fillColor('#333333').text(
      'El presente informe reúne información relevante sobre el comportamiento de las transacciones durante el período analizado, incluyendo métricas de Payins y Payouts, porcentajes de uso de métodos de pago y detalle de estados transaccionales.',
      { align: 'justify' }
    );
    doc.moveDown(1.5);

    // ─── Payins Totales ───
    doc.rect(50, doc.y, 495, 22).fill('#FC2B5F');
    doc.fontSize(12).fillColor('#FFFFFF').text('  Payins', 50, doc.y + 5);
    doc.y += 30;

    const payinTotal = payinTotals.reduce((acc: number, r: any) => acc + Number(r.cantidad), 0);

    // Tabla con colores por status
    const STATUS_COLORS: Record<string, string> = {
      success: '#10B981', completed: '#10B981',
      canceled: '#F59E0B', expired: '#F97316',
      rejected: '#EF4444', error: '#EF4444',
      bank_error: '#DC2626', authentication_error: '#B91C1C',
      pending: '#6B7280', processing: '#3B82F6',
    };

    // ─── Función para dibujar gráfico circular (pie chart) ───
    const drawPieChart = (data: any[], total: number, centerX: number, centerY: number, radius: number, colors: Record<string, string>) => {
      if (total === 0 || data.length === 0) return;
      let startAngle = -Math.PI / 2; // Empezar desde arriba

      data.forEach((item: any) => {
        const value = Number(item.cantidad);
        const sliceAngle = (value / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        const color = colors[item.status] || colors[item.method] || '#6B7280';

        // Dibujar sector
        const x1 = centerX + radius * Math.cos(startAngle);
        const y1 = centerY + radius * Math.sin(startAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;

        doc.path(`M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`)
          .fill(color);

        // Etiqueta de porcentaje (solo si > 5%)
        const pct = (value / total * 100);
        if (pct >= 5) {
          const midAngle = startAngle + sliceAngle / 2;
          const labelRadius = radius * 0.65;
          const lx = centerX + labelRadius * Math.cos(midAngle);
          const ly = centerY + labelRadius * Math.sin(midAngle);
          doc.fontSize(7).fillColor('#FFFFFF').text(
            pct.toFixed(0) + '%',
            lx - 10, ly - 4, { width: 20, align: 'center' }
          );
        }

        startAngle = endAngle;
      });

      // Leyenda al lado del gráfico
      const legendX = centerX + radius + 20;
      let legendY = centerY - (data.length * 7);
      data.forEach((item: any) => {
        const color = colors[item.status] || colors[item.method] || '#6B7280';
        const pct = total > 0 ? (Number(item.cantidad) / total * 100).toFixed(1) : '0';
        doc.rect(legendX, legendY, 8, 8).fill(color);
        doc.fontSize(7).fillColor('#374151').text(
          `${item.status || item.method || 'N/A'} (${pct}%)`,
          legendX + 12, legendY, { width: 120 }
        );
        legendY += 12;
      });
    };

    // Dibujar gráfico circular de Payins
    const pieY = doc.y + 55;
    drawPieChart(payinTotals, payinTotal, 160, pieY, 50, STATUS_COLORS);

    // Texto resumen al lado derecho del pie
    doc.fontSize(9).fillColor('#111111');
    doc.text(`Total: ${payinTotal.toLocaleString()} transacciones`, 320, pieY - 20);
    const payinSuccess = payinTotals.find((r: any) => r.status === 'success' || r.status === 'completed');
    const payinSuccessCount = payinSuccess ? Number(payinSuccess.cantidad) : 0;
    const payinSuccessRate = payinTotal > 0 ? (payinSuccessCount / payinTotal * 100).toFixed(1) : '0';
    doc.fontSize(11).fillColor('#10B981').text(`${payinSuccessRate}% aprobadas`, 320, pieY - 5);
    const payinFailCount = payinTotal - payinSuccessCount;
    const payinFailRate = payinTotal > 0 ? (payinFailCount / payinTotal * 100).toFixed(1) : '0';
    doc.fontSize(9).fillColor('#EF4444').text(`${payinFailRate}% rechazadas/error`, 320, pieY + 12);

    doc.y = pieY + 65;
    doc.moveDown(0.5);

    const drawTable = (data: any[], total: number) => {
      const startX = 50;
      let y = doc.y;
      if (y > 700) { doc.addPage(); y = 50; doc.y = 50; }
      // Header row
      doc.rect(startX, y, 450, 16).fill('#F9FAFB');
      doc.fontSize(8).fillColor('#6B7280');
      doc.text('Estado', startX + 5, y + 4, { width: 170, lineBreak: false });
      doc.text('Cantidad', startX + 200, y + 4, { width: 100, align: 'right', lineBreak: false });
      doc.text('Porcentaje', startX + 320, y + 4, { width: 80, align: 'right', lineBreak: false });
      y += 20;

      doc.fontSize(9);
      data.forEach((r: any) => {
        if (y > 750) { doc.addPage(); y = 50; }
        const pct = total > 0 ? (Number(r.cantidad) / total * 100).toFixed(1) : '0.0';
        const color = STATUS_COLORS[r.status] || '#6B7280';
        // Color dot
        doc.circle(startX + 8, y + 6, 3).fill(color);
        doc.fillColor('#111827').text(r.status || 'N/A', startX + 16, y, { width: 170, lineBreak: false });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 200, y, { width: 100, align: 'right', lineBreak: false });
        doc.fillColor(color).text(pct + '%', startX + 320, y, { width: 80, align: 'right', lineBreak: false });
        // Mini bar
        const barWidth = Math.max(1, Number(pct) * 0.4);
        doc.rect(startX + 410, y + 3, barWidth, 7).fill(color);
        y += 16;
      });
      // Total row
      doc.rect(startX, y, 450, 16).fill('#F2F2F2');
      doc.fontSize(9).fillColor('#111111').font('Helvetica-Bold');
      doc.text('Total', startX + 5, y + 4, { width: 170, lineBreak: false });
      doc.text(String(total.toLocaleString()), startX + 200, y + 4, { width: 100, align: 'right', lineBreak: false });
      doc.text('100%', startX + 320, y + 4, { width: 80, align: 'right', lineBreak: false });
      doc.font('Helvetica');
      doc.y = y + 25;
    };

    drawTable(payinTotals, payinTotal);
    doc.moveDown(0.5);

    // Gráfico circular: distribución por método de pago (Payin)
    if ((payinVol as any[]).length > 0) {
      doc.fontSize(10).fillColor('#111111').text('Distribución por Método de Pago (Payin)');
      doc.moveDown(0.3);

      const METHOD_COLORS_PDF = ['#1E3A5F', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#EC4899'];
      const methodColorMap: Record<string, string> = {};
      (payinVol as any[]).forEach((r: any, i: number) => {
        methodColorMap[r.method] = METHOD_COLORS_PDF[i % METHOD_COLORS_PDF.length];
      });

      const totalPayinVol = (payinVol as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);
      const pieMethodY = doc.y + 55;

      // Dibujar pie chart de métodos
      if (totalPayinVol > 0) {
        let startAngle = -Math.PI / 2;
        const cx = 160, cy = pieMethodY, r = 48;

        (payinVol as any[]).forEach((item: any) => {
          const value = Number(item.cantidad);
          const sliceAngle = (value / totalPayinVol) * 2 * Math.PI;
          const endAngle = startAngle + sliceAngle;
          const color = methodColorMap[item.method] || '#6B7280';

          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const largeArc = sliceAngle > Math.PI ? 1 : 0;

          doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`).fill(color);

          const pct = (value / totalPayinVol * 100);
          if (pct >= 8) {
            const midAngle = startAngle + sliceAngle / 2;
            const lx = cx + r * 0.6 * Math.cos(midAngle);
            const ly = cy + r * 0.6 * Math.sin(midAngle);
            doc.fontSize(7).fillColor('#FFFFFF').text(pct.toFixed(0) + '%', lx - 10, ly - 4, { width: 20, align: 'center' });
          }
          startAngle = endAngle;
        });

        // Leyenda
        let ly = pieMethodY - ((payinVol as any[]).length * 6);
        (payinVol as any[]).forEach((item: any) => {
          const color = methodColorMap[item.method] || '#6B7280';
          const pct = totalPayinVol > 0 ? (Number(item.cantidad) / totalPayinVol * 100).toFixed(1) : '0';
          const methodLabel = (item.method || 'N/A').length > 20 ? (item.method || 'N/A').slice(0, 19) + '…' : (item.method || 'N/A');
          doc.rect(230, ly, 8, 8).fill(color);
          doc.fontSize(7).fillColor('#374151').text(`${methodLabel} — ${pct}%`, 242, ly, { width: 180 });
          ly += 12;
        });
      }

      doc.y = pieMethodY + 65;
      doc.moveDown(0.5);
    }

    // Volumen por método payin
    if (doc.y > 650) doc.addPage();
    doc.fontSize(11).fillColor('#111111').text('Volumen por Método de Pago (Payin)');
    doc.moveDown(0.3);
    {
      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 450, 14).fill('#F9FAFB');
      doc.fontSize(7).fillColor('#6B7280');
      doc.text('Método', startX + 5, y + 3, { width: 90 });
      doc.text('Trx', startX + 100, y + 3, { width: 50, align: 'right' });
      doc.text('Monto', startX + 160, y + 3, { width: 80, align: 'right' });
      doc.text('Aprobadas', startX + 250, y + 3, { width: 55, align: 'right' });
      doc.text('Rechazadas', startX + 315, y + 3, { width: 55, align: 'right' });
      doc.text('Tasa', startX + 385, y + 3, { width: 55, align: 'right' });
      y += 18;
      doc.fillColor('#111827').fontSize(8);
      (payinVol as any[]).forEach((r: any, idx: number) => {
        if (y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 2, 450, 14).fill('#FAFAFA');
        const t = Number(r.aprobadas) + Number(r.rechazadas);
        const rate = t > 0 ? (Number(r.aprobadas) / t * 100).toFixed(1) + '%' : 'N/A';
        const monto = Number(r.monto);
        const montoStr = monto >= 1000000 ? sym + (monto / 1000000).toFixed(2) + 'M' : monto >= 1000 ? sym + (monto / 1000).toFixed(1) + 'K' : sym + monto.toFixed(0);
        // Truncar nombre de método largo
        const methodName = (r.method || 'N/A').length > 14 ? (r.method || 'N/A').slice(0, 13) + '…' : (r.method || 'N/A');
        doc.fillColor('#111827').text(methodName, startX + 5, y, { width: 90, lineBreak: false });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 100, y, { width: 50, align: 'right', lineBreak: false });
        doc.text(montoStr, startX + 160, y, { width: 80, align: 'right', lineBreak: false });
        doc.fillColor('#10B981').text(String(Number(r.aprobadas).toLocaleString()), startX + 250, y, { width: 55, align: 'right', lineBreak: false });
        doc.fillColor('#EF4444').text(String(Number(r.rechazadas).toLocaleString()), startX + 315, y, { width: 55, align: 'right', lineBreak: false });
        const rateNum = parseFloat(rate);
        const rateColor = rateNum >= 80 ? '#10B981' : rateNum >= 50 ? '#F59E0B' : '#EF4444';
        doc.fillColor(rateColor).text(rate, startX + 385, y, { width: 55, align: 'right', lineBreak: false });
        y += 14;
      });
      doc.y = y + 10;
    }

    // ─── Payouts ───
    if (doc.y > 620) doc.addPage();
    doc.moveDown(1);
    doc.rect(50, doc.y, 495, 22).fill('#2B2B2B');
    doc.fontSize(12).fillColor('#FFFFFF').text('  Payouts', 50, doc.y + 5);
    doc.y += 30;

    const payoutTotal = payoutTotals.reduce((acc: number, r: any) => acc + Number(r.cantidad), 0);

    // Gráfico circular de Payouts
    const pieYPayout = doc.y + 55;
    drawPieChart(payoutTotals, payoutTotal, 160, pieYPayout, 50, STATUS_COLORS);

    doc.fontSize(9).fillColor('#111111');
    doc.text(`Total: ${payoutTotal.toLocaleString()} transacciones`, 320, pieYPayout - 20);
    const payoutSuccess = payoutTotals.find((r: any) => r.status === 'success' || r.status === 'completed');
    const payoutSuccessCount = payoutSuccess ? Number(payoutSuccess.cantidad) : 0;
    const payoutSuccessRate = payoutTotal > 0 ? (payoutSuccessCount / payoutTotal * 100).toFixed(1) : '0';
    doc.fontSize(11).fillColor('#10B981').text(`${payoutSuccessRate}% aprobadas`, 320, pieYPayout - 5);
    const payoutFailCount = payoutTotal - payoutSuccessCount;
    const payoutFailRate = payoutTotal > 0 ? (payoutFailCount / payoutTotal * 100).toFixed(1) : '0';
    doc.fontSize(9).fillColor('#EF4444').text(`${payoutFailRate}% rechazadas/error`, 320, pieYPayout + 12);

    doc.y = pieYPayout + 65;
    doc.moveDown(0.5);

    drawTable(payoutTotals, payoutTotal);
    doc.moveDown(0.5);

    // Volumen por método payout
    doc.fontSize(11).fillColor('#111111').text('Volumen por Método de Pago (Payout)');
    doc.moveDown(0.3);
    {
      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 450, 14).fill('#F9FAFB');
      doc.fontSize(7).fillColor('#6B7280');
      doc.text('Método', startX + 5, y + 3, { width: 90 });
      doc.text('Trx', startX + 100, y + 3, { width: 50, align: 'right' });
      doc.text('Monto', startX + 160, y + 3, { width: 80, align: 'right' });
      doc.text('Aprobadas', startX + 250, y + 3, { width: 55, align: 'right' });
      doc.text('Rechazadas', startX + 315, y + 3, { width: 55, align: 'right' });
      doc.text('Tasa', startX + 385, y + 3, { width: 55, align: 'right' });
      y += 18;
      doc.fillColor('#111827').fontSize(8);
      (payoutVol as any[]).forEach((r: any, idx: number) => {
        if (y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 2, 450, 14).fill('#FAFAFA');
        const t = Number(r.aprobadas) + Number(r.rechazadas);
        const rate = t > 0 ? (Number(r.aprobadas) / t * 100).toFixed(1) + '%' : 'N/A';
        const monto = Number(r.monto);
        const montoStr = monto >= 1000000 ? sym + (monto / 1000000).toFixed(2) + 'M' : monto >= 1000 ? sym + (monto / 1000).toFixed(1) + 'K' : sym + monto.toFixed(0);
        const methodName = (r.method || 'N/A').length > 14 ? (r.method || 'N/A').slice(0, 13) + '…' : (r.method || 'N/A');
        doc.fillColor('#111827').text(methodName, startX + 5, y, { width: 90, lineBreak: false });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 100, y, { width: 50, align: 'right', lineBreak: false });
        doc.text(montoStr, startX + 160, y, { width: 80, align: 'right', lineBreak: false });
        doc.fillColor('#10B981').text(String(Number(r.aprobadas).toLocaleString()), startX + 250, y, { width: 55, align: 'right', lineBreak: false });
        doc.fillColor('#EF4444').text(String(Number(r.rechazadas).toLocaleString()), startX + 315, y, { width: 55, align: 'right', lineBreak: false });
        const rateNum = parseFloat(rate);
        const rateColor = rateNum >= 80 ? '#10B981' : rateNum >= 50 ? '#F59E0B' : '#EF4444';
        doc.fillColor(rateColor).text(rate, startX + 385, y, { width: 55, align: 'right', lineBreak: false });
        y += 14;
      });
      doc.y = y + 10;
    }

    // ─── Gráfico de barras simulado — Tasa de aprobación ───
    if (doc.y > 550) doc.addPage();
    doc.moveDown(1.5);
    doc.rect(50, doc.y, 495, 22).fill('#F2F2F2');
    doc.fontSize(11).fillColor('#111111').text('  Tasa de Aprobación por Método (Payin)', 50, doc.y + 5);
    doc.y += 30;

    (payinVol as any[]).forEach((r: any) => {
      if (doc.y > 750) doc.addPage();
      const t = Number(r.aprobadas) + Number(r.rechazadas);
      const rate = t > 0 ? Number(r.aprobadas) / t * 100 : 0;
      const barColor = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
      const barWidth = Math.max(2, rate * 2.8);

      const methodLabel = (r.method || 'N/A').length > 14 ? (r.method || 'N/A').slice(0, 13) + '…' : (r.method || 'N/A');
      doc.fontSize(8).fillColor('#374151').text(methodLabel, 55, doc.y, { width: 100, lineBreak: false });
      doc.rect(160, doc.y + 1, barWidth, 10).fill(barColor);
      doc.fontSize(8).fillColor('#111827').text(rate.toFixed(1) + '%', 160 + barWidth + 5, doc.y, { lineBreak: false });
      doc.y += 16;
    });

    // ─── NUEVO: Motivos de Error — Payin ───
    if (doc.y > 450) doc.addPage();
    doc.moveDown(1.5);
    doc.rect(50, doc.y, 495, 22).fill('#991B1B');
    doc.fontSize(12).fillColor('#FFFFFF').text('  Motivos de Error — Payin', 50, doc.y + 5);
    doc.y += 30;

    if ((payinErrors as any[]).length === 0) {
      doc.fontSize(9).fillColor('#6B7280').text('No se registraron errores en el período seleccionado.');
      doc.moveDown(1);
    } else {
      const totalPayinErrors = (payinErrors as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);

      // ── Primero: Resumen de motivos de rechazo (% global) ──
      doc.fontSize(10).fillColor('#111111').text('Resumen de Motivos de Rechazo');
      doc.moveDown(0.3);
      const totalReasons = (payinRejectReasons as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);
      {
        const startX = 50;
        let y = doc.y;
        doc.rect(startX, y, 495, 14).fill('#FEF2F2');
        doc.fontSize(7).fillColor('#991B1B');
        doc.text('Motivo (estado → sub-estado)', startX + 5, y + 3, { width: 280 });
        doc.text('Cantidad', startX + 310, y + 3, { width: 70, align: 'right' });
        doc.text('% del total', startX + 390, y + 3, { width: 60, align: 'right' });
        y += 16;

        doc.fontSize(8);
        (payinRejectReasons as any[]).forEach((r: any, idx: number) => {
          if (y > 750) { doc.addPage(); y = 50; }
          if (idx % 2 === 0) doc.rect(startX, y - 1, 495, 13).fill('#FFFBFB');
          const pct = totalReasons > 0 ? (Number(r.cantidad) / totalReasons * 100).toFixed(1) : '0.0';
          const pctNum = parseFloat(pct);
          const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

          doc.fillColor('#374151').text(r.motivo || 'N/A', startX + 5, y, { width: 280 });
          doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 310, y, { width: 70, align: 'right' });
          doc.fillColor(pctColor).text(pct + '%', startX + 390, y, { width: 60, align: 'right' });

          // Barra proporcional
          const barW = Math.max(1, pctNum * 0.4);
          doc.rect(startX + 460, y + 2, barW, 7).fill(pctColor);
          y += 13;
        });
        doc.y = y + 15;
      }

      // ── Segundo: Detalle por método ──
      doc.fontSize(10).fillColor('#111111').text('Detalle por Método de Pago');
      doc.moveDown(0.3);

      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 495, 14).fill('#FEF2F2');
      doc.fontSize(7).fillColor('#991B1B');
      doc.text('Método', startX + 5, y + 3, { width: 100 });
      doc.text('Estado', startX + 110, y + 3, { width: 65 });
      doc.text('Sub-estado', startX + 180, y + 3, { width: 120 });
      doc.text('Cantidad', startX + 320, y + 3, { width: 60, align: 'right' });
      doc.text('% del total', startX + 390, y + 3, { width: 60, align: 'right' });
      y += 16;

      doc.fontSize(7.5);
      (payinErrors as any[]).forEach((r: any, idx: number) => {
        if (y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 1, 495, 13).fill('#FFFBFB');
        const pct = totalPayinErrors > 0 ? (Number(r.cantidad) / totalPayinErrors * 100).toFixed(1) : '0.0';
        const pctNum = parseFloat(pct);
        const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

        // Truncar nombre de método si es muy largo
        const methodName = (r.method || 'N/A').length > 16 ? (r.method || 'N/A').slice(0, 15) + '…' : (r.method || 'N/A');

        doc.fillColor('#111827').text(methodName, startX + 5, y, { width: 100 });
        doc.fillColor('#DC2626').text(r.status || 'N/A', startX + 110, y, { width: 65 });
        doc.fillColor('#374151').text(r.internal_state || 'sin detalle', startX + 180, y, { width: 120 });
        doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 320, y, { width: 60, align: 'right' });
        doc.fillColor(pctColor).text(pct + '%', startX + 390, y, { width: 60, align: 'right' });

        // Mini barra
        const barW = Math.max(1, pctNum * 0.4);
        doc.rect(startX + 460, y + 2, barW, 7).fill(pctColor);
        y += 13;
      });

      // Total errores
      doc.rect(startX, y, 495, 14).fill('#FEE2E2');
      doc.fontSize(8).fillColor('#991B1B').font('Helvetica-Bold');
      doc.text('Total errores', startX + 5, y + 3, { width: 200 });
      doc.text(String(totalPayinErrors.toLocaleString()), startX + 320, y + 3, { width: 60, align: 'right' });
      doc.text('100%', startX + 390, y + 3, { width: 60, align: 'right' });
      doc.font('Helvetica');
      doc.y = y + 25;
    }

    // ─── NUEVO: Motivos de Error — Payout ───
    if (doc.y > 450) doc.addPage();
    doc.moveDown(1);
    doc.rect(50, doc.y, 495, 22).fill('#78350F');
    doc.fontSize(12).fillColor('#FFFFFF').text('  Motivos de Error — Payout', 50, doc.y + 5);
    doc.y += 30;

    if ((payoutErrors as any[]).length === 0) {
      doc.fontSize(9).fillColor('#6B7280').text('No se registraron errores en el período seleccionado.');
      doc.moveDown(1);
    } else {
      const totalPayoutErrors = (payoutErrors as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);

      // ── Resumen de motivos de rechazo Payout ──
      doc.fontSize(10).fillColor('#111111').text('Resumen de Motivos de Rechazo');
      doc.moveDown(0.3);
      const totalPOReas = (payoutRejectReasons as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);
      {
        const startX = 50;
        let y = doc.y;
        doc.rect(startX, y, 495, 14).fill('#FFFBEB');
        doc.fontSize(7).fillColor('#78350F');
        doc.text('Motivo (estado → sub-estado)', startX + 5, y + 3, { width: 280 });
        doc.text('Cantidad', startX + 310, y + 3, { width: 70, align: 'right' });
        doc.text('% del total', startX + 390, y + 3, { width: 60, align: 'right' });
        y += 16;

        doc.fontSize(8);
        (payoutRejectReasons as any[]).forEach((r: any, idx: number) => {
          if (y > 750) { doc.addPage(); y = 50; }
          if (idx % 2 === 0) doc.rect(startX, y - 1, 495, 13).fill('#FFFEF5');
          const pct = totalPOReas > 0 ? (Number(r.cantidad) / totalPOReas * 100).toFixed(1) : '0.0';
          const pctNum = parseFloat(pct);
          const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

          doc.fillColor('#374151').text(r.motivo || 'N/A', startX + 5, y, { width: 280 });
          doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 310, y, { width: 70, align: 'right' });
          doc.fillColor(pctColor).text(pct + '%', startX + 390, y, { width: 60, align: 'right' });

          const barW = Math.max(1, pctNum * 0.4);
          doc.rect(startX + 460, y + 2, barW, 7).fill(pctColor);
          y += 13;
        });
        doc.y = y + 15;
      }

      // ── Detalle por método Payout ──
      doc.fontSize(10).fillColor('#111111').text('Detalle por Método');
      doc.moveDown(0.3);

      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 495, 14).fill('#FFFBEB');
      doc.fontSize(7).fillColor('#78350F');
      doc.text('Método', startX + 5, y + 3, { width: 100 });
      doc.text('Estado', startX + 110, y + 3, { width: 65 });
      doc.text('Sub-estado', startX + 180, y + 3, { width: 120 });
      doc.text('Cantidad', startX + 320, y + 3, { width: 60, align: 'right' });
      doc.text('% del total', startX + 390, y + 3, { width: 60, align: 'right' });
      y += 16;

      doc.fontSize(7.5);
      (payoutErrors as any[]).forEach((r: any, idx: number) => {
        if (y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 1, 495, 13).fill('#FFFEF5');
        const pct = totalPayoutErrors > 0 ? (Number(r.cantidad) / totalPayoutErrors * 100).toFixed(1) : '0.0';
        const pctNum = parseFloat(pct);
        const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

        const methodName = (r.method || 'N/A').length > 16 ? (r.method || 'N/A').slice(0, 15) + '…' : (r.method || 'N/A');

        doc.fillColor('#111827').text(methodName, startX + 5, y, { width: 100 });
        doc.fillColor('#B45309').text(r.status || 'N/A', startX + 110, y, { width: 65 });
        doc.fillColor('#374151').text(r.internal_state || 'sin detalle', startX + 180, y, { width: 120 });
        doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 320, y, { width: 60, align: 'right' });
        doc.fillColor(pctColor).text(pct + '%', startX + 390, y, { width: 60, align: 'right' });

        const barW = Math.max(1, pctNum * 0.4);
        doc.rect(startX + 460, y + 2, barW, 7).fill(pctColor);
        y += 13;
      });

      // Total errores
      doc.rect(startX, y, 495, 14).fill('#FEF3C7');
      doc.fontSize(8).fillColor('#78350F').font('Helvetica-Bold');
      doc.text('Total errores', startX + 5, y + 3, { width: 200 });
      doc.text(String(totalPayoutErrors.toLocaleString()), startX + 320, y + 3, { width: 60, align: 'right' });
      doc.text('100%', startX + 390, y + 3, { width: 60, align: 'right' });
      doc.font('Helvetica');
      doc.y = y + 25;
    }

    // ─── Conclusiones ───
    if (doc.y > 600) doc.addPage();
    doc.moveDown(1.5);
    doc.rect(50, doc.y, 495, 22).fill('#222222');
    doc.fontSize(11).fillColor('#FFFFFF').text('  Conclusiones', 50, doc.y + 5);
    doc.y += 30;
    doc.fontSize(9).fillColor('#374151');

    const totalPayinApproved = (payinVol as any[]).reduce((a: number, r: any) => a + Number(r.aprobadas), 0);
    const totalPayinRejected = (payinVol as any[]).reduce((a: number, r: any) => a + Number(r.rechazadas), 0);
    const payinRate = (totalPayinApproved + totalPayinRejected) > 0 ? (totalPayinApproved / (totalPayinApproved + totalPayinRejected) * 100).toFixed(1) : '0';

    const topPayinMethod = (payinVol as any[])[0]?.method || 'N/A';
    const topPayoutMethod = (payoutVol as any[])[0]?.method || 'N/A';

    // Top motivo de error
    const topPayinError = (payinErrors as any[])[0];
    const topPayoutError = (payoutErrors as any[])[0];
    const totalPayinErr = (payinErrors as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);
    const totalPayoutErr = (payoutErrors as any[]).reduce((a: number, r: any) => a + Number(r.cantidad), 0);

    const conclusions = [
      `• Durante el período ${from} al ${to} se procesaron ${payinTotal.toLocaleString()} transacciones de payin y ${payoutTotal.toLocaleString()} de payout.`,
      `• La tasa de aprobación general de payins fue de ${payinRate}%.`,
      `• El método de pago más utilizado en payin fue "${topPayinMethod}".`,
      topPayoutMethod !== 'N/A' ? `• El método de payout más utilizado fue "${topPayoutMethod}".` : '',
      totalPayinErr > 0 ? `• Se registraron ${totalPayinErr.toLocaleString()} errores en payin. El motivo principal fue "${topPayinError?.internal_state || topPayinError?.status || 'N/A'}" en método "${topPayinError?.method || 'N/A'}" (${topPayinError ? (Number(topPayinError.cantidad) / totalPayinErr * 100).toFixed(1) : 0}% de los errores).` : '',
      totalPayoutErr > 0 ? `• Se registraron ${totalPayoutErr.toLocaleString()} errores en payout. El motivo principal fue "${topPayoutError?.internal_state || topPayoutError?.status || 'N/A'}" en método "${topPayoutError?.method || 'N/A'}" (${topPayoutError ? (Number(topPayoutError.cantidad) / totalPayoutErr * 100).toFixed(1) : 0}% de los errores).` : '',
      `• Se recomienda revisar los métodos con tasa de aprobación inferior al 70% y los motivos de error recurrentes.`,
    ].filter(Boolean);

    conclusions.forEach(c => { doc.text(c); doc.moveDown(0.3); });

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888888').text(`Generado automáticamente por ProntoPaga CRM — ${new Date().toLocaleString('es-PE')}`, { align: 'center' });

    doc.end();
  } catch (err: any) {
    console.error('[Monitoring] report-pdf error:', err.message);
    res.status(500).json({ error: 'Error al generar PDF: ' + err.message });
  }
});

// ─── GET /acta-entrega-pdf — Genera Acta de Entrega de Certificación
router.get('/acta-entrega-pdf', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commerce_id, date_from, date_to } = req.query as any;
    if (!commerce_id) return res.status(400).json({ error: 'commerce_id requerido' });

    const cid = Number(commerce_id);
    const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = date_to || new Date().toISOString().slice(0, 10);

    // Info del comercio
    const commerceRows = await mysqlQuery(`SELECT id, name, country, slug, rut FROM commerce WHERE id = ? LIMIT 1`, [cid]);
    if (!commerceRows.length) return res.status(404).json({ error: 'Comercio no encontrado' });
    const commerce = commerceRows[0];

    // Pasarelas activas con ID y país
    const payinGateways = await mysqlQuery(
      `SELECT cg.id as config_id, gp.name, cg.country as gw_country, cur.isocode as currency
       FROM commerce_gateway cg
       JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       LEFT JOIN currency cur ON cur.id = cg.currency_id
       WHERE cg.commerce_id = ? AND cg.deleted_at IS NULL AND (cg.status = 'active' OR cg.status = '1' OR cg.status = 1)`, [cid]);
    const payoutGateways = await mysqlQuery(
      `SELECT cgw.id as config_id, gw.name, cgw.country as gw_country, cur.isocode as currency
       FROM commerce_gateway_withdrawal cgw
       JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       LEFT JOIN currency cur ON cur.id = cgw.currency_id
       WHERE cgw.commerce_id = ? AND cgw.deleted_at IS NULL AND (cgw.status = 'active' OR cgw.status = '1' OR cgw.status = 1)`, [cid]);

    // País de las pasarelas
    const gwCountries = [...new Set([
      ...(payinGateways as any[]).map(g => g.gw_country),
      ...(payoutGateways as any[]).map(g => g.gw_country),
    ])].filter(Boolean).join(', ');

    // Resumen transacciones PayIn - desglosado por status
    const payinByStatus = await mysqlQuery(
      `SELECT status, COUNT(*) as cantidad
       FROM payment WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
       GROUP BY status ORDER BY cantidad DESC`,
      [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Resumen transacciones PayOut - desglosado por status
    const payoutByStatus = await mysqlQuery(
      `SELECT status, COUNT(*) as cantidad
       FROM withdrawal WHERE commerce_id = ? AND deleted_at IS NULL AND created_at BETWEEN ? AND ?
       GROUP BY status ORDER BY cantidad DESC`,
      [cid, from + ' 00:00:00', to + ' 23:59:59']);

    // Primera transacción
    const firstTx = await mysqlQuery(
      `SELECT MIN(created_at) as first_tx FROM payment WHERE commerce_id = ? AND deleted_at IS NULL`, [cid]);

    // Info del CRM
    const crmMerchant = await pgQuery(
      `SELECT m.*, u.first_name || ' ' || u.last_name as assigned_name,
              ob.first_name || ' ' || ob.last_name as onboarding_name
       FROM merchants m
       LEFT JOIN users u ON m.assigned_to = u.id
       LEFT JOIN users ob ON m.onboarding_assigned_to = ob.id
       WHERE m.merchant_id = $1 LIMIT 1`, [String(cid)]);
    const crm = crmMerchant[0] || {};
    const paymentConfig = crm.payment_methods_detail || [];

    // Documentos de certificación del CRM
    const certDocs = crmMerchant[0]?.id ? await pgQuery(
      `SELECT name, file_path FROM documents WHERE merchant_id = $1 AND document_type = 'certification' ORDER BY created_at DESC`,
      [crmMerchant[0].id]) : [];
    const sandboxCert = certDocs.find((d: any) => d.name?.toLowerCase().includes('sandbox'));
    const prodCert = certDocs.find((d: any) => d.name?.toLowerCase().includes('productivo') || d.name?.toLowerCase().includes('production'));

    // Generar PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=acta_entrega_${commerce.name.replace(/\s+/g, '_')}_${to}.pdf`);
    doc.pipe(res);

    const X = 50;
    const W = 495;

    // Header
    doc.rect(0, 0, 595, 70).fill('#FC2B5F');
    doc.fontSize(18).fillColor('#FFFFFF').text('Acta de Entrega de Certificacion', X, 18, { align: 'center' });
    doc.fontSize(9).text('ProntoPaga - Onboarding', X, 42, { align: 'center' });
    doc.y = 85;

    doc.fontSize(8).fillColor('#6B7280').text(
      'En la presente acta se deja constancia de la entrega del resultado del proceso de certificacion tecnica del comercio, el cual ha sido integrado y monitoreado de acuerdo con los estandares establecidos por el area de Onboarding.',
      X, doc.y, { width: W });
    doc.moveDown(1.2);

    // Helpers
    const section = (title: string) => {
      if (doc.y > 710) doc.addPage();
      doc.moveDown(0.4);
      doc.rect(X, doc.y, W, 18).fill('#1F2937');
      doc.fontSize(9).fillColor('#FFFFFF').text('  ' + title, X, doc.y + 5, { lineBreak: false });
      doc.y += 24;
    };
    const field = (label: string, value: string) => {
      if (doc.y > 750) doc.addPage();
      const y = doc.y;
      doc.fontSize(8).fillColor('#6B7280').text(label + ':', X, y, { width: 180, lineBreak: false });
      doc.fontSize(8).fillColor('#111827').text(value || '___________________', X + 185, y, { width: 310, lineBreak: false });
      doc.y = y + 15;
    };

    // ─── Datos Generales ───
    section('Datos Generales del Comercio');
    field('ID del Comercio', String(commerce.id));
    field('Comercio', commerce.name);
    field('URL', crm.website || commerce.slug || '');
    field('Pais de operacion', gwCountries || commerce.country || '');
    field('Razon social', crm.legal_name || commerce.name || '');
    field('RUT/RUC/NIT', commerce.rut || crm.tax_id || '');
    field('Nivel de Riesgo', crm.risk_level || '');
    field('Rubro', crm.mcc_description || crm.industry || '');
    field('Sales engineer', crm.onboarding_name || '');
    field('KAM', crm.assigned_name || '');
    field('Canal de comunicacion', (() => {
      // Parsear del bloque _meta en notes
      try {
        const notesStr = crm.notes || '';
        const metaMatch = notesStr.match(/^\{\"_meta\":true.*?\}/s);
        if (metaMatch) {
          const meta = JSON.parse(metaMatch[0]);
          return meta.communication_channel || '';
        }
      } catch {}
      return '';
    })());
    field('Fecha salida a produccion', to);

    // Métodos de pago con ID
    // Métodos de pago - agrupados por nombre, sin duplicados
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#6B7280').text('Metodos de pago:', X, doc.y);
    doc.y += 14;

    // Agrupar Pay-In por nombre
    const payinGrouped = new Map<string, number[]>();
    (payinGateways as any[]).forEach(g => {
      const name = g.name || 'Sin nombre';
      if (!payinGrouped.has(name)) payinGrouped.set(name, []);
      payinGrouped.get(name)!.push(g.config_id);
    });

    // Agrupar Pay-Out por nombre
    const payoutGrouped = new Map<string, number[]>();
    (payoutGateways as any[]).forEach(g => {
      const name = g.name || 'Sin nombre';
      if (!payoutGrouped.has(name)) payoutGrouped.set(name, []);
      payoutGrouped.get(name)!.push(g.config_id);
    });

    doc.fontSize(8).fillColor('#3B82F6').text('  Pay-In:', X, doc.y);
    doc.y += 12;
    if (payinGrouped.size > 0) {
      payinGrouped.forEach((ids, name) => {
        if (doc.y > 750) doc.addPage();
        doc.fontSize(7).fillColor('#374151').text(`    - ${name}`, X, doc.y);
        doc.y += 11;
      });
    } else {
      doc.fontSize(7).fillColor('#6B7280').text('    Sin pasarelas activas', X, doc.y);
      doc.y += 11;
    }

    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#8B5CF6').text('  Pay-Out:', X, doc.y);
    doc.y += 12;
    if (payoutGrouped.size > 0) {
      payoutGrouped.forEach((ids, name) => {
        if (doc.y > 750) doc.addPage();
        doc.fontSize(7).fillColor('#374151').text(`    - ${name}`, X, doc.y);
        doc.y += 11;
      });
    } else {
      doc.fontSize(7).fillColor('#6B7280').text('    Sin pasarelas activas', X, doc.y);
      doc.y += 11;
    }
    doc.moveDown(0.8);

    // ─── Certificaciones (links a documentos subidos) ───
    section('Certificaciones');
    const baseUrl = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) 
      ? process.env.FRONTEND_URL 
      : 'https://crm-onboarding.online';

    // Obtener integration_partner del meta
    let integrationPartner = '';
    try {
      const notesStr = crm.notes || '';
      const metaMatch = notesStr.match(/^\{\"_meta\":true.*?\}/s);
      if (metaMatch) {
        const meta = JSON.parse(metaMatch[0]);
        integrationPartner = meta.integration_partner || '';
      }
    } catch {}

    if (sandboxCert) {
      doc.fontSize(8).fillColor('#F59E0B').text('  Sandbox: ', X, doc.y, { continued: true });
      doc.fillColor('#111827').text(sandboxCert.name || 'Certificacion Sandbox');
      doc.fontSize(7).fillColor('#3B82F6').text(`    ${baseUrl}/uploads/${sandboxCert.file_path}`, X, doc.y, { link: `${baseUrl}/uploads/${sandboxCert.file_path}` });
      doc.y += 12;
    } else if (integrationPartner) {
      doc.fontSize(8).fillColor('#F59E0B').text('  Sandbox: ', X, doc.y, { continued: true });
      doc.fillColor('#6B7280').text(`No se genera certificacion Sandbox - Integration Partner: ${integrationPartner}`);
      doc.y += 12;
    } else {
      doc.fontSize(8).fillColor('#6B7280').text('  Sandbox: No disponible', X, doc.y);
      doc.y += 12;
    }
    doc.moveDown(0.3);
    if (prodCert) {
      doc.fontSize(8).fillColor('#10B981').text('  Produccion: ', X, doc.y, { continued: true });
      doc.fillColor('#111827').text(prodCert.name || 'Certificacion Produccion');
      doc.fontSize(7).fillColor('#3B82F6').text(`    ${baseUrl}/uploads/${prodCert.file_path}`, X, doc.y, { link: `${baseUrl}/uploads/${prodCert.file_path}` });
      doc.y += 12;
    } else {
      doc.fontSize(8).fillColor('#6B7280').text('  Produccion: No disponible', X, doc.y);
      doc.y += 12;
    }
    doc.moveDown(0.8);

    // ─── Comisiones del CRM ───
    section('Comisiones Configuradas');
    if (paymentConfig.length > 0) {
      paymentConfig.forEach((pc: any) => {
        doc.fontSize(8).fillColor('#111827').text(`  ${pc.country_code || ''} ${pc.country_name || ''}`, X, doc.y);
        doc.y += 12;
        if (pc.pay_in?.length > 0) {
          doc.fontSize(7).fillColor('#3B82F6').text('    Pay-In:', X, doc.y); doc.y += 10;
          pc.pay_in.forEach((m: any) => {
            if (doc.y > 750) doc.addPage();
            const parts: string[] = [];
            if (m.commission) parts.push(`${m.commission}%`);
            if (m.tarifa_td) parts.push(`TD: ${m.tarifa_td}%`);
            if (m.tarifa_tc) parts.push(`TC: ${m.tarifa_tc}%`);
            if (m.tarifa_tf) parts.push(`TF: ${m.tarifa_tf}`);
            if (m.fee) parts.push(`Fee: ${m.fee}`);
            if (m.min_fee) parts.push(`Min: ${m.min_fee}`);
            const detail = parts.length > 0 ? parts.join(' | ') : 'Sin tarifa';
            doc.fontSize(7).fillColor('#374151').text(`      ${m.method_name || 'N/A'}: ${detail}`, X, doc.y);
            doc.y += 10;
          });
        }
        if (pc.pay_out?.length > 0) {
          doc.fontSize(7).fillColor('#8B5CF6').text('    Pay-Out:', X, doc.y); doc.y += 10;
          pc.pay_out.forEach((m: any) => {
            if (doc.y > 750) doc.addPage();
            const parts: string[] = [];
            if (m.commission) parts.push(`${m.commission}%`);
            if (m.fee) parts.push(`Fee: ${m.fee}`);
            if (m.min_fee) parts.push(`Min: ${m.min_fee}`);
            const detail = parts.length > 0 ? parts.join(' | ') : 'Sin tarifa';
            doc.fontSize(7).fillColor('#374151').text(`      ${m.method_name || 'N/A'}: ${detail}`, X, doc.y);
            doc.y += 10;
          });
        }
        doc.moveDown(0.3);
      });
    } else {
      doc.fontSize(8).fillColor('#6B7280').text('  Sin configuracion de comisiones en el CRM', X, doc.y);
      doc.y += 14;
    }
    doc.moveDown(0.5);

    // ─── Monitoreo ───
    section('Monitoreo en Produccion');
    field('Fecha inicio monitoreo', from);
    field('Fecha termino monitoreo', to);
    const firstDate = firstTx[0]?.first_tx ? new Date(firstTx[0].first_tx).toISOString().slice(0, 10) : '';
    field('Primera transaccion', firstDate);
    doc.moveDown(0.5);

    // ─── Resumen Transacciones desglosado con gráfico ───
    section('Resumen de Transacciones');

    // PayIn
    const piByStatus = payinByStatus as any[];
    const piTotal = piByStatus.reduce((a: number, r: any) => a + Number(r.cantidad), 0);

    doc.fontSize(9).fillColor('#3B82F6').text(`PayIn (${from} al ${to}) - Total: ${piTotal.toLocaleString()}`, X, doc.y);
    doc.y += 14;

    if (piTotal > 0) {
      // Gráfico circular PayIn
      const pieX = X + 60;
      const pieY = doc.y + 40;
      const pieR = 35;

      const STATUS_PIE_COLORS: Record<string, string> = {
        success: '#10B981', completed: '#10B981',
        expired: '#F97316', rejected: '#EF4444', error: '#EF4444',
        bank_error: '#DC2626', canceled: '#F59E0B', pending: '#6B7280',
        new: '#9CA3AF', processing: '#3B82F6', authentication_error: '#B91C1C',
      };

      let startAngle = -Math.PI / 2;
      piByStatus.forEach((s: any) => {
        const val = Number(s.cantidad);
        const sliceAngle = (val / piTotal) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        const color = STATUS_PIE_COLORS[s.status] || '#6B7280';
        const x1 = pieX + pieR * Math.cos(startAngle);
        const y1 = pieY + pieR * Math.sin(startAngle);
        const x2 = pieX + pieR * Math.cos(endAngle);
        const y2 = pieY + pieR * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        doc.path(`M ${pieX} ${pieY} L ${x1} ${y1} A ${pieR} ${pieR} 0 ${largeArc} 1 ${x2} ${y2} Z`).fill(color);
        startAngle = endAngle;
      });

      // Leyenda con desglose
      let ly = pieY - (piByStatus.length * 6);
      piByStatus.forEach((s: any) => {
        const pct = (Number(s.cantidad) / piTotal * 100).toFixed(1);
        const color = STATUS_PIE_COLORS[s.status] || '#6B7280';
        doc.rect(X + 120, ly, 8, 8).fill(color);
        doc.fontSize(7).fillColor('#374151').text(`${s.status}: ${pct}% (${Number(s.cantidad).toLocaleString()})`, X + 132, ly);
        ly += 11;
      });
      doc.y = Math.max(pieY + pieR + 10, ly + 5);
    }
    doc.moveDown(0.8);

    // PayOut
    if (doc.y > 550) doc.addPage();
    const poByStatus = payoutByStatus as any[];
    const poTotal = poByStatus.reduce((a: number, r: any) => a + Number(r.cantidad), 0);

    doc.fontSize(9).fillColor('#8B5CF6').text(`PayOut (${from} al ${to}) - Total: ${poTotal.toLocaleString()}`, X, doc.y);
    doc.y += 14;

    if (poTotal > 0) {
      const pieX2 = X + 60;
      const pieY2 = doc.y + 40;
      const pieR2 = 35;

      const STATUS_PIE_COLORS2: Record<string, string> = {
        success: '#10B981', completed: '#10B981',
        expired: '#F97316', rejected: '#EF4444', error: '#EF4444',
        bank_error: '#DC2626', canceled: '#F59E0B', pending: '#6B7280',
      };

      let startAngle2 = -Math.PI / 2;
      poByStatus.forEach((s: any) => {
        const val = Number(s.cantidad);
        const sliceAngle = (val / poTotal) * 2 * Math.PI;
        const endAngle = startAngle2 + sliceAngle;
        const color = STATUS_PIE_COLORS2[s.status] || '#6B7280';
        const x1 = pieX2 + pieR2 * Math.cos(startAngle2);
        const y1 = pieY2 + pieR2 * Math.sin(startAngle2);
        const x2 = pieX2 + pieR2 * Math.cos(endAngle);
        const y2 = pieY2 + pieR2 * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        doc.path(`M ${pieX2} ${pieY2} L ${x1} ${y1} A ${pieR2} ${pieR2} 0 ${largeArc} 1 ${x2} ${y2} Z`).fill(color);
        startAngle2 = endAngle;
      });

      let ly2 = pieY2 - (poByStatus.length * 6);
      poByStatus.forEach((s: any) => {
        const pct = (Number(s.cantidad) / poTotal * 100).toFixed(1);
        const color = STATUS_PIE_COLORS2[s.status] || '#6B7280';
        doc.rect(X + 120, ly2, 8, 8).fill(color);
        doc.fontSize(7).fillColor('#374151').text(`${s.status}: ${pct}% (${Number(s.cantidad).toLocaleString()})`, X + 132, ly2);
        ly2 += 11;
      });
      doc.y = Math.max(pieY2 + pieR2 + 10, ly2 + 5);
    }
    doc.moveDown(0.5);

    // ─── Observaciones ───
    section('Observaciones');
    doc.fontSize(8).fillColor('#6B7280').text('', X, doc.y);
    doc.y += 40;

    // Footer
    doc.moveDown(2);
    doc.fontSize(7).fillColor('#9CA3AF').text(
      `Generado por ProntoPaga CRM - ${new Date().toLocaleString('es-PE')}`, X, doc.y, { align: 'center', width: W });

    doc.end();
  } catch (err: any) {
    console.error('[Monitoring] acta-entrega-pdf error:', err.message);
    res.status(500).json({ error: 'Error al generar Acta: ' + err.message });
  }
});

// ─── GET /cache-stats — Estadísticas del cache y rate limiter
router.get('/cache-stats', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(getMysqlStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cache-clear — Limpiar cache manualmente
router.post('/cache-clear', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    mysqlCache.clear();
    res.json({ message: 'Cache limpiado exitosamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Legacy endpoints (para evitar 404 de JS cacheado viejo) ──────────────────
router.get('/by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/payout-time', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/methods-by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/commerce-info/:id', (_req: AuthenticatedRequest, res: Response) => res.json({}));

export default router;
