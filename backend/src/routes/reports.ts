import { Router, Response } from 'express';
import { query } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate);

// GET /api/v1/reports/merchants
router.get('/merchants', async (req: AuthenticatedRequest, res: Response) => {
  const { status, risk_level, date_from, date_to, assigned_to, format = 'json' } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (status)      { conditions.push('m.status = $' + idx++);      params.push(status); }
  if (risk_level)  { conditions.push('m.risk_level = $' + idx++);   params.push(risk_level); }
  if (date_from)   { conditions.push('m.created_at >= $' + idx++);  params.push(date_from); }
  if (date_to)     { conditions.push('m.created_at <= $' + idx++);  params.push(date_to); }
  if (assigned_to) { conditions.push('m.assigned_to = $' + idx++);  params.push(assigned_to); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const merchants = await query(
    `SELECT m.legal_name, m.trade_name, m.tax_id, m.country, m.city, m.status,
            m.risk_level, m.score, m.mcc_code, m.mcc_description,
            m.contact_name, m.contact_email, m.contact_phone,
            m.currency, m.monthly_volume, m.average_ticket,
            m.integration_type, m.created_at, m.last_activity_at,
            u.first_name || ' ' || u.last_name as assigned_to_name
     FROM merchants m
     LEFT JOIN users u ON m.assigned_to = u.id
     ${where}
     ORDER BY m.created_at DESC`,
    params
  );

  if (format === 'csv') {
    return exportCSV(res, merchants);
  }
  if (format === 'excel') {
    return exportExcel(res, merchants);
  }
  if (format === 'pdf') {
    return exportPDF(res, merchants);
  }

  res.json({
    data: merchants,
    total: merchants.length,
    generatedAt: new Date().toISOString(),
  });
});

// GET /api/v1/reports/summary
router.get('/summary', async (_req: AuthenticatedRequest, res: Response) => {
  const [statusSummary, riskSummary, mccSummary, monthlyGrowth] = await Promise.all([
    query(`
      SELECT status, COUNT(*) as count, AVG(score) as avg_score
      FROM merchants GROUP BY status ORDER BY count DESC
    `),
    query(`
      SELECT risk_level, COUNT(*) as count, AVG(monthly_volume) as avg_volume
      FROM merchants GROUP BY risk_level
    `),
    query(`
      SELECT mcc_code, mcc_description, COUNT(*) as count
      FROM merchants GROUP BY mcc_code, mcc_description
      ORDER BY count DESC LIMIT 10
    `),
    query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        COUNT(*) as new_merchants,
        COUNT(*) FILTER (WHERE status = 'certified') as certified
      FROM merchants
      WHERE created_at > NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `),
  ]);

  res.json({ statusSummary, riskSummary, mccSummary, monthlyGrowth });
});

// ── Export helpers ──────────────────────────────────────────────

const COLUMN_LABELS: Record<string, string> = {
  legal_name:       'Razón Social',
  trade_name:       'Nombre Comercial',
  tax_id:           'RUC / Tax ID',
  country:          'País',
  city:             'Ciudad',
  status:           'Estado',
  risk_level:       'Riesgo',
  score:            'Score',
  mcc_code:         'MCC',
  mcc_description:  'Descripción MCC',
  contact_name:     'Contacto',
  contact_email:    'Email Contacto',
  contact_phone:    'Teléfono',
  currency:         'Moneda',
  monthly_volume:   'Volumen Mensual',
  average_ticket:   'Ticket Promedio',
  integration_type: 'Integración',
  created_at:       'Fecha Registro',
  last_activity_at: 'Última Actividad',
  assigned_to_name: 'Asignado a',
};

function formatValue(key: string, val: any): string {
  if (val === null || val === undefined) return '';
  if (key === 'created_at' || key === 'last_activity_at') {
    return new Date(val).toLocaleDateString('es-PE');
  }
  if (key === 'monthly_volume' || key === 'average_ticket') {
    return val ? Number(val).toLocaleString('es-PE') : '';
  }
  return String(val);
}

function exportCSV(res: Response, data: any[]): void {
  if (data.length === 0) {
    res.status(404).json({ error: 'No hay datos para exportar' });
    return;
  }

  const keys = Object.keys(COLUMN_LABELS);
  const header = keys.map(k => COLUMN_LABELS[k]).join(',');
  const rows = data.map(row =>
    keys.map(k => {
      const val = formatValue(k, row[k]);
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const filename = `comercios_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  // BOM for Excel UTF-8 compatibility
  res.send('\uFEFF' + csv);
}

async function exportExcel(res: Response, data: any[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProntoPaga CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Comercios', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const keys = Object.keys(COLUMN_LABELS);

  // Header row
  sheet.columns = keys.map(k => ({
    header: COLUMN_LABELS[k],
    key: k,
    width: k === 'legal_name' || k === 'mcc_description' ? 30 : 18,
  }));

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });

  // Data rows
  data.forEach((row, i) => {
    const values: Record<string, any> = {};
    keys.forEach(k => { values[k] = formatValue(k, row[k]); });
    const dataRow = sheet.addRow(values);
    dataRow.height = 18;

    // Alternate row color
    if (i % 2 === 0) {
      dataRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
      });
    }

    // Color status cell
    const statusCell = dataRow.getCell('status');
    const statusColors: Record<string, string> = {
      certified: 'FF10B981',
      approved:  'FF3B82F6',
      in_review: 'FFF59E0B',
      pending:   'FF6B7280',
      rejected:  'FFEF4444',
      suspended: 'FF8B5CF6',
      lead:      'FF9CA3AF',
      documentation_required: 'FFF97316',
      inactive:  'FFD1D5DB',
    };
    const statusColor = statusColors[row.status];
    if (statusColor) {
      statusCell.font = { color: { argb: statusColor }, bold: true };
    }
  });

  // Freeze header
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Auto filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: keys.length },
  };

  const filename = `comercios_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  await workbook.xlsx.write(res);
  res.end();
}

function exportPDF(res: Response, data: any[]): void {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });

  const filename = `comercios_${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  doc.pipe(res);

  // ── Header ──
  // Red top bar
  doc.rect(0, 0, doc.page.width, 8).fill('#FC2B5F');

  doc.moveDown(0.5);
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
    .text('ProntoPaga CRM', 36, 20, { align: 'left' });

  doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
    .text('Reporte de Comercios', 36, 42);

  doc.fontSize(9).fillColor('#9CA3AF')
    .text(`Generado: ${new Date().toLocaleString('es-PE')}  |  Total: ${data.length} comercios`,
      36, 56, { align: 'left' });

  // Divider
  doc.moveTo(36, 72).lineTo(doc.page.width - 36, 72)
    .strokeColor('#FC2B5F').lineWidth(1.5).stroke();

  doc.moveDown(1.5);

  // ── Table ──
  const cols = [
    { key: 'legal_name',      label: 'Razón Social',   width: 140 },
    { key: 'tax_id',          label: 'RUC/Tax ID',      width: 80  },
    { key: 'country',         label: 'País',            width: 55  },
    { key: 'status',          label: 'Estado',          width: 80  },
    { key: 'risk_level',      label: 'Riesgo',          width: 50  },
    { key: 'score',           label: 'Score',           width: 38  },
    { key: 'mcc_code',        label: 'MCC',             width: 40  },
    { key: 'monthly_volume',  label: 'Vol. Mensual',    width: 75  },
    { key: 'assigned_to_name',label: 'Asignado a',      width: 90  },
  ];

  const tableLeft  = 36;
  const rowHeight  = 18;
  const headerH    = 20;
  let   y          = doc.y;

  // Table header background
  doc.rect(tableLeft, y, doc.page.width - 72, headerH).fill('#FC2B5F');

  // Header text
  let x = tableLeft + 4;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  cols.forEach(col => {
    doc.text(col.label, x, y + 5, { width: col.width - 4, ellipsis: true });
    x += col.width;
  });

  y += headerH;

  const statusLabels: Record<string, string> = {
    certified:               'Certificado',
    approved:                'Aprobado',
    in_review:               'En Revisión',
    pending:                 'Pendiente',
    documentation_required:  'Docs. Req.',
    rejected:                'Rechazado',
    suspended:               'Suspendido',
    lead:                    'Lead',
    inactive:                'Inactivo',
  };

  const statusColors: Record<string, string> = {
    certified:               '#10B981',
    approved:                '#3B82F6',
    in_review:               '#F59E0B',
    pending:                 '#6B7280',
    documentation_required:  '#F97316',
    rejected:                '#EF4444',
    suspended:               '#8B5CF6',
    lead:                    '#9CA3AF',
    inactive:                '#D1D5DB',
  };

  data.forEach((row, i) => {
    // New page if needed
    if (y + rowHeight > doc.page.height - 50) {
      doc.addPage({ layout: 'landscape', margin: 36 });
      doc.rect(0, 0, doc.page.width, 8).fill('#FC2B5F');
      y = 20;

      // Repeat header
      doc.rect(tableLeft, y, doc.page.width - 72, headerH).fill('#FC2B5F');
      let hx = tableLeft + 4;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
      cols.forEach(col => {
        doc.text(col.label, hx, y + 5, { width: col.width - 4, ellipsis: true });
        hx += col.width;
      });
      y += headerH;
    }

    // Alternate row background
    if (i % 2 === 0) {
      doc.rect(tableLeft, y, doc.page.width - 72, rowHeight).fill('#FFF0F3');
    }

    // Row border
    doc.rect(tableLeft, y, doc.page.width - 72, rowHeight)
      .strokeColor('#E5E7EB').lineWidth(0.3).stroke();

    let cx = tableLeft + 4;
    doc.fontSize(7.5).font('Helvetica').fillColor('#111827');

    cols.forEach(col => {
      let val = formatValue(col.key, row[col.key]);

      if (col.key === 'status') {
        val = statusLabels[row.status] || row.status;
        doc.fillColor(statusColors[row.status] || '#6B7280').font('Helvetica-Bold');
        doc.text(val, cx, y + 5, { width: col.width - 4, ellipsis: true });
        doc.fillColor('#111827').font('Helvetica');
      } else if (col.key === 'score') {
        const score = Number(row.score) || 0;
        const scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#3B82F6' : score >= 40 ? '#F59E0B' : '#EF4444';
        doc.fillColor(scoreColor).font('Helvetica-Bold');
        doc.text(String(score), cx, y + 5, { width: col.width - 4 });
        doc.fillColor('#111827').font('Helvetica');
      } else {
        doc.text(val, cx, y + 5, { width: col.width - 4, ellipsis: true });
      }

      cx += col.width;
    });

    y += rowHeight;
  });

  // Footer
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor('#9CA3AF')
      .text(
        `ProntoPaga CRM  ·  Página ${i + 1} de ${pages.count}`,
        36, doc.page.height - 25,
        { align: 'center', width: doc.page.width - 72 }
      );
  }

  doc.end();
}

// ─── GET /api/v1/reports/tasks ───────────────────────────────────────────────
router.get('/tasks', async (req: AuthenticatedRequest, res: Response) => {
  const { role, user_id, date_from, date_to, status, format = 'json' } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (role)      { conditions.push('u.role = $'           + idx++); params.push(role); }
  if (user_id)   { conditions.push('u.id = $'             + idx++); params.push(user_id); }
  if (status)    { conditions.push('t.status = $'         + idx++); params.push(status); }
  if (date_from) { conditions.push('t.created_at >= $'    + idx++); params.push(date_from); }
  if (date_to)   { conditions.push('t.created_at <= $'    + idx++); params.push(date_to + ' 23:59:59'); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // ── Detalle de tareas por usuario ─────────────────────────────────────────
  const tasks = await query(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.status,
       t.priority,
       t.created_at,
       t.completed_at,
       t.due_date,
       u.id            AS user_id,
       u.first_name || ' ' || u.last_name AS user_name,
       u.role          AS user_role,
       m.legal_name    AS merchant_name,
       m.trade_name    AS merchant_trade_name,
       CASE
         WHEN t.completed_at IS NOT NULL AND t.due_date IS NOT NULL
              AND t.completed_at <= t.due_date THEN 'on_time'
         WHEN t.completed_at IS NOT NULL AND t.due_date IS NOT NULL
              AND t.completed_at > t.due_date  THEN 'late'
         WHEN t.due_date IS NOT NULL AND t.completed_at IS NULL
              AND t.due_date < NOW()            THEN 'overdue'
         ELSE 'no_deadline'
       END AS timeliness
     FROM tasks t
     JOIN users u ON t.assigned_to = u.id
     LEFT JOIN merchants m ON t.merchant_id = m.id
     ${where}
     ORDER BY u.first_name, u.last_name, t.created_at DESC`,
    params
  );

  // ── Resumen por usuario ───────────────────────────────────────────────────
  const summaryConditions = conditions.map(c => c); // same filters
  const summary = await query(
    `SELECT
       u.id,
       u.first_name || ' ' || u.last_name AS user_name,
       u.role,
       COUNT(t.id)                                                    AS total,
       COUNT(t.id) FILTER (WHERE t.status = 'completed')             AS completed,
       COUNT(t.id) FILTER (WHERE t.status = 'in_progress')           AS in_progress,
       COUNT(t.id) FILTER (WHERE t.status = 'pending')               AS pending,
       COUNT(t.id) FILTER (WHERE t.status = 'cancelled')             AS cancelled,
       COUNT(t.id) FILTER (WHERE t.priority = 'urgent')              AS urgent,
       COUNT(t.id) FILTER (WHERE t.priority = 'high')                AS high_priority,
       ROUND(
         COUNT(t.id) FILTER (WHERE t.status = 'completed')::numeric /
         NULLIF(COUNT(t.id), 0) * 100, 1
       )                                                              AS completion_rate,
       AVG(
         CASE WHEN t.completed_at IS NOT NULL AND t.created_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600
         END
       )::numeric(10,1)                                              AS avg_hours_to_complete
     FROM users u
     LEFT JOIN tasks t ON t.assigned_to = u.id ${
       conditions.length > 0
         ? 'AND ' + conditions.filter(c => !c.startsWith('u.')).join(' AND ')
         : ''
     }
     ${conditions.some(c => c.startsWith('u.')) ? 'WHERE ' + conditions.filter(c => c.startsWith('u.')).join(' AND ') : ''}
     GROUP BY u.id, u.first_name, u.last_name, u.role
     ORDER BY completed DESC`,
    params
  );

  if (format === 'excel') return exportTasksExcel(res, tasks, summary);
  if (format === 'pdf')   return exportTasksPDF(res, tasks, summary);

  res.json({
    tasks,
    summary,
    total: tasks.length,
    generatedAt: new Date().toISOString(),
  });
});

// ─── Tasks Excel export ───────────────────────────────────────────────────────
async function exportTasksExcel(res: Response, tasks: any[], summary: any[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProntoPaga CRM';
  wb.created = new Date();

  // ── Sheet 1: Resumen por usuario ──────────────────────────────────────────
  const sheetSummary = wb.addWorksheet('Resumen por Usuario');
  sheetSummary.columns = [
    { header: 'Usuario',          key: 'user_name',            width: 28 },
    { header: 'Rol',              key: 'role',                 width: 14 },
    { header: 'Total',            key: 'total',                width: 10 },
    { header: 'Completadas',      key: 'completed',            width: 14 },
    { header: 'En Progreso',      key: 'in_progress',          width: 14 },
    { header: 'Pendientes',       key: 'pending',              width: 12 },
    { header: 'Canceladas',       key: 'cancelled',            width: 12 },
    { header: 'Urgentes',         key: 'urgent',               width: 10 },
    { header: '% Completado',     key: 'completion_rate',      width: 14 },
    { header: 'Hrs Prom. Cierre', key: 'avg_hours_to_complete',width: 16 },
  ];

  const hRow = sheetSummary.getRow(1);
  hRow.height = 22;
  hRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  summary.forEach((row, i) => {
    const r = sheetSummary.addRow({
      user_name:             row.user_name,
      role:                  row.role,
      total:                 Number(row.total),
      completed:             Number(row.completed),
      in_progress:           Number(row.in_progress),
      pending:               Number(row.pending),
      cancelled:             Number(row.cancelled),
      urgent:                Number(row.urgent),
      completion_rate:       row.completion_rate ? Number(row.completion_rate) + '%' : '0%',
      avg_hours_to_complete: row.avg_hours_to_complete ? Number(row.avg_hours_to_complete) + 'h' : '—',
    });
    if (i % 2 === 0) {
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
      });
    }
  });
  sheetSummary.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Sheet 2: Detalle de tareas ────────────────────────────────────────────
  const sheetDetail = wb.addWorksheet('Detalle de Tareas');
  sheetDetail.columns = [
    { header: 'Usuario',    key: 'user_name',     width: 26 },
    { header: 'Rol',        key: 'user_role',     width: 14 },
    { header: 'Tarea',      key: 'title',         width: 36 },
    { header: 'Estado',     key: 'status',        width: 14 },
    { header: 'Prioridad',  key: 'priority',      width: 12 },
    { header: 'Comercio',   key: 'merchant_name', width: 28 },
    { header: 'Creada',     key: 'created_at',    width: 18 },
    { header: 'Vence',      key: 'due_date',      width: 18 },
    { header: 'Completada', key: 'completed_at',  width: 18 },
    { header: 'Puntualidad',key: 'timeliness',    width: 14 },
  ];

  const dHRow = sheetDetail.getRow(1);
  dHRow.height = 22;
  dHRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFC2B5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const fmt = (d: any) => d ? new Date(d).toLocaleDateString('es-PE') : '—';
  const timelinessLabel: Record<string, string> = {
    on_time: 'A tiempo', late: 'Tarde', overdue: 'Vencida', no_deadline: 'Sin fecha',
  };

  tasks.forEach((row, i) => {
    const r = sheetDetail.addRow({
      user_name:    row.user_name,
      user_role:    row.user_role,
      title:        row.title,
      status:       row.status,
      priority:     row.priority,
      merchant_name: row.merchant_name || '—',
      created_at:   fmt(row.created_at),
      due_date:     fmt(row.due_date),
      completed_at: fmt(row.completed_at),
      timeliness:   timelinessLabel[row.timeliness] || row.timeliness,
    });
    if (i % 2 === 0) {
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F3' } };
      });
    }
  });
  sheetDetail.views = [{ state: 'frozen', ySplit: 1 }];
  sheetDetail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };

  const filename = `tareas_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  await wb.xlsx.write(res);
  res.end();
}

// ─── Tasks PDF export ─────────────────────────────────────────────────────────
function exportTasksPDF(res: Response, tasks: any[], summary: any[]): void {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
  const filename = `tareas_${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  doc.pipe(res);

  const W = doc.page.width;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 8).fill('#FC2B5F');
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
    .text('ProntoPaga CRM — Reporte de Tareas', 36, 18, { align: 'left' });
  doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
    .text(`Generado: ${new Date().toLocaleString('es-PE')}  |  Total tareas: ${tasks.length}`, 36, 40);
  doc.moveTo(36, 54).lineTo(W - 36, 54).strokeColor('#FC2B5F').lineWidth(1.5).stroke();
  doc.moveDown(1.5);

  // ── Resumen por usuario ───────────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Resumen por Usuario', 36, doc.y);
  doc.moveDown(0.5);

  const sumCols = [
    { label: 'Usuario',       width: 130 },
    { label: 'Rol',           width: 70  },
    { label: 'Total',         width: 45  },
    { label: 'Completadas',   width: 70  },
    { label: 'Pendientes',    width: 65  },
    { label: '% Completado',  width: 75  },
    { label: 'Hrs Prom.',     width: 65  },
  ];

  let y = doc.y;
  doc.rect(36, y, W - 72, 18).fill('#FC2B5F');
  let x = 40;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  sumCols.forEach(c => { doc.text(c.label, x, y + 4, { width: c.width - 4 }); x += c.width; });
  y += 18;

  summary.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape', margin: 36 });
      doc.rect(0, 0, W, 8).fill('#FC2B5F');
      y = 20;
    }
    if (i % 2 === 0) doc.rect(36, y, W - 72, 16).fill('#FFF0F3');
    doc.rect(36, y, W - 72, 16).strokeColor('#E5E7EB').lineWidth(0.3).stroke();
    x = 40;
    doc.fontSize(7.5).font('Helvetica').fillColor('#111827');
    const vals = [
      row.user_name,
      row.role,
      String(row.total || 0),
      String(row.completed || 0),
      String(row.pending || 0),
      (row.completion_rate || 0) + '%',
      row.avg_hours_to_complete ? row.avg_hours_to_complete + 'h' : '—',
    ];
    vals.forEach((v, vi) => {
      doc.text(v, x, y + 4, { width: sumCols[vi].width - 4, ellipsis: true });
      x += sumCols[vi].width;
    });
    y += 16;
  });

  // ── Detalle de tareas ─────────────────────────────────────────────────────
  doc.addPage({ layout: 'landscape', margin: 36 });
  doc.rect(0, 0, W, 8).fill('#FC2B5F');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Detalle de Tareas', 36, 18);
  doc.moveDown(0.5);

  const detCols = [
    { label: 'Usuario',    width: 110 },
    { label: 'Tarea',      width: 160 },
    { label: 'Estado',     width: 70  },
    { label: 'Prioridad',  width: 60  },
    { label: 'Comercio',   width: 110 },
    { label: 'Creada',     width: 65  },
    { label: 'Completada', width: 65  },
    { label: 'Puntualidad',width: 65  },
  ];

  y = doc.y;
  doc.rect(36, y, W - 72, 18).fill('#FC2B5F');
  x = 40;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  detCols.forEach(c => { doc.text(c.label, x, y + 4, { width: c.width - 4 }); x += c.width; });
  y += 18;

  const fmt = (d: any) => d ? new Date(d).toLocaleDateString('es-PE') : '—';
  const statusColors: Record<string, string> = {
    completed: '#10B981', in_progress: '#3B82F6', pending: '#F59E0B', cancelled: '#EF4444',
  };
  const timelinessLabel: Record<string, string> = {
    on_time: '✓ A tiempo', late: '✗ Tarde', overdue: '⚠ Vencida', no_deadline: '— Sin fecha',
  };

  tasks.slice(0, 200).forEach((row, i) => {
    if (y > doc.page.height - 50) {
      doc.addPage({ layout: 'landscape', margin: 36 });
      doc.rect(0, 0, W, 8).fill('#FC2B5F');
      y = 20;
      doc.rect(36, y, W - 72, 18).fill('#FC2B5F');
      x = 40;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
      detCols.forEach(c => { doc.text(c.label, x, y + 4, { width: c.width - 4 }); x += c.width; });
      y += 18;
    }
    if (i % 2 === 0) doc.rect(36, y, W - 72, 16).fill('#FFF0F3');
    doc.rect(36, y, W - 72, 16).strokeColor('#E5E7EB').lineWidth(0.3).stroke();
    x = 40;
    const vals = [
      row.user_name,
      row.title,
      row.status,
      row.priority,
      row.merchant_name || '—',
      fmt(row.created_at),
      fmt(row.completed_at),
      timelinessLabel[row.timeliness] || row.timeliness,
    ];
    vals.forEach((v, vi) => {
      if (vi === 2) {
        doc.fillColor(statusColors[row.status] || '#6B7280').font('Helvetica-Bold');
      } else {
        doc.fillColor('#111827').font('Helvetica');
      }
      doc.fontSize(7.5).text(v, x, y + 4, { width: detCols[vi].width - 4, ellipsis: true });
      x += detCols[vi].width;
    });
    y += 16;
  });

  if (tasks.length > 200) {
    doc.moveDown().fontSize(8).fillColor('#9CA3AF')
      .text(`... y ${tasks.length - 200} tareas más. Exporta a Excel para ver el listado completo.`);
  }

  // Footer en todas las páginas
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor('#9CA3AF')
      .text(`ProntoPaga CRM  ·  Página ${i + 1} de ${range.count}`,
        36, doc.page.height - 25, { align: 'center', width: W - 72 });
  }

  doc.end();
}

export default router;
