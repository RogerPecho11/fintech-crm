import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery, mysqlQueryCached, MysqlCache, getMysqlStats } from '../database/mysqlConnection';

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

    // Limitar a máximo 60 días para proteger la réplica
    const toDate = new Date(rawTo);
    const fromDate = new Date(rawFrom);
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    const from = diffDays > 60
      ? new Date(toDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : rawFrom;
    const to = rawTo;

    const cacheKey = `daily-vol:${from}:${to}:${commerce_id}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cid = Number(commerce_id);

    // Obtener moneda del comercio (usa cache de commerces si existe)
    const commerceRows = await mysqlQuery(`SELECT country FROM commerce WHERE id = ? LIMIT 1`, [cid]);
    const country = commerceRows[0]?.country || '';
    const currency = COUNTRY_CURRENCY[country?.toUpperCase()] || 'USD';

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
    const currency = COUNTRY_CURRENCY[commerce.country?.toUpperCase()] || 'USD';
    const sym = currency === 'PEN' ? 'S/' : currency === 'CLP' ? '$' : currency === 'BRL' ? 'R$' : '$';

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
    const payinErrorsSql = `SELECT method, status, internal_state,
      COUNT(*) as cantidad
      FROM payment
      WHERE commerce_id = ? AND deleted_at IS NULL
      AND status NOT IN ('success','completed','pending','new','created','processing')
      AND created_at BETWEEN ? AND ?
      GROUP BY method, status, internal_state
      ORDER BY cantidad DESC
      LIMIT 50`;
    const payinErrors = await mysqlQuery(payinErrorsSql, [cid, from + ' 00:00:00', to + ' 23:59:59']);

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

    const drawTable = (data: any[], total: number) => {
      const startX = 50;
      let y = doc.y;
      // Header row
      doc.rect(startX, y, 450, 16).fill('#F9FAFB');
      doc.fontSize(8).fillColor('#6B7280');
      doc.text('Estado', startX + 5, y + 4, { width: 170 });
      doc.text('Cantidad', startX + 200, y + 4, { width: 100, align: 'right' });
      doc.text('Porcentaje', startX + 320, y + 4, { width: 80, align: 'right' });
      y += 20;

      doc.fontSize(9);
      data.forEach((r: any) => {
        const pct = total > 0 ? (Number(r.cantidad) / total * 100).toFixed(1) : '0.0';
        const color = STATUS_COLORS[r.status] || '#6B7280';
        // Color dot
        doc.circle(startX + 8, y + 6, 3).fill(color);
        doc.fillColor('#111827').text(r.status || 'N/A', startX + 16, y, { width: 170 });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 200, y, { width: 100, align: 'right' });
        doc.fillColor(color).text(pct + '%', startX + 320, y, { width: 80, align: 'right' });
        // Mini bar
        const barWidth = Math.max(1, Number(pct) * 0.4);
        doc.rect(startX + 410, y + 3, barWidth, 7).fill(color);
        y += 16;
      });
      // Total row
      doc.rect(startX, y, 450, 16).fill('#F2F2F2');
      doc.fontSize(9).fillColor('#111111').font('Helvetica-Bold');
      doc.text('Total', startX + 5, y + 4, { width: 170 });
      doc.text(String(total.toLocaleString()), startX + 200, y + 4, { width: 100, align: 'right' });
      doc.text('100%', startX + 320, y + 4, { width: 80, align: 'right' });
      doc.font('Helvetica');
      doc.y = y + 25;
    };

    drawTable(payinTotals, payinTotal);
    doc.moveDown(0.5);

    // Volumen por método payin
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
        if (idx % 2 === 0) doc.rect(startX, y - 2, 450, 14).fill('#FAFAFA');
        const t = Number(r.aprobadas) + Number(r.rechazadas);
        const rate = t > 0 ? (Number(r.aprobadas) / t * 100).toFixed(1) + '%' : 'N/A';
        const monto = Number(r.monto);
        const montoStr = monto >= 1000000 ? sym + (monto / 1000000).toFixed(2) + 'M' : monto >= 1000 ? sym + (monto / 1000).toFixed(1) + 'K' : sym + monto.toFixed(0);
        doc.fillColor('#111827').text(r.method || 'N/A', startX + 5, y, { width: 90 });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 100, y, { width: 50, align: 'right' });
        doc.text(montoStr, startX + 160, y, { width: 80, align: 'right' });
        doc.fillColor('#10B981').text(String(Number(r.aprobadas).toLocaleString()), startX + 250, y, { width: 55, align: 'right' });
        doc.fillColor('#EF4444').text(String(Number(r.rechazadas).toLocaleString()), startX + 315, y, { width: 55, align: 'right' });
        const rateNum = parseFloat(rate);
        const rateColor = rateNum >= 80 ? '#10B981' : rateNum >= 50 ? '#F59E0B' : '#EF4444';
        doc.fillColor(rateColor).text(rate, startX + 385, y, { width: 55, align: 'right' });
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
        if (idx % 2 === 0) doc.rect(startX, y - 2, 450, 14).fill('#FAFAFA');
        const t = Number(r.aprobadas) + Number(r.rechazadas);
        const rate = t > 0 ? (Number(r.aprobadas) / t * 100).toFixed(1) + '%' : 'N/A';
        const monto = Number(r.monto);
        const montoStr = monto >= 1000000 ? sym + (monto / 1000000).toFixed(2) + 'M' : monto >= 1000 ? sym + (monto / 1000).toFixed(1) + 'K' : sym + monto.toFixed(0);
        doc.fillColor('#111827').text(r.method || 'N/A', startX + 5, y, { width: 90 });
        doc.text(String(Number(r.cantidad).toLocaleString()), startX + 100, y, { width: 50, align: 'right' });
        doc.text(montoStr, startX + 160, y, { width: 80, align: 'right' });
        doc.fillColor('#10B981').text(String(Number(r.aprobadas).toLocaleString()), startX + 250, y, { width: 55, align: 'right' });
        doc.fillColor('#EF4444').text(String(Number(r.rechazadas).toLocaleString()), startX + 315, y, { width: 55, align: 'right' });
        const rateNum = parseFloat(rate);
        const rateColor = rateNum >= 80 ? '#10B981' : rateNum >= 50 ? '#F59E0B' : '#EF4444';
        doc.fillColor(rateColor).text(rate, startX + 385, y, { width: 55, align: 'right' });
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
      const t = Number(r.aprobadas) + Number(r.rechazadas);
      const rate = t > 0 ? Number(r.aprobadas) / t * 100 : 0;
      const barColor = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
      const barWidth = Math.max(2, rate * 2.8);

      doc.fontSize(8).fillColor('#374151').text(r.method || 'N/A', 55, doc.y, { width: 100 });
      doc.rect(160, doc.y + 1, barWidth, 10).fill(barColor);
      doc.fontSize(8).fillColor('#111827').text(rate.toFixed(1) + '%', 160 + barWidth + 5, doc.y);
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

      // Header
      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 495, 14).fill('#FEF2F2');
      doc.fontSize(7).fillColor('#991B1B');
      doc.text('Método', startX + 5, y + 3, { width: 80 });
      doc.text('Estado', startX + 90, y + 3, { width: 80 });
      doc.text('Motivo (internal_state)', startX + 175, y + 3, { width: 160 });
      doc.text('Cantidad', startX + 350, y + 3, { width: 55, align: 'right' });
      doc.text('% del total', startX + 415, y + 3, { width: 60, align: 'right' });
      y += 18;

      doc.fontSize(8);
      (payinErrors as any[]).forEach((r: any, idx: number) => {
        if (doc.y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 2, 495, 14).fill('#FFFBFB');
        const pct = totalPayinErrors > 0 ? (Number(r.cantidad) / totalPayinErrors * 100).toFixed(1) : '0.0';
        const pctNum = parseFloat(pct);
        const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

        doc.fillColor('#111827').text(r.method || 'N/A', startX + 5, y, { width: 80 });
        doc.fillColor('#DC2626').text(r.status || 'N/A', startX + 90, y, { width: 80 });
        doc.fillColor('#374151').text(r.internal_state || 'Sin detalle', startX + 175, y, { width: 160 });
        doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 350, y, { width: 55, align: 'right' });
        doc.fillColor(pctColor).text(pct + '%', startX + 415, y, { width: 60, align: 'right' });

        // Mini barra de proporción
        const barW = Math.max(1, pctNum * 0.2);
        doc.rect(startX + 480, y + 3, barW, 6).fill(pctColor);
        y += 14;
      });

      // Total errores
      doc.rect(startX, y, 495, 14).fill('#FEE2E2');
      doc.fontSize(8).fillColor('#991B1B').font('Helvetica-Bold');
      doc.text('Total errores', startX + 5, y + 3, { width: 200 });
      doc.text(String(totalPayinErrors.toLocaleString()), startX + 350, y + 3, { width: 55, align: 'right' });
      doc.text('100%', startX + 415, y + 3, { width: 60, align: 'right' });
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

      const startX = 50;
      let y = doc.y;
      doc.rect(startX, y, 495, 14).fill('#FFFBEB');
      doc.fontSize(7).fillColor('#78350F');
      doc.text('Método', startX + 5, y + 3, { width: 80 });
      doc.text('Estado', startX + 90, y + 3, { width: 80 });
      doc.text('Motivo (internal_state)', startX + 175, y + 3, { width: 160 });
      doc.text('Cantidad', startX + 350, y + 3, { width: 55, align: 'right' });
      doc.text('% del total', startX + 415, y + 3, { width: 60, align: 'right' });
      y += 18;

      doc.fontSize(8);
      (payoutErrors as any[]).forEach((r: any, idx: number) => {
        if (doc.y > 750) { doc.addPage(); y = 50; }
        if (idx % 2 === 0) doc.rect(startX, y - 2, 495, 14).fill('#FFFEF5');
        const pct = totalPayoutErrors > 0 ? (Number(r.cantidad) / totalPayoutErrors * 100).toFixed(1) : '0.0';
        const pctNum = parseFloat(pct);
        const pctColor = pctNum >= 30 ? '#DC2626' : pctNum >= 15 ? '#F59E0B' : '#6B7280';

        doc.fillColor('#111827').text(r.method || 'N/A', startX + 5, y, { width: 80 });
        doc.fillColor('#B45309').text(r.status || 'N/A', startX + 90, y, { width: 80 });
        doc.fillColor('#374151').text(r.internal_state || 'Sin detalle', startX + 175, y, { width: 160 });
        doc.fillColor('#111827').text(String(Number(r.cantidad).toLocaleString()), startX + 350, y, { width: 55, align: 'right' });
        doc.fillColor(pctColor).text(pct + '%', startX + 415, y, { width: 60, align: 'right' });

        const barW = Math.max(1, pctNum * 0.2);
        doc.rect(startX + 480, y + 3, barW, 6).fill(pctColor);
        y += 14;
      });

      // Total errores
      doc.rect(startX, y, 495, 14).fill('#FEF3C7');
      doc.fontSize(8).fillColor('#78350F').font('Helvetica-Bold');
      doc.text('Total errores', startX + 5, y + 3, { width: 200 });
      doc.text(String(totalPayoutErrors.toLocaleString()), startX + 350, y + 3, { width: 55, align: 'right' });
      doc.text('100%', startX + 415, y + 3, { width: 60, align: 'right' });
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
