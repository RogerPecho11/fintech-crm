import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { AuthenticatedRequest } from '../types';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = await queryOne(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const { password_hash, ...userWithoutPassword } = user;

  res.json({
    token,
    user: userWithoutPassword,
  });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { password_hash, ...user } = req.user as any;
  res.json(user);
});

// PUT /api/v1/auth/change-password
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;
  const user = req.user!;

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, user.id]);

  res.json({ message: 'Password updated successfully' });
});

// PUT /api/v1/auth/profile
router.put('/profile', authenticate, [
  body('first_name').optional().notEmpty(),
  body('last_name').optional().notEmpty(),
  body('phone').optional(),
], async (req: AuthenticatedRequest, res: Response) => {
  const { first_name, last_name, phone } = req.body;
  const user = req.user!;

  const updated = await queryOne(
    `UPDATE users SET 
      first_name = COALESCE($1, first_name),
      last_name = COALESCE($2, last_name),
      phone = COALESCE($3, phone),
      updated_at = NOW()
     WHERE id = $4
     RETURNING id, email, first_name, last_name, role, phone, avatar_url, is_active, last_login, created_at`,
    [first_name, last_name, phone, user.id]
  );

  res.json(updated);
});

export default router;
