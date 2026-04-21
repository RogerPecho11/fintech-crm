import { query, queryOne } from '../database/connection';
import { Server as SocketServer } from 'socket.io';
import { createNotification } from './notificationService';
import { isFinalized } from '../lib/finalized';
import nodemailer from 'nodemailer';
import { SlaConfigEntry, SlaEvalResult, SlaStatus, SlaStatusResponse } from '../types';

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateSlaHours(value: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(value) || value < 1 || value > 720) {
    return { valid: false, error: 'Las horas deben estar entre 1 y 720 (30 días).' };
  }
  return { valid: true };
}

export function validateAlertThreshold(value: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(value) || value < 10 || value > 90) {
    return { valid: false, error: 'El umbral de alerta debe estar entre 10% y 90%.' };
  }
  return { valid: true };
}

// ─── SLA Effective calculation ────────────────────────────────────────────────

export function getEffectiveSla(
  statusKey: string,
  riskKey: string,
  config: SlaConfigEntry[]
): { effectiveHours: number | null; byStatus: number | null; byRisk: number | null } {
  const statusEntry = config.find(
    c => c.entity_type === 'merchant_status' && c.entity_key === statusKey
  );
  const riskEntry = config.find(
    c => c.entity_type === 'risk_level' && c.entity_key === riskKey
  );

  const byStatus = statusEntry?.max_hours ?? null;
  const byRisk   = riskEntry?.max_hours   ?? null;

  let effectiveHours: number | null = null;
  if (byStatus !== null && byRisk !== null) {
    effectiveHours = Math.min(byStatus, byRisk);
  } else if (byStatus !== null) {
    effectiveHours = byStatus;
  } else if (byRisk !== null) {
    effectiveHours = byRisk;
  }

  return { effectiveHours, byStatus, byRisk };
}

// ─── SLA Status classification ────────────────────────────────────────────────

export function classifySlaStatus(
  hoursElapsed: number,
  effectiveSlaHours: number,
  alertThresholdPct: number
): SlaStatus {
  const warningThreshold = effectiveSlaHours * (alertThresholdPct / 100);
  if (hoursElapsed >= effectiveSlaHours) return 'breached';
  if (hoursElapsed >= warningThreshold)  return 'warning';
  return 'ok';
}

// ─── Config loading ───────────────────────────────────────────────────────────

export async function loadSlaConfig(): Promise<SlaConfigEntry[]> {
  return query<SlaConfigEntry>('SELECT * FROM sla_config ORDER BY entity_type, entity_key');
}

function getAlertThreshold(config: SlaConfigEntry[]): number {
  const global = config.find(c => c.entity_type === 'global' && c.entity_key === 'default');
  return global?.alert_threshold_pct ?? 75;
}

// ─── Defaults initialization ──────────────────────────────────────────────────

export async function initSlaDefaults(): Promise<void> {
  const existing = await query('SELECT COUNT(*) as count FROM sla_config');
  if (parseInt(existing[0]?.count || '0') > 0) return;

  const defaults: Array<{ entity_type: string; entity_key: string; max_hours: number | null; alert_threshold_pct: number | null }> = [
    // Merchant statuses
    { entity_type: 'merchant_status', entity_key: 'lead',                   max_hours: null, alert_threshold_pct: null },
    { entity_type: 'merchant_status', entity_key: 'pending',                max_hours: 72,   alert_threshold_pct: null },
    { entity_type: 'merchant_status', entity_key: 'in_review',              max_hours: 48,   alert_threshold_pct: null },
    { entity_type: 'merchant_status', entity_key: 'documentation_required', max_hours: 24,   alert_threshold_pct: null },
    { entity_type: 'merchant_status', entity_key: 'approved',               max_hours: 48,   alert_threshold_pct: null },
    { entity_type: 'merchant_status', entity_key: 'suspended',              max_hours: null, alert_threshold_pct: null },
    // Risk levels
    { entity_type: 'risk_level', entity_key: 'diamond', max_hours: 24,  alert_threshold_pct: null },
    { entity_type: 'risk_level', entity_key: 'gold',    max_hours: 48,  alert_threshold_pct: null },
    { entity_type: 'risk_level', entity_key: 'silver',  max_hours: 72,  alert_threshold_pct: null },
    { entity_type: 'risk_level', entity_key: 'bronze',  max_hours: 96,  alert_threshold_pct: null },
    // Task priorities
    { entity_type: 'task_priority', entity_key: 'urgent', max_hours: 4,   alert_threshold_pct: null },
    { entity_type: 'task_priority', entity_key: 'high',   max_hours: 24,  alert_threshold_pct: null },
    { entity_type: 'task_priority', entity_key: 'medium', max_hours: 72,  alert_threshold_pct: null },
    { entity_type: 'task_priority', entity_key: 'low',    max_hours: 168, alert_threshold_pct: null },
    // Global alert threshold
    { entity_type: 'global', entity_key: 'default', max_hours: null, alert_threshold_pct: 75 },
  ];

  for (const d of defaults) {
    await query(
      `INSERT INTO sla_config (entity_type, entity_key, max_hours, alert_threshold_pct)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (entity_type, entity_key) DO NOTHING`,
      [d.entity_type, d.entity_key, d.max_hours, d.alert_threshold_pct]
    );
  }
  console.log('✅ SLA defaults initialized');
}

// ─── Bulk status ──────────────────────────────────────────────────────────────

export async function getSlaStatusBulk(): Promise<SlaStatusResponse> {
  const config = await loadSlaConfig();
  const alertThreshold = getAlertThreshold(config);
  const now = Date.now();

  // Merchants
  const merchants = await query<any>(
    `SELECT m.id, m.status, m.risk_level, m.last_activity_at, m.assigned_to
     FROM merchants m
     WHERE m.assigned_to IS NOT NULL`
  );

  const merchantResults: Record<string, SlaEvalResult> = {};
  for (const m of merchants) {
    if (isFinalized(m.status)) {
      merchantResults[m.id] = {
        entity_id: m.id, entity_type: 'merchant', status: 'excluded',
        effective_sla_hours: null, hours_elapsed: 0, hours_remaining: null,
        sla_by_status: null, sla_by_risk: null,
        last_activity_at: m.last_activity_at,
      };
      continue;
    }

    const { effectiveHours, byStatus, byRisk } = getEffectiveSla(m.status, m.risk_level, config);
    const hoursElapsed = (now - new Date(m.last_activity_at).getTime()) / (1000 * 60 * 60);

    if (effectiveHours === null) {
      merchantResults[m.id] = {
        entity_id: m.id, entity_type: 'merchant', status: 'excluded',
        effective_sla_hours: null, hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        hours_remaining: null, sla_by_status: byStatus, sla_by_risk: byRisk,
        last_activity_at: m.last_activity_at,
      };
      continue;
    }

    const status = classifySlaStatus(hoursElapsed, effectiveHours, alertThreshold);
    const hoursRemaining = Math.max(0, effectiveHours - hoursElapsed);

    merchantResults[m.id] = {
      entity_id: m.id, entity_type: 'merchant', status,
      effective_sla_hours: effectiveHours,
      hours_elapsed: Math.round(hoursElapsed * 10) / 10,
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
      sla_by_status: byStatus, sla_by_risk: byRisk,
      last_activity_at: m.last_activity_at,
    };
  }

  // Tasks
  const tasks = await query<any>(
    `SELECT t.id, t.priority, t.status, t.created_at, t.assigned_to
     FROM tasks t
     WHERE t.assigned_to IS NOT NULL
     AND t.status IN ('pending', 'in_progress')`
  );

  const taskResults: Record<string, SlaEvalResult> = {};
  for (const t of tasks) {
    const priorityEntry = config.find(
      c => c.entity_type === 'task_priority' && c.entity_key === t.priority
    );
    const maxHours = priorityEntry?.max_hours ?? null;
    const hoursElapsed = (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60);

    if (maxHours === null) {
      taskResults[t.id] = {
        entity_id: t.id, entity_type: 'task', status: 'excluded',
        effective_sla_hours: null, hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        hours_remaining: null, sla_by_status: null, sla_by_risk: null,
        last_activity_at: t.created_at,
      };
      continue;
    }

    const status = classifySlaStatus(hoursElapsed, maxHours, alertThreshold);
    const hoursRemaining = Math.max(0, maxHours - hoursElapsed);

    taskResults[t.id] = {
      entity_id: t.id, entity_type: 'task', status,
      effective_sla_hours: maxHours,
      hours_elapsed: Math.round(hoursElapsed * 10) / 10,
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
      sla_by_status: null, sla_by_risk: null,
      last_activity_at: t.created_at,
    };
  }

  return { merchants: merchantResults, tasks: taskResults };
}

// ─── Email helper ─────────────────────────────────────────────────────────────

async function sendSlaEmail(
  toEmail: string,
  subject: string,
  html: string
): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[SLA] SMTP not configured — skipping email');
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@prontopaga.com',
      to: toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error('[SLA] Email send error:', err);
  }
}

// ─── Notification helper ──────────────────────────────────────────────────────

async function notifySlaEvent(
  entityId: string,
  entityType: 'merchant' | 'task',
  eventType: 'warning' | 'breached',
  evalResult: SlaEvalResult,
  assignedTo: string,
  entityName: string,
  io?: SocketServer
): Promise<void> {
  const notifType = eventType === 'warning' ? 'sla_warning' : 'sla_breach';
  const title = eventType === 'warning'
    ? `⚠️ SLA próximo a vencer — ${entityName}`
    : `🔴 SLA incumplido — ${entityName}`;
  const message = eventType === 'warning'
    ? `Han transcurrido ${evalResult.hours_elapsed}h de ${evalResult.effective_sla_hours}h permitidas.`
    : `SLA superado por ${Math.abs(evalResult.hours_remaining ?? 0)}h. Requiere atención inmediata.`;

  // In-app notification
  await createNotification(
    assignedTo,
    notifType as any,
    title,
    message,
    entityType === 'merchant' ? entityId : undefined,
    {
      entity_id: entityId,
      entity_type: entityType,
      sla_status: eventType,
      hours_elapsed: evalResult.hours_elapsed,
      effective_sla_hours: evalResult.effective_sla_hours,
    },
    io
  );

  // Email notification
  const user = await queryOne<any>(
    'SELECT email, first_name FROM users WHERE id = $1',
    [assignedTo]
  );
  if (!user?.email) {
    console.warn(`[SLA] User ${assignedTo} has no email — skipping email notification`);
    return;
  }

  const emailHtml = `
    <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #FC2B5F; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">ProntoPaga CRM — Alerta de SLA</h2>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hola <strong>${user.first_name}</strong>,</p>
        <p>${message}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #F9FAFB;">
            <td style="padding: 8px 12px; font-weight: 600; color: #374151;">Entidad</td>
            <td style="padding: 8px 12px; color: #111827;">${entityName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #374151;">Tipo</td>
            <td style="padding: 8px 12px; color: #111827;">${entityType === 'merchant' ? 'Comercio' : 'Tarea'}</td>
          </tr>
          <tr style="background: #F9FAFB;">
            <td style="padding: 8px 12px; font-weight: 600; color: #374151;">Horas transcurridas</td>
            <td style="padding: 8px 12px; color: #111827;">${evalResult.hours_elapsed}h</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #374151;">SLA máximo</td>
            <td style="padding: 8px 12px; color: #111827;">${evalResult.effective_sla_hours}h</td>
          </tr>
          ${evalResult.hours_remaining !== null && evalResult.hours_remaining > 0 ? `
          <tr style="background: #F9FAFB;">
            <td style="padding: 8px 12px; font-weight: 600; color: #374151;">Tiempo restante</td>
            <td style="padding: 8px 12px; color: #F59E0B; font-weight: 600;">${evalResult.hours_remaining}h</td>
          </tr>` : ''}
        </table>
        <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">
          Este es un mensaje automático del sistema CRM ProntoPaga.
        </p>
      </div>
    </div>
  `;

  await sendSlaEmail(user.email, title, emailHtml);
}

// ─── Deduplication check ──────────────────────────────────────────────────────

async function hasRecentSlaEvent(
  entityId: string,
  entityType: 'merchant' | 'task',
  eventType: 'warning' | 'breached'
): Promise<boolean> {
  // Check if there's already a warning/breached event without a subsequent 'recovered'
  const lastEvent = await queryOne<any>(
    `SELECT event_type FROM sla_history
     WHERE entity_id = $1 AND entity_type = $2
     ORDER BY occurred_at DESC LIMIT 1`,
    [entityId, entityType]
  );
  if (!lastEvent) return false;
  if (lastEvent.event_type === 'recovered') return false;
  if (lastEvent.event_type === eventType) return true;
  // If last was 'warning' and now is 'breached', allow the new event
  if (lastEvent.event_type === 'warning' && eventType === 'breached') return false;
  return false;
}

// ─── Merchant SLA evaluation ──────────────────────────────────────────────────

export async function evaluateMerchantsSla(io?: SocketServer): Promise<void> {
  const config = await loadSlaConfig();
  const alertThreshold = getAlertThreshold(config);
  const now = Date.now();

  const merchants = await query<any>(
    `SELECT m.id, m.legal_name, m.trade_name, m.status, m.risk_level,
            m.last_activity_at, m.assigned_to
     FROM merchants m
     WHERE m.assigned_to IS NOT NULL`
  );

  for (const m of merchants) {
    try {
      if (isFinalized(m.status)) continue;

      const { effectiveHours, byStatus, byRisk } = getEffectiveSla(m.status, m.risk_level, config);
      if (effectiveHours === null) continue;

      const hoursElapsed = (now - new Date(m.last_activity_at).getTime()) / (1000 * 60 * 60);
      const status = classifySlaStatus(hoursElapsed, effectiveHours, alertThreshold);
      const hoursRemaining = Math.max(0, effectiveHours - hoursElapsed);
      const entityName = m.trade_name || m.legal_name;

      const evalResult: SlaEvalResult = {
        entity_id: m.id, entity_type: 'merchant', status,
        effective_sla_hours: effectiveHours,
        hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        hours_remaining: Math.round(hoursRemaining * 10) / 10,
        sla_by_status: byStatus, sla_by_risk: byRisk,
        last_activity_at: m.last_activity_at,
      };

      if (status === 'warning' || status === 'breached') {
        const alreadyNotified = await hasRecentSlaEvent(m.id, 'merchant', status);
        if (!alreadyNotified) {
          await query(
            `INSERT INTO sla_history (entity_id, entity_type, assigned_to, event_type, effective_sla_hours, hours_elapsed, hours_overdue)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              m.id, 'merchant', m.assigned_to, status,
              effectiveHours,
              Math.round(hoursElapsed * 10) / 10,
              status === 'breached' ? Math.round((hoursElapsed - effectiveHours) * 10) / 10 : null,
            ]
          );
          await notifySlaEvent(m.id, 'merchant', status, evalResult, m.assigned_to, entityName, io);
        }
      } else if (status === 'ok') {
        // Check if we need to record a recovery
        const lastEvent = await queryOne<any>(
          `SELECT event_type FROM sla_history
           WHERE entity_id = $1 AND entity_type = 'merchant'
           ORDER BY occurred_at DESC LIMIT 1`,
          [m.id]
        );
        if (lastEvent && lastEvent.event_type !== 'recovered') {
          await query(
            `INSERT INTO sla_history (entity_id, entity_type, assigned_to, event_type, effective_sla_hours, hours_elapsed)
             VALUES ($1, $2, $3, 'recovered', $4, $5)`,
            [m.id, 'merchant', m.assigned_to, effectiveHours, Math.round(hoursElapsed * 10) / 10]
          );
        }
      }
    } catch (err) {
      console.error(`[SLA] Error evaluating merchant ${m.id}:`, err);
    }
  }
}

// ─── Task SLA evaluation ──────────────────────────────────────────────────────

export async function evaluateTasksSla(io?: SocketServer): Promise<void> {
  const config = await loadSlaConfig();
  const alertThreshold = getAlertThreshold(config);
  const now = Date.now();

  const tasks = await query<any>(
    `SELECT t.id, t.title, t.priority, t.status, t.created_at, t.assigned_to
     FROM tasks t
     WHERE t.assigned_to IS NOT NULL
     AND t.status IN ('pending', 'in_progress')`
  );

  for (const t of tasks) {
    try {
      const priorityEntry = config.find(
        c => c.entity_type === 'task_priority' && c.entity_key === t.priority
      );
      const maxHours = priorityEntry?.max_hours ?? null;
      if (maxHours === null) continue;

      const hoursElapsed = (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
      const status = classifySlaStatus(hoursElapsed, maxHours, alertThreshold);
      const hoursRemaining = Math.max(0, maxHours - hoursElapsed);

      const evalResult: SlaEvalResult = {
        entity_id: t.id, entity_type: 'task', status,
        effective_sla_hours: maxHours,
        hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        hours_remaining: Math.round(hoursRemaining * 10) / 10,
        sla_by_status: null, sla_by_risk: null,
        last_activity_at: t.created_at,
      };

      if (status === 'warning' || status === 'breached') {
        const alreadyNotified = await hasRecentSlaEvent(t.id, 'task', status);
        if (!alreadyNotified) {
          await query(
            `INSERT INTO sla_history (entity_id, entity_type, assigned_to, event_type, effective_sla_hours, hours_elapsed, hours_overdue)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              t.id, 'task', t.assigned_to, status,
              maxHours,
              Math.round(hoursElapsed * 10) / 10,
              status === 'breached' ? Math.round((hoursElapsed - maxHours) * 10) / 10 : null,
            ]
          );
          await notifySlaEvent(t.id, 'task', status, evalResult, t.assigned_to, t.title, io);
        }
      } else if (status === 'ok') {
        const lastEvent = await queryOne<any>(
          `SELECT event_type FROM sla_history
           WHERE entity_id = $1 AND entity_type = 'task'
           ORDER BY occurred_at DESC LIMIT 1`,
          [t.id]
        );
        if (lastEvent && lastEvent.event_type !== 'recovered') {
          await query(
            `INSERT INTO sla_history (entity_id, entity_type, assigned_to, event_type, effective_sla_hours, hours_elapsed)
             VALUES ($1, $2, $3, 'recovered', $4, $5)`,
            [t.id, 'task', t.assigned_to, maxHours, Math.round(hoursElapsed * 10) / 10]
          );
        }
      }
    } catch (err) {
      console.error(`[SLA] Error evaluating task ${t.id}:`, err);
    }
  }
}
