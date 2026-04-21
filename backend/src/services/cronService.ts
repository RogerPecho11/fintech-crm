import cron from 'node-cron';
import { Server as SocketServer } from 'socket.io';
import { getInactiveMerchants, recalculateAllScores } from './scoringService';
import { createNotification } from './notificationService';
import { query } from '../database/connection';
import { evaluateMerchantsSla, evaluateTasksSla } from './slaService';

export function startCronJobs(io: SocketServer): void {
  // Check for inactive merchants every hour
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Checking inactive merchants...');
    await checkInactiveMerchants(io);
  });

  // Recalculate scores every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Recalculating merchant scores...');
    await recalculateAllScores();
  });

  // Check overdue tasks every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await checkOverdueTasks(io);
  });

  // ── SLA evaluation — merchants every hour ──────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Evaluating merchant SLAs...');
    try {
      await evaluateMerchantsSla(io);
    } catch (err) {
      console.error('❌ SLA merchant evaluation error:', err);
    }
  });

  // ── SLA evaluation — tasks every 30 minutes ────────────────────────────────
  cron.schedule('*/30 * * * *', async () => {
    try {
      await evaluateTasksSla(io);
    } catch (err) {
      console.error('❌ SLA task evaluation error:', err);
    }
  });

  // Daily cleanup of old webhook logs (keep 30 days)
  cron.schedule('0 2 * * *', async () => {
    await query(
      `DELETE FROM webhook_logs WHERE attempted_at < NOW() - INTERVAL '30 days'`
    );
    console.log('🧹 Cleaned up old webhook logs');
  });
}

async function checkInactiveMerchants(io: SocketServer): Promise<void> {
  const inactiveMerchants = await getInactiveMerchants(48);

  for (const merchant of inactiveMerchants) {
    if (!merchant.assigned_to) continue;

    const lastActivity = new Date(merchant.last_activity_at);
    const hoursInactive = Math.round(
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60)
    );

    await createNotification(
      merchant.assigned_to,
      'inactivity_alert',
      '⚠️ Comercio sin actividad',
      `${merchant.legal_name} lleva ${hoursInactive} horas sin actividad`,
      merchant.id,
      { hoursInactive, merchantName: merchant.legal_name },
      io
    );
  }
}

async function checkOverdueTasks(io: SocketServer): Promise<void> {
  const overdueTasks = await query(
    `SELECT t.*, m.legal_name as merchant_name 
     FROM tasks t
     LEFT JOIN merchants m ON t.merchant_id = m.id
     WHERE t.status IN ('pending', 'in_progress')
     AND t.due_date < NOW()
     AND t.assigned_to IS NOT NULL`
  );

  for (const task of overdueTasks) {
    await createNotification(
      task.assigned_to,
      'task_due',
      '⏰ Tarea vencida',
      `La tarea "${task.title}" está vencida${task.merchant_name ? ` (${task.merchant_name})` : ''}`,
      task.merchant_id,
      { taskId: task.id, taskTitle: task.title },
      io
    );
  }
}
