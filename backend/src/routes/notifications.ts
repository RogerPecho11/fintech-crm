import { Router, Response } from 'express';
import { query } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /api/v1/notifications
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { page = '1', limit = '20', unread_only } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [`n.user_id = $1`];
  const params: any[] = [user.id];
  let idx = 2;

  if (unread_only === 'true') {
    conditions.push(`n.is_read = false`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [notifications, countResult, unreadCount] = await Promise.all([
    query(
      `SELECT n.*, m.legal_name as merchant_name
       FROM notifications n
       LEFT JOIN merchants m ON n.merchant_id = m.id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) as total FROM notifications n ${where}`, params),
    query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false', [user.id]),
  ]);

  res.json({
    data: notifications,
    total: parseInt(countResult[0]?.total || '0'),
    unreadCount: parseInt(unreadCount[0]?.count || '0'),
    page: pageNum,
    limit: limitNum,
  });
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query(
    'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
    [req.params.id, user.id]
  );
  res.json({ message: 'Notification marked as read' });
});

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query(
    'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
    [user.id]
  );
  res.json({ message: 'All notifications marked as read' });
});

// DELETE /api/v1/notifications/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
  res.json({ message: 'Notification deleted' });
});

export default router;
