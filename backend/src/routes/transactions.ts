import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { mysqlQuery, mysqlQueryCached, mysqlQueryPaginatedCached, MysqlCache, getMysqlStats, clearMysqlCache } from '../database/mysqlConnection';
import { mysqlCache } from '../database/mysqlCache';
import { query } from '../database/connection';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';

const router = Router();
router.use(authenticate);

// ─── Cache centralizado (usa mysqlCache global) ─────────────────────────────
function getCached(key: string): any | null { return mysqlCache.get(key); }
function setCache(key: string, data: any, ttl: number = MysqlCache.TTL_SUMMARY): void { mysqlCache.set(key, data, ttl); }

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
    const cacheKey = 'commerces';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const commerces = await mysqlQueryCached(
      'commerces-list',
      `SELECT id, name, slug, rut, country, enabled, created_at
       FROM commerce
       WHERE (is_deleted IS NULL OR is_deleted = 0)
       ORDER BY name ASC`,
      [],
      MysqlCache.TTL_STATIC // 30 min — comercios no cambian seguido
    );
    res.json(commerces);
  } catch (err: any) {
    console.error('[Transactions] Error fetching commerces:', err.message);
    res.status(500).json({ error: 'Error al conectar con la base de datos de transacciones.' });
  }
});

// ─── GET /api/v1/transactions/methods — lista métodos/pasarelas disponibles
router.get('/methods', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'methods';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Obtener métodos de pago con su país desde pagos recientes (últimos 90 días para velocidad)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const methods = await mysqlQuery(
      `SELECT DISTINCT p.method, p.country
       FROM payment p
       WHERE p.method IS NOT NULL AND p.method != '' AND p.created_at >= ?
       ORDER BY p.country ASC, p.method ASC`,
      [ninetyDaysAgo.toISOString().slice(0, 10)]
    );
    setCache(cacheKey, methods, 30 * 60 * 1000); // 30 min
    res.json(methods);
  } catch (err: any) {
    console.error('[Transactions] Error fetching methods:', err.message);
    res.status(500).json({ error: 'Error al consultar métodos.' });
  }
});

// ─── GET /api/v1/transactions/gateways — lista pasarelas reales (Pay In + Pay Out)
router.get('/gateways', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cacheKey = 'gateways-list';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Obtener pasarelas Pay In (gateway_payment) y Pay Out (gateway_withdrawal)
    const [payinGateways, payoutGateways] = await Promise.all([
      mysqlQuery(
        `SELECT DISTINCT gp.name
         FROM gateway_payment gp
         WHERE gp.name IS NOT NULL AND gp.name != ''
         ORDER BY gp.name ASC`
      ),
      mysqlQuery(
        `SELECT DISTINCT gw.name
         FROM gateway_withdrawal gw
         WHERE gw.name IS NOT NULL AND gw.name != ''
         ORDER BY gw.name ASC`
      ),
    ]);

    // Unificar nombres únicos
    const allNames = new Set<string>();
    (payinGateways as any[]).forEach((g: any) => allNames.add(g.name));
    (payoutGateways as any[]).forEach((g: any) => allNames.add(g.name));

    const gateways = [...allNames].sort().map(name => ({ name }));
    setCache(cacheKey, gateways, MysqlCache.TTL_STATIC); // 30 min
    res.json(gateways);
  } catch (err: any) {
    console.error('[Transactions] Error fetching gateways:', err.message);
    res.status(500).json({ error: 'Error al consultar pasarelas.' });
  }
});

// ─── GET /api/v1/transactions/daily-trend — tendencia diaria para gráfico lineal
router.get('/daily-trend', async (req: AuthenticatedRequest, res: Response) => {
  const { ids, date_from, date_to, method } = req.query as Record<string, string>;

  if (!ids) return res.status(400).json({ error: 'ids es requerido' });

  try {
    const cacheKey = `trend:${ids}:${date_from}:${date_to}:${method}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idList.length === 0) return res.json({ data: [] });

    const placeholders = idList.map(() => '?').join(',');
    const params: any[] = [...idList];

    // Por defecto últimos 30 días
    let dateFilter = '';
    if (date_from) { dateFilter += ' AND p.created_at >= ?'; params.push(date_from); }
    else { dateFilter += ' AND p.created_at >= ?'; const d = new Date(); d.setDate(d.getDate() - 30); params.push(d.toISOString().slice(0, 10)); }
    if (date_to) { dateFilter += ' AND p.created_at <= ?'; params.push(formatDateTo(date_to)); }
    if (method) {
      const methods = method.split(',').map(m => m.trim()).filter(Boolean);
      if (methods.length === 1) { dateFilter += ' AND p.method = ?'; params.push(methods[0]); }
      else if (methods.length > 1) { dateFilter += ` AND p.method IN (${methods.map(() => '?').join(',')})`; params.push(...methods); }
    }

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

    const result = { data };
    setCache(cacheKey, result);
    res.json(result);
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
    const cacheKey = `qs:${commerceId}:${date_from}:${date_to}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

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

    const result = {
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
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[Transactions] Error fetching quick-summary:', err.message);
    res.status(500).json({ error: 'Error al consultar resumen.' });
  }
});

// ─── GET /api/v1/transactions/summary-multi — resumen de múltiples comercios seleccionados
router.get('/summary-multi', async (req: AuthenticatedRequest, res: Response) => {
  const { ids, date_from, date_to, method } = req.query as Record<string, string>;

  if (!ids) return res.status(400).json({ error: 'ids es requerido' });

  try {
    const cacheKey = `multi:${ids}:${date_from}:${date_to}:${method}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idList.length === 0) return res.json({ data: [] });

    const placeholders = idList.map(() => '?').join(',');
    const params: any[] = [...idList];

    let dateFilter = '';
    if (date_from) { dateFilter += ' AND p.created_at >= ?'; params.push(date_from); }
    if (date_to) { dateFilter += ' AND p.created_at <= ?'; params.push(formatDateTo(date_to)); }
    if (method) {
      const methods = method.split(',').map(m => m.trim()).filter(Boolean);
      if (methods.length === 1) { dateFilter += ' AND p.method = ?'; params.push(methods[0]); }
      else if (methods.length > 1) { dateFilter += ` AND p.method IN (${methods.map(() => '?').join(',')})`; params.push(...methods); }
    }

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

    const result = { data };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('[Transactions] Error fetching summary-multi:', err.message);
    res.status(500).json({ error: 'Error al consultar resumen múltiple.' });
  }
});

// ─── GET /api/v1/transactions/summary/:commerceId — resumen de pagos
router.get('/summary/:commerceId', async (req: AuthenticatedRequest, res: Response) => {
  const { commerceId } = req.params;
  const { date_from, date_to, method } = req.query as Record<string, string>;

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
    if (method) {
      const methods = method.split(',').map(m => m.trim()).filter(Boolean);
      if (methods.length === 1) { dateFilter += ' AND p.method = ?'; params.push(methods[0]); }
      else if (methods.length > 1) { dateFilter += ` AND p.method IN (${methods.map(() => '?').join(',')})`; params.push(...methods); }
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
  const { date_from, date_to, method, page = '1', limit = '50' } = req.query as Record<string, string>;

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
    if (method) {
      const methods = method.split(',').map(m => m.trim()).filter(Boolean);
      if (methods.length === 1) { dateFilter += ' AND p.method = ?'; params.push(methods[0]); }
      else if (methods.length > 1) { dateFilter += ` AND p.method IN (${methods.map(() => '?').join(',')})`; params.push(...methods); }
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
    // Mapeo de código de país a nombre completo
    const COUNTRY_NAMES: Record<string, string> = {
      'PE': 'Perú', 'CL': 'Chile', 'BR': 'Brasil', 'MX': 'México', 'CO': 'Colombia',
      'EC': 'Ecuador', 'AR': 'Argentina', 'UY': 'Uruguay', 'PY': 'Paraguay', 'BO': 'Bolivia',
      'VE': 'Venezuela', 'PA': 'Panamá', 'CR': 'Costa Rica', 'GT': 'Guatemala', 'HN': 'Honduras',
      'SV': 'El Salvador', 'NI': 'Nicaragua', 'DO': 'República Dominicana', 'CU': 'Cuba',
      'US': 'Estados Unidos', 'CA': 'Canadá', 'ES': 'España', 'PT': 'Portugal',
      'CW': 'Curazao', 'PR': 'Puerto Rico', 'JM': 'Jamaica', 'TT': 'Trinidad y Tobago',
    };

    // Mapeo de código de moneda a nombre completo
    const CURRENCY_NAMES: Record<string, string> = {
      'PEN': 'Sol Peruano', 'CLP': 'Peso Chileno', 'BRL': 'Real Brasileño', 'MXN': 'Peso Mexicano',
      'COP': 'Peso Colombiano', 'USD': 'Dólar Americano', 'ARS': 'Peso Argentino', 'UYU': 'Peso Uruguayo',
      'PYG': 'Guaraní', 'BOB': 'Boliviano', 'EUR': 'Euro', 'GBP': 'Libra Esterlina',
      'VES': 'Bolívar', 'PAB': 'Balboa', 'CRC': 'Colón Costarricense', 'GTQ': 'Quetzal',
      'HNL': 'Lempira', 'DOP': 'Peso Dominicano', 'NIO': 'Córdoba', 'ANG': 'Florín',
      'UF': 'Unidad de Fomento',
    };

    // Query: comercios básicos
    const data = await mysqlQuery(
      `SELECT c.id, c.name, c.country, c.enabled
       FROM commerce c
       WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
       ORDER BY c.name ASC`
    );

    // Query: monedas de pasarelas ACTIVAS por comercio (Pay In)
    const payinCurrencies = await mysqlQuery(
      `SELECT cg.commerce_id, GROUP_CONCAT(DISTINCT cur.isocode SEPARATOR ', ') as currencies,
              GROUP_CONCAT(DISTINCT cg.country SEPARATOR ', ') as countries
       FROM commerce_gateway cg
       JOIN currency cur ON cur.id = cg.currency_id
       WHERE cg.deleted_at IS NULL 
       AND (cg.status = 'active' OR cg.status = '1' OR cg.status = 1)
       AND cur.isocode IS NOT NULL
       GROUP BY cg.commerce_id`
    );

    // Query: monedas de pasarelas ACTIVAS por comercio (Pay Out)
    const payoutCurrencies = await mysqlQuery(
      `SELECT cgw.commerce_id, GROUP_CONCAT(DISTINCT cur.isocode SEPARATOR ', ') as currencies,
              GROUP_CONCAT(DISTINCT cgw.country SEPARATOR ', ') as countries
       FROM commerce_gateway_withdrawal cgw
       JOIN currency cur ON cur.id = cgw.currency_id
       WHERE cgw.deleted_at IS NULL 
       AND (cgw.status = 'active' OR cgw.status = '1' OR cgw.status = 1)
       AND cur.isocode IS NOT NULL
       GROUP BY cgw.commerce_id`
    );

    // Mapa: commerce_id → monedas únicas de pasarelas activas (sin repetir)
    const currencyMap: Record<number, string> = {};
    const countryMap: Record<number, string> = {};
    for (const row of payinCurrencies as any[]) {
      const existingCur = currencyMap[row.commerce_id] ? currencyMap[row.commerce_id].split(', ') : [];
      const newCur = (row.currencies || '').split(', ').filter(Boolean);
      currencyMap[row.commerce_id] = [...new Set([...existingCur, ...newCur])].join(', ');

      const existingCountry = countryMap[row.commerce_id] ? countryMap[row.commerce_id].split(', ') : [];
      const newCountry = (row.countries || '').split(', ').filter(Boolean);
      countryMap[row.commerce_id] = [...new Set([...existingCountry, ...newCountry])].join(', ');
    }
    for (const row of payoutCurrencies as any[]) {
      const existingCur = currencyMap[row.commerce_id] ? currencyMap[row.commerce_id].split(', ') : [];
      const newCur = (row.currencies || '').split(', ').filter(Boolean);
      currencyMap[row.commerce_id] = [...new Set([...existingCur, ...newCur])].join(', ');

      const existingCountry = countryMap[row.commerce_id] ? countryMap[row.commerce_id].split(', ') : [];
      const newCountry = (row.countries || '').split(', ').filter(Boolean);
      countryMap[row.commerce_id] = [...new Set([...existingCountry, ...newCountry])].join(', ');
    }

    // Convertir códigos de moneda a nombres completos
    // Para pasarelas de Chile (CL), agregar UF como moneda adicional
    const currencyFullMap: Record<number, string> = {};
    for (const [id, codes] of Object.entries(currencyMap)) {
      const codeList = codes.split(', ').filter(Boolean);
      // Si tiene pasarelas en CL, agregar UF
      const countries = (countryMap[Number(id)] || '').split(', ');
      if (countries.includes('CL') && !codeList.includes('UF')) {
        codeList.push('UF');
      }
      const names = codeList.map(code => CURRENCY_NAMES[code] || code).join(', ');
      currencyFullMap[Number(id)] = names;
    }

    // Convertir códigos de país a nombres completos
    const countryFullMap: Record<number, string> = {};
    for (const [id, codes] of Object.entries(countryMap)) {
      const names = codes.split(', ').map(code => COUNTRY_NAMES[code] || code).filter(Boolean).join(', ');
      countryFullMap[Number(id)] = names;
    }

    // Generar Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Historial de Comercios');

    sheet.columns = [
      { header: 'ID Comercio', key: 'id', width: 12 },
      { header: 'Comercio', key: 'name', width: 35 },
      { header: 'País', key: 'country', width: 22 },
      { header: 'Estado del Comercio', key: 'status', width: 18 },
      { header: 'Monedas de Pasarelas Activas', key: 'active_currencies', width: 45 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;

    for (const c of data as any[]) {
      const row = sheet.addRow({
        id: c.id,
        name: c.name,
        country: countryFullMap[c.id] || COUNTRY_NAMES[c.country] || c.country || '—',
        status: c.enabled ? 'Habilitado' : 'Deshabilitado',
        active_currencies: currencyFullMap[c.id] || '—',
      });
      if (row.number % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
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

    // Auto-filtro
    if ((data as any[]).length > 0) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
    }

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

// ─── GET /api/v1/transactions/commerce-changes-export — Excel de cambios en configuración de comercios (MySQL réplica producción)
router.get('/commerce-changes-export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };

    let sql = `SELECT cc.*, c.name as commerce_name 
               FROM commerce_configuration cc 
               LEFT JOIN commerce c ON c.id = cc.commerce_id`;
    const params: any[] = [];

    const parseDate = (d: string): string => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      if (d.includes('T')) return d.split('T')[0];
      if (d.includes(' ')) return d.split(' ')[0];
      return d;
    };

    if (date_from && date_to) {
      const from = parseDate(date_from);
      const to = parseDate(date_to);
      sql += ` WHERE cc.updated_at BETWEEN ? AND ?`;
      params.push(from + ' 00:00:00', to + ' 23:59:59');
    } else if (date_from) {
      const from = parseDate(date_from);
      sql += ` WHERE cc.updated_at >= ?`;
      params.push(from + ' 00:00:00');
    } else if (date_to) {
      const to = parseDate(date_to);
      sql += ` WHERE cc.updated_at <= ?`;
      params.push(to + ' 23:59:59');
    }

    sql += ` ORDER BY cc.updated_at DESC`;
    console.log('[commerce-changes-export] SQL:', sql, 'Params:', params);

    const rows: any[] = await mysqlQuery(sql, params);

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM ProntoPaga';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Cambios Comercios');

    // Columnas en español
    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'ID Comercio', key: 'commerce_id', width: 12 },
      { header: 'Nombre Comercio', key: 'commerce_name', width: 30 },
      { header: 'Configuración', key: 'label', width: 35 },
      { header: 'Descripción', key: 'description', width: 50 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'Valor', key: 'content', width: 20 },
      { header: 'Cambio Realizado', key: 'change_summary', width: 55 },
      { header: 'Fecha Creación', key: 'created_at', width: 20 },
      { header: 'Fecha Modificación', key: 'updated_at', width: 20 },
    ];

    // Estilo header
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const formatDate = (d: any): string => {
      if (!d) return 'N/A';
      try {
        const date = new Date(d);
        return date.toLocaleString('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return String(d); }
    };

    const translateValue = (type: string, content: string): string => {
      if (type === 'boolean') return content === '1' ? 'Activado' : 'Desactivado';
      return content || 'N/A';
    };

    if (rows.length > 0) {
      for (const row of rows) {
        const wasModified = row.updated_at && row.created_at && new Date(row.updated_at).getTime() > new Date(row.created_at).getTime();
        const valor = translateValue(row.type, row.content);

        let changeSummary = '';
        if (wasModified) {
          changeSummary = `Se modificó "${row.description || row.label}" → ${valor}`;
        } else {
          changeSummary = `Se creó "${row.description || row.label}" → ${valor}`;
        }

        sheet.addRow({
          id: row.id,
          commerce_id: row.commerce_id,
          commerce_name: row.commerce_name || `Comercio #${row.commerce_id}`,
          label: row.label,
          description: row.description || 'N/A',
          type: row.type,
          content: valor,
          change_summary: changeSummary,
          created_at: formatDate(row.created_at),
          updated_at: formatDate(row.updated_at),
        });
      }

      // Auto-filtro
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };

      for (let i = 2; i <= rows.length + 1; i++) {
        sheet.getRow(i).alignment = { vertical: 'middle', wrapText: true };
      }
    } else {
      sheet.addRow({ id: 'No se encontraron registros para el rango seleccionado' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cambios_comercios_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Transactions] Error commerce-changes-export:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/v1/transactions/gateway-dashboard-export — Excel de pasarelas por comercio
router.get('/gateway-dashboard-export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { country, gateway, status, search } = req.query as Record<string, string>;

    let countryFilter = '';
    const params: any[] = [];
    if (country) {
      const countries = country.split(',').filter(Boolean);
      if (countries.length === 1) {
        countryFilter = ' AND c.country = ?';
        params.push(countries[0]);
      } else if (countries.length > 1) {
        countryFilter = ` AND c.country IN (${countries.map(() => '?').join(',')})`;
        params.push(...countries);
      }
    }

    const payinSql = `SELECT c.id as commerce_id, c.name as commerce_name, c.country,
      gp.name as gateway_name, gp.id as gateway_id, cg.status as gateway_status
      FROM commerce_gateway cg
      JOIN commerce c ON c.id = cg.commerce_id
      LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
      WHERE cg.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)${countryFilter}
      ORDER BY c.name, gp.name`;

    const payoutSql = `SELECT c.id as commerce_id, c.name as commerce_name, c.country,
      gw.name as gateway_name, gw.id as gateway_id, cgw.status as gateway_status
      FROM commerce_gateway_withdrawal cgw
      JOIN commerce c ON c.id = cgw.commerce_id
      LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
      WHERE cgw.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)${countryFilter}
      ORDER BY c.name, gw.name`;

    const [payinData, payoutData] = await Promise.all([
      mysqlQuery(payinSql, params),
      mysqlQuery(payoutSql, params),
    ]);

    // Agrupar por comercio
    const commerceMap = new Map<number, any>();
    (payinData as any[]).forEach((r: any) => {
      if (!commerceMap.has(r.commerce_id)) {
        commerceMap.set(r.commerce_id, { id: r.commerce_id, name: r.commerce_name, country: r.country, payin: [], payout: [] });
      }
      commerceMap.get(r.commerce_id).payin.push({ gateway: r.gateway_name, gateway_id: r.gateway_id, status: r.gateway_status });
    });
    (payoutData as any[]).forEach((r: any) => {
      if (!commerceMap.has(r.commerce_id)) {
        commerceMap.set(r.commerce_id, { id: r.commerce_id, name: r.commerce_name, country: r.country, payin: [], payout: [] });
      }
      commerceMap.get(r.commerce_id).payout.push({ gateway: r.gateway_name, gateway_id: r.gateway_id, status: r.gateway_status });
    });

    // Aplicar filtros
    let commerces = Array.from(commerceMap.values());

    // Filtro por nombre de comercio
    if (search) {
      commerces = commerces.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }

    // Filtro por pasarela específica (puede ser múltiple separado por coma)
    if (gateway) {
      const gateways = gateway.split(',').filter(Boolean);
      commerces = commerces.filter(c => {
        const hasPayin = c.payin.some((g: any) => gateways.includes(g.gateway));
        const hasPayout = c.payout.some((g: any) => gateways.includes(g.gateway));
        return hasPayin || hasPayout;
      });
    }

    // Filtro por estado (activo/inactivo)
    if (status === 'active') {
      commerces = commerces.filter(c => {
        return c.payin.some((g: any) => g.status === 'active' || g.status === '1' || g.status === 1)
          || c.payout.some((g: any) => g.status === 'active' || g.status === '1' || g.status === 1);
      });
    } else if (status === 'inactive') {
      commerces = commerces.filter(c => {
        const allGws = [...c.payin, ...c.payout];
        return allGws.length > 0 && allGws.every((g: any) => g.status !== 'active' && g.status !== '1' && g.status !== 1);
      });
    }

    // Generar Excel
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pasarelas por Comercio');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Comercio', key: 'name', width: 35 },
      { header: 'País', key: 'country', width: 10 },
      { header: 'Pasarelas Pay In (activas)', key: 'payin', width: 50 },
      { header: 'Pasarelas Pay Out (activas)', key: 'payout', width: 50 },
      { header: '# Pay In', key: 'payin_count', width: 10 },
      { header: '# Pay Out', key: 'payout_count', width: 10 },
    ];

    // Header style
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;

    for (const c of commerces) {
      // Filtrar pasarelas por el filtro de gateway si existe
      const gwFilter = gateway ? gateway.split(',').filter(Boolean) : [];
      let payinFiltered = c.payin.filter((g: any) => g.status === 'active' || g.status === '1' || g.status === 1);
      let payoutFiltered = c.payout.filter((g: any) => g.status === 'active' || g.status === '1' || g.status === 1);
      
      if (gwFilter.length > 0) {
        payinFiltered = payinFiltered.filter((g: any) => gwFilter.includes(g.gateway));
        payoutFiltered = payoutFiltered.filter((g: any) => gwFilter.includes(g.gateway));
      }

      const row = sheet.addRow({
        id: c.id,
        name: c.name,
        country: c.country || '—',
        payin: payinFiltered.map((g: any) => `${g.gateway} #${g.gateway_id || ''}`).join(', ') || '—',
        payout: payoutFiltered.map((g: any) => `${g.gateway} #${g.gateway_id || ''}`).join(', ') || '—',
        payin_count: payinFiltered.length,
        payout_count: payoutFiltered.length,
      });

      if (row.number % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
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

    // Auto-filtro
    if (commerces.length > 0) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=pasarelas_por_comercio_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Transactions] Error gateway-dashboard-export:', err.message);
    res.status(500).json({ error: 'Error al generar Excel: ' + err.message });
  }
});

// ─── GET /api/v1/transactions/gateway-dashboard — Dashboard de pasarelas y configuraciones por comercio
router.get('/gateway-dashboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { country } = req.query as Record<string, string>;
    const cacheKey = `gw-dashboard:${country || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    let countryFilter = '';
    const params: any[] = [];
    if (country) {
      countryFilter = ' AND c.country = ?';
      params.push(country);
    }

    // Pay In: pasarelas activas por comercio
    const payinSql = `SELECT c.id as commerce_id, c.name as commerce_name, c.country, c.enabled,
      gp.name as gateway_name, gp.id as gateway_id, cg.status as gateway_status, cg.created_at
      FROM commerce_gateway cg
      JOIN commerce c ON c.id = cg.commerce_id
      LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
      WHERE cg.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)${countryFilter}
      ORDER BY c.name, gp.name`;

    // Pay Out: pasarelas activas por comercio
    const payoutSql = `SELECT c.id as commerce_id, c.name as commerce_name, c.country, c.enabled,
      gw.name as gateway_name, gw.id as gateway_id, cgw.status as gateway_status, cgw.created_at
      FROM commerce_gateway_withdrawal cgw
      JOIN commerce c ON c.id = cgw.commerce_id
      LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
      WHERE cgw.deleted_at IS NULL AND (c.is_deleted IS NULL OR c.is_deleted = 0)${countryFilter}
      ORDER BY c.name, gw.name`;

    const [payinData, payoutData] = await Promise.all([
      mysqlQuery(payinSql, params),
      mysqlQuery(payoutSql, params),
    ]);

    // Agrupar por comercio
    const commerceMap = new Map<number, any>();

    (payinData as any[]).forEach((r: any) => {
      if (!commerceMap.has(r.commerce_id)) {
        commerceMap.set(r.commerce_id, {
          id: r.commerce_id,
          name: r.commerce_name,
          country: r.country,
          enabled: r.enabled,
          payin: [],
          payout: [],
        });
      }
      commerceMap.get(r.commerce_id).payin.push({
        gateway: r.gateway_name,
        gateway_id: r.gateway_id,
        status: r.gateway_status,
        created_at: r.created_at,
      });
    });

    (payoutData as any[]).forEach((r: any) => {
      if (!commerceMap.has(r.commerce_id)) {
        commerceMap.set(r.commerce_id, {
          id: r.commerce_id,
          name: r.commerce_name,
          country: r.country,
          enabled: r.enabled,
          payin: [],
          payout: [],
        });
      }
      commerceMap.get(r.commerce_id).payout.push({
        gateway: r.gateway_name,
        gateway_id: r.gateway_id,
        status: r.gateway_status,
        created_at: r.created_at,
      });
    });

    const commerces = Array.from(commerceMap.values());

    // Resumen de pasarelas
    const payinGateways = new Map<string, number>();
    const payoutGateways = new Map<string, number>();

    (payinData as any[]).forEach((r: any) => {
      const name = r.gateway_name || 'Sin nombre';
      payinGateways.set(name, (payinGateways.get(name) || 0) + 1);
    });
    (payoutData as any[]).forEach((r: any) => {
      const name = r.gateway_name || 'Sin nombre';
      payoutGateways.set(name, (payoutGateways.get(name) || 0) + 1);
    });

    const result = {
      commerces,
      summary: {
        totalCommerces: commerces.length,
        totalPayinConfigs: (payinData as any[]).length,
        totalPayoutConfigs: (payoutData as any[]).length,
        payinGateways: Array.from(payinGateways.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        payoutGateways: Array.from(payoutGateways.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      },
    };

    setCache(cacheKey, result, MysqlCache.TTL_SEMI_STATIC); // 15 min
    res.json(result);
  } catch (err: any) {
    console.error('[Transactions] Error gateway-dashboard:', err.message);
    res.status(500).json({ error: 'Error al consultar configuraciones de pasarelas: ' + err.message });
  }
});

export default router;
