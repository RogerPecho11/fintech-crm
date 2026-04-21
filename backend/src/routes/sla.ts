import { Router, Response } from 'express';
import { query } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import {
  validateSlaHours,
  validateAlertThreshold,
  getSlaStatusBulk,
  initSlaDefaults,
} from '../services/slaService';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/sla/config — todos los roles autenticados ───────────────────
router.get('/config', async (_req: AuthenticatedRequest, res: Response) => {
  const config = await query('SELECT * FROM sla_config ORDER BY entity_type, entity_key');
  res.json(config);
});

// ─── PUT /api/v1/sla/config — solo admin ─────────────────────────────────────
router.put('/config', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const entries: Array<{
    entity_type: string;
    entity_key: string;
    max_hours: number | null;
    alert_threshold_pct?: number | null;
  }> = req.body;

  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'El cuerpo debe ser un array de entradas de configuración.' });
  }

  const errors: string[] = [];

  for (const entry of entries) {
    if (!entry.entity_type || !entry.entity_key) {
      errors.push(`Entrada inválida: entity_type y entity_key son requeridos.`);
      continue;
    }

    // Validate max_hours if provided
    if (entry.max_hours !== null && entry.max_hours !== undefined) {
      const validation = validateSlaHours(entry.max_hours);
      if (!validation.valid) {
        errors.push(`${entry.entity_type}/${entry.entity_key}: ${validation.error}`);
      }
    }

    // Validate alert_threshold_pct if provided
    if (entry.alert_threshold_pct !== null && entry.alert_threshold_pct !== undefined) {
      const validation = validateAlertThreshold(entry.alert_threshold_pct);
      if (!validation.valid) {
        errors.push(`${entry.entity_type}/${entry.entity_key}: ${validation.error}`);
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  // Upsert all entries
  for (const entry of entries) {
    await query(
      `INSERT INTO sla_config (entity_type, entity_key, max_hours, alert_threshold_pct, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (entity_type, entity_key)
       DO UPDATE SET
         max_hours           = EXCLUDED.max_hours,
         alert_threshold_pct = EXCLUDED.alert_threshold_pct,
         updated_by          = EXCLUDED.updated_by,
         updated_at          = NOW()`,
      [
        entry.entity_type,
        entry.entity_key,
        entry.max_hours ?? null,
        entry.alert_threshold_pct ?? null,
        user.id,
      ]
    );
  }

  const updated = await query('SELECT * FROM sla_config ORDER BY entity_type, entity_key');
  res.json({ message: 'Configuración SLA actualizada correctamente.', config: updated });
});

// ─── POST /api/v1/sla/config/reset/:section — solo admin ─────────────────────
router.post('/config/reset/:section', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { section } = req.params;

  const defaults: Record<string, Array<{ entity_key: string; max_hours: number | null; alert_threshold_pct: number | null }>> = {
    merchant_status: [
      { entity_key: 'lead',                   max_hours: null, alert_threshold_pct: null },
      { entity_key: 'pending',                max_hours: 72,   alert_threshold_pct: null },
      { entity_key: 'in_review',              max_hours: 48,   alert_threshold_pct: null },
      { entity_key: 'documentation_required', max_hours: 24,   alert_threshold_pct: null },
      { entity_key: 'approved',               max_hours: 48,   alert_threshold_pct: null },
      { entity_key: 'suspended',              max_hours: null, alert_threshold_pct: null },
    ],
    risk_level: [
      { entity_key: 'diamond', max_hours: 24,  alert_threshold_pct: null },
      { entity_key: 'gold',    max_hours: 48,  alert_threshold_pct: null },
      { entity_key: 'silver',  max_hours: 72,  alert_threshold_pct: null },
      { entity_key: 'bronze',  max_hours: 96,  alert_threshold_pct: null },
    ],
    task_priority: [
      { entity_key: 'urgent', max_hours: 4,   alert_threshold_pct: null },
      { entity_key: 'high',   max_hours: 24,  alert_threshold_pct: null },
      { entity_key: 'medium', max_hours: 72,  alert_threshold_pct: null },
      { entity_key: 'low',    max_hours: 168, alert_threshold_pct: null },
    ],
    global: [
      { entity_key: 'default', max_hours: null, alert_threshold_pct: 75 },
    ],
  };

  if (!defaults[section]) {
    return res.status(400).json({ error: `Sección inválida: ${section}. Use: merchant_status, risk_level, task_priority, global.` });
  }

  const user = req.user!;
  for (const d of defaults[section]) {
    await query(
      `INSERT INTO sla_config (entity_type, entity_key, max_hours, alert_threshold_pct, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (entity_type, entity_key)
       DO UPDATE SET
         max_hours           = EXCLUDED.max_hours,
         alert_threshold_pct = EXCLUDED.alert_threshold_pct,
         updated_by          = EXCLUDED.updated_by,
         updated_at          = NOW()`,
      [section, d.entity_key, d.max_hours, d.alert_threshold_pct, user.id]
    );
  }

  const updated = await query(
    'SELECT * FROM sla_config WHERE entity_type = $1 ORDER BY entity_key',
    [section]
  );
  res.json({ message: `Sección "${section}" restaurada a valores predeterminados.`, config: updated });
});

// ─── GET /api/v1/sla/history — solo admin ────────────────────────────────────
router.get('/history', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { entity_type, assigned_to, date_from, date_to, page = '1', limit = '50' } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (entity_type) { conditions.push('h.entity_type = $' + idx++); params.push(entity_type); }
  if (assigned_to) { conditions.push('h.assigned_to = $' + idx++); params.push(assigned_to); }
  if (date_from)   { conditions.push('h.occurred_at >= $' + idx++); params.push(date_from); }
  if (date_to)     { conditions.push('h.occurred_at <= $' + idx++); params.push(date_to + ' 23:59:59'); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const pageNum  = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 200);
  const offset   = (pageNum - 1) * limitNum;

  const [history, countResult] = await Promise.all([
    query(
      `SELECT h.*,
         u.first_name || ' ' || u.last_name AS assigned_to_name,
         u.email AS assigned_to_email
       FROM sla_history h
       LEFT JOIN users u ON h.assigned_to = u.id
       ${where}
       ORDER BY h.occurred_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM sla_history h ${where}`, params),
  ]);

  res.json({
    data: history,
    total: parseInt(countResult[0]?.total || '0'),
    page: pageNum,
    limit: limitNum,
  });
});

// ─── GET /api/v1/sla/status — todos los roles autenticados ───────────────────
router.get('/status', async (_req: AuthenticatedRequest, res: Response) => {
  const status = await getSlaStatusBulk();
  res.json(status);
});

export default router;
