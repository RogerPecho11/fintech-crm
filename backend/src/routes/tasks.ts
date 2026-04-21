import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { createNotification } from '../services/notificationService';
import { triggerWebhooks } from '../services/webhookService';

const router = Router();
router.use(authenticate);

// GET /api/v1/tasks
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const { merchant_id, assigned_to, status, priority, page = '1', limit = '20' } = req.query as Record<string, string>;
  const user = req.user!;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (merchant_id) { conditions.push(`t.merchant_id = $${idx++}`); params.push(merchant_id); }
  if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
  if (priority) { conditions.push(`t.priority = $${idx++}`); params.push(priority); }

  // Commercial users only see their own tasks
  if (user.role === 'commercial') {
    conditions.push(`(t.assigned_to = $${idx} OR t.created_by = $${idx})`);
    params.push(user.id);
    idx++;
  } else if (assigned_to) {
    conditions.push(`t.assigned_to = $${idx++}`);
    params.push(assigned_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  const [tasks, countResult] = await Promise.all([
    query(
      `SELECT t.*, 
        m.legal_name as merchant_name,
        u.first_name || ' ' || u.last_name as assigned_to_name,
        cb.first_name || ' ' || cb.last_name as created_by_name
       FROM tasks t
       LEFT JOIN merchants m ON t.merchant_id = m.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       ${where}
       ORDER BY 
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.due_date ASC NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) as total FROM tasks t ${where}`, params),
  ]);

  res.json({
    data: tasks,
    total: parseInt(countResult[0]?.total || '0'),
    page: pageNum,
    limit: limitNum,
  });
});

// POST /api/v1/tasks
router.post('/', [
  body('title').notEmpty().trim(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('due_date').optional().isISO8601(),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const user = req.user!;
  const { title, description, merchant_id, assigned_to, priority = 'medium', due_date } = req.body;

  const [task] = await query(
    `INSERT INTO tasks (title, description, merchant_id, created_by, assigned_to, priority, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [title, description, merchant_id || null, user.id, assigned_to || null, priority, due_date || null]
  );

  // Notify assigned user
  if (assigned_to && assigned_to !== user.id) {
    await createNotification(
      assigned_to,
      'task_assigned',
      'Nueva tarea asignada',
      `Se te asignó la tarea: "${title}"`,
      merchant_id,
      { taskId: task.id },
      req.io
    );
  }

  if (merchant_id) {
    await query('UPDATE merchants SET last_activity_at = NOW() WHERE id = $1', [merchant_id]);
  }

  res.status(201).json(task);
});

// PUT /api/v1/tasks/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, status, priority, due_date, assigned_to } = req.body;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
  if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
  if (due_date !== undefined) { updates.push(`due_date = $${idx++}`); values.push(due_date); }
  if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx++}`); values.push(assigned_to); }

  if (status === 'completed') {
    updates.push(`completed_at = NOW()`);
    await triggerWebhooks('task.completed', { taskId: task.id, title: task.title });
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const [updated] = await query(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (task.merchant_id) {
    await query('UPDATE merchants SET last_activity_at = NOW() WHERE id = $1', [task.merchant_id]);
  }

  if (req.io) {
    req.io.to(`merchant:${task.merchant_id}`).emit('task:updated', updated);
  }

  res.json(updated);
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const task = await queryOne('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.json({ message: 'Task deleted' });
});

export default router;
