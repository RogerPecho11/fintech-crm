import { Router, Response, Request } from 'express';
import { query, queryOne } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { AuthenticatedRequest } from '../types';

const router = Router();

// ─── POST /api/v1/mexico/submit — público (sin auth) ────────────────────────
// Recibe el formulario de México con archivos adjuntos
router.post(
  '/submit',
  upload.fields([
    { name: 'fiscal_doc', maxCount: 1 },
    { name: 'ine_doc', maxCount: 1 },
    { name: 'domicilio_doc', maxCount: 1 },
    { name: 'acta_doc', maxCount: 1 },
    { name: 'licencia_doc', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const { giro, mcc, trade_name, legal_name, rfc, address, postal_code, website, phone } = req.body;

    if (!trade_name || !giro) {
      return res.status(400).json({ error: 'Nombre del comercio y Giro son obligatorios.' });
    }

    const files = req.files as Record<string, Express.Multer.File[]>;

    const [submission] = await query(
      `INSERT INTO mexico_submissions (giro, mcc, trade_name, legal_name, rfc, address, postal_code, website, phone,
        fiscal_doc_path, ine_doc_path, domicilio_doc_path, acta_doc_path, licencia_doc_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        giro, mcc, trade_name, legal_name, rfc, address, postal_code, website, phone,
        files?.fiscal_doc?.[0]?.filename || null,
        files?.ine_doc?.[0]?.filename || null,
        files?.domicilio_doc?.[0]?.filename || null,
        files?.acta_doc?.[0]?.filename || null,
        files?.licencia_doc?.[0]?.filename || null,
      ]
    );

    res.status(201).json({ message: 'Formulario enviado exitosamente.', id: submission.id });
  }
);

// ─── GET /api/v1/mexico/submissions — autenticado ────────────────────────────
router.get('/submissions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { status, page = '1', limit = '50' } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 200);
  const offset = (pageNum - 1) * limitNum;

  const [submissions, countResult] = await Promise.all([
    query(
      `SELECT * FROM mexico_submissions ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM mexico_submissions ${where}`, params),
  ]);

  res.json({
    data: submissions,
    total: parseInt(countResult[0]?.total || '0'),
    page: pageNum,
    limit: limitNum,
  });
});

// ─── GET /api/v1/mexico/submissions/:id — autenticado ────────────────────────
router.get('/submissions/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const submission = await queryOne('SELECT * FROM mexico_submissions WHERE id = $1', [id]);
  if (!submission) return res.status(404).json({ error: 'Submission not found' });
  res.json(submission);
});

// ─── PUT /api/v1/mexico/submissions/:id/status — solo admin ──────────────────
router.put('/submissions/:id/status', authenticate, authorize('admin', 'onboarding'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['pending', 'reviewed', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Use: ${validStatuses.join(', ')}` });
  }

  await query(
    'UPDATE mexico_submissions SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3',
    [status, notes || null, id]
  );

  res.json({ message: 'Estado actualizado.' });
});

export default router;
