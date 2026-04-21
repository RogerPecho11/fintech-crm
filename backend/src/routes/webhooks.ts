import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate, authorize('admin'));

// GET /api/v1/webhooks
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  const webhooks = await query(
    `SELECT w.*, u.first_name || ' ' || u.last_name as created_by_name,
      (SELECT COUNT(*) FROM webhook_logs wl WHERE wl.webhook_id = w.id) as total_calls,
      (SELECT COUNT(*) FROM webhook_logs wl WHERE wl.webhook_id = w.id AND wl.success = true) as successful_calls
     FROM webhook_configs w
     LEFT JOIN users u ON w.created_by = u.id
     ORDER BY w.created_at DESC`
  );
  res.json(webhooks);
});

// POST /api/v1/webhooks
router.post('/', [
  body('name').notEmpty().trim(),
  body('url').isURL(),
  body('events').isArray({ min: 1 }),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const user = req.user!;
  const { name, url, secret, events } = req.body;

  const [webhook] = await query(
    `INSERT INTO webhook_configs (name, url, secret, events, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, url, secret || null, events, user.id]
  );

  res.status(201).json(webhook);
});

// PUT /api/v1/webhooks/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const webhook = await queryOne('SELECT * FROM webhook_configs WHERE id = $1', [req.params.id]);
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

  const { name, url, secret, events, is_active } = req.body;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
  if (url !== undefined) { updates.push(`url = $${idx++}`); values.push(url); }
  if (secret !== undefined) { updates.push(`secret = $${idx++}`); values.push(secret); }
  if (events !== undefined) { updates.push(`events = $${idx++}`); values.push(events); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const [updated] = await query(
    `UPDATE webhook_configs SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  res.json(updated);
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  await query('DELETE FROM webhook_configs WHERE id = $1', [req.params.id]);
  res.json({ message: 'Webhook deleted' });
});

// GET /api/v1/webhooks/:id/logs
router.get('/:id/logs', async (req: AuthenticatedRequest, res: Response) => {
  const logs = await query(
    `SELECT * FROM webhook_logs WHERE webhook_id = $1 ORDER BY attempted_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(logs);
});

export default router;
