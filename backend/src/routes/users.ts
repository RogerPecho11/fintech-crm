import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /api/v1/users
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  const users = await query(
    `SELECT id, email, first_name, last_name, role, phone, avatar_url, is_active, last_login, created_at
     FROM users ORDER BY first_name ASC`
  );
  res.json(users);
});

// GET /api/v1/users/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const user = await queryOne(
    `SELECT id, email, first_name, last_name, role, phone, avatar_url, is_active, last_login, created_at
     FROM users WHERE id = $1`,
    [req.params.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST /api/v1/users (admin only)
router.post('/', authorize('admin'), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('role').isIn(['admin', 'commercial', 'onboarding']),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, first_name, last_name, role, phone } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, phone)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, role, phone, is_active, created_at`,
    [email, passwordHash, first_name, last_name, role, phone || null]
  );

  res.status(201).json(user);
});

// PUT /api/v1/users/:id (admin only)
// Supports: first_name, last_name, email, role, phone, is_active, password
router.put('/:id', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { first_name, last_name, email, role, phone, is_active, password } = req.body;

  const updates: string[] = [];
  const values: any[]     = [];
  let idx = 1;

  if (first_name !== undefined) { updates.push('first_name = $' + idx++); values.push(first_name); }
  if (last_name  !== undefined) { updates.push('last_name = $'  + idx++); values.push(last_name); }
  if (email      !== undefined) { updates.push('email = $'      + idx++); values.push(email); }
  if (role       !== undefined) { updates.push('role = $'       + idx++); values.push(role); }
  if (phone      !== undefined) { updates.push('phone = $'      + idx++); values.push(phone); }
  if (is_active  !== undefined) { updates.push('is_active = $'  + idx++); values.push(is_active); }

  // Hash and update password if provided and valid length
  if (password && typeof password === 'string' && password.length >= 8) {
    const hash = await bcrypt.hash(password, 12);
    updates.push('password_hash = $' + idx++);
    values.push(hash);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  const [updated] = await query(
    'UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + idx +
    ' RETURNING id, email, first_name, last_name, role, phone, avatar_url, is_active, created_at',
    values
  );

  if (!updated) return res.status(404).json({ error: 'User not found' });
  res.json(updated);
});

// DELETE /api/v1/users/:id (admin only)
router.delete('/:id', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  if (user.id === id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  }

  const existing = await queryOne('SELECT id FROM users WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // Limpiar todas las referencias al usuario
  await query('UPDATE merchants SET assigned_to = NULL WHERE assigned_to = $1', [id]);
  await query('UPDATE merchants SET onboarding_assigned_to = NULL WHERE onboarding_assigned_to = $1', [id]);
  await query('UPDATE merchants SET created_by = NULL WHERE created_by = $1', [id]);
  await query('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1', [id]);
  await query('UPDATE tasks SET created_by = NULL WHERE created_by = $1', [id]);
  await query('UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = $1', [id]);
  await query('UPDATE documents SET verified_by = NULL WHERE verified_by = $1', [id]);
  await query('UPDATE sla_config SET updated_by = NULL WHERE updated_by = $1', [id]);
  await query('UPDATE app_config SET updated_by = NULL WHERE updated_by = $1', [id]);
  await query('DELETE FROM sla_history WHERE assigned_to = $1', [id]);
  await query('DELETE FROM notifications WHERE user_id = $1', [id]);
  await query('DELETE FROM comments WHERE user_id = $1', [id]);
  await query('DELETE FROM audit_logs WHERE user_id = $1', [id]);
  await query('DELETE FROM merchant_status_history WHERE changed_by = $1', [id]);
  await query('DELETE FROM calendar_events WHERE created_by = $1', [id]);
  await query('DELETE FROM users WHERE id = $1', [id]);

  res.json({ message: 'Usuario eliminado correctamente.' });
});

export default router;
