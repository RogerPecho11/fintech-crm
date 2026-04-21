import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { triggerWebhooks } from '../services/webhookService';
import { isFinalized } from '../lib/finalized';

const router = Router();
router.use(authenticate);

// GET /api/v1/comments/merchant/:merchantId
router.get('/merchant/:merchantId', async (req: AuthenticatedRequest, res: Response) => {
  const comments = await query(
    `SELECT c.*, u.first_name || ' ' || u.last_name as user_name,
            u.role as user_role, u.avatar_url
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.merchant_id = $1
     ORDER BY c.created_at ASC`,
    [req.params.merchantId]
  );
  res.json(comments);
});

// POST /api/v1/comments
router.post('/', [
  body('merchant_id').notEmpty().isUUID(),
  body('content').notEmpty().trim(),
  body('is_internal').optional().isBoolean(),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const user = req.user!;

  // ── Regla: rol commercial no puede agregar comentarios ────────────────────
  if (user.role === 'commercial') {
    return res.status(403).json({
      error: 'El rol Comercial no tiene permisos para agregar comentarios.',
      code: 'ROLE_FORBIDDEN',
    });
  }

  const { merchant_id, content, is_internal = true, parent_id } = req.body;

  const merchant = await queryOne<any>('SELECT id, status FROM merchants WHERE id = $1', [merchant_id]);
  if (!merchant) {
    return res.status(404).json({ error: 'Merchant not found' });
  }

  // ── Regla: comercio finalizado — no se permiten nuevos comentarios ────────
  if (isFinalized(merchant.status)) {
    return res.status(403).json({
      error: 'Este comercio está finalizado. No se pueden agregar comentarios.',
      code: 'MERCHANT_FINALIZED',
    });
  }

  const [comment] = await query(
    `INSERT INTO comments (merchant_id, user_id, content, is_internal, parent_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [merchant_id, user.id, content, is_internal, parent_id || null]
  );

  await query('UPDATE merchants SET last_activity_at = NOW() WHERE id = $1', [merchant_id]);

  const fullComment = await queryOne(
    `SELECT c.*, u.first_name || ' ' || u.last_name as user_name,
            u.role as user_role, u.avatar_url
     FROM comments c JOIN users u ON c.user_id = u.id
     WHERE c.id = $1`,
    [comment.id]
  );

  if (req.io) {
    req.io.to(`merchant:${merchant_id}`).emit('comment:new', fullComment);
  }

  await triggerWebhooks('comment.added', { merchantId: merchant_id, comment: fullComment });

  res.status(201).json(fullComment);
});

// PUT /api/v1/comments/:id
router.put('/:id', [
  body('content').notEmpty().trim(),
], async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const comment = await queryOne<any>('SELECT * FROM comments WHERE id = $1', [req.params.id]);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot edit this comment' });
  }

  const [updated] = await query(
    'UPDATE comments SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [req.body.content, req.params.id]
  );
  res.json(updated);
});

// DELETE /api/v1/comments/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const comment = await queryOne<any>('SELECT * FROM comments WHERE id = $1', [req.params.id]);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot delete this comment' });
  }

  await query('DELETE FROM comments WHERE id = $1', [req.params.id]);
  res.json({ message: 'Comment deleted' });
});

export default router;
