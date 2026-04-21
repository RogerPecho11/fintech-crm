import { query } from '../database/connection';
import { NotificationType } from '../types';
import { Server as SocketServer } from 'socket.io';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  merchantId?: string,
  metadata: Record<string, any> = {},
  io?: SocketServer
): Promise<void> {
  const [notification] = await query(
    `INSERT INTO notifications (user_id, merchant_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, merchantId || null, type, title, message, metadata]
  );

  // Emit real-time notification via Socket.IO
  if (io) {
    io.to(`user:${userId}`).emit('notification', notification);
  }
}

export async function notifyAllByRole(
  role: string,
  type: NotificationType,
  title: string,
  message: string,
  merchantId?: string,
  metadata: Record<string, any> = {},
  io?: SocketServer
): Promise<void> {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE role = $1 AND is_active = true',
    [role]
  );

  const promises = users.map(user =>
    createNotification(user.id, type, title, message, merchantId, metadata, io)
  );

  await Promise.all(promises);
}

export async function notifyStatusChange(
  merchantId: string,
  merchantName: string,
  oldStatus: string,
  newStatus: string,
  io?: SocketServer
): Promise<void> {
  // Notify all onboarding and admin users
  const users = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'onboarding', 'commercial') AND is_active = true`
  );

  const promises = users.map(user =>
    createNotification(
      user.id,
      'status_change',
      'Estado de comercio actualizado',
      `${merchantName} cambió de "${oldStatus}" a "${newStatus}"`,
      merchantId,
      { oldStatus, newStatus },
      io
    )
  );

  await Promise.all(promises);
}
