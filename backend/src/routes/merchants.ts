import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, queryOne, transaction } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { calculateMerchantScore } from '../services/scoringService';
import { triggerWebhooks } from '../services/webhookService';
import { notifyStatusChange } from '../services/notificationService';
import { isFinalized, FINALIZED_STATUSES } from '../lib/finalized';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/merchants ────────────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const {
    page = '1', limit = '20', status, search, assigned_to,
    risk_level, mcc_code, sort = 'created_at', order = 'desc',
  } = req.query as Record<string, string>;

  const pageNum  = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset   = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: any[]        = [];
  let idx = 1;

  if (status)      { conditions.push('m.status = $'      + idx++); params.push(status); }
  if (risk_level)  { conditions.push('m.risk_level = $'  + idx++); params.push(risk_level); }
  if (mcc_code)    { conditions.push('m.mcc_code = $'    + idx++); params.push(mcc_code); }
  if (assigned_to) { conditions.push('m.assigned_to = $' + idx++); params.push(assigned_to); }
  if (search) {
    conditions.push(
      '(m.legal_name ILIKE $' + idx + ' OR m.trade_name ILIKE $' + idx +
      ' OR m.tax_id ILIKE $' + idx + ' OR m.contact_email ILIKE $' + idx + ')'
    );
    params.push('%' + search + '%');
    idx++;
  }

  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const allowedSorts = ['created_at', 'updated_at', 'legal_name', 'score', 'last_activity_at', 'status'];
  const sortField    = allowedSorts.includes(sort) ? sort : 'created_at';
  const sortOrder    = order === 'asc' ? 'ASC' : 'DESC';

  const [merchants, countResult] = await Promise.all([
    query(
      `SELECT m.*,
         u.first_name || ' ' || u.last_name AS assigned_to_name,
         u.email AS assigned_to_email,
         ob.first_name || ' ' || ob.last_name AS onboarding_assigned_to_name
       FROM merchants m
       LEFT JOIN users u ON m.assigned_to = u.id
       LEFT JOIN users ob ON m.onboarding_assigned_to = ob.id
       ${whereClause}
       ORDER BY m.${sortField} ${sortOrder}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM merchants m ${whereClause}`, params),
  ]);

  res.json({
    data: merchants,
    total: parseInt(countResult[0]?.total || '0'),
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(parseInt(countResult[0]?.total || '0') / limitNum),
  });
});

// ─── GET /api/v1/merchants/:id ────────────────────────────────────────────────
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const merchant = await queryOne(
    `SELECT m.*,
       u.first_name  || ' ' || u.last_name  AS assigned_to_name,
       u.email AS assigned_to_email,
       ob.first_name || ' ' || ob.last_name AS onboarding_assigned_to_name,
       ob.email AS onboarding_assigned_to_email,
       cb.first_name || ' ' || cb.last_name AS created_by_name
     FROM merchants m
     LEFT JOIN users u  ON m.assigned_to = u.id
     LEFT JOIN users ob ON m.onboarding_assigned_to = ob.id
     LEFT JOIN users cb ON m.created_by  = cb.id
     WHERE m.id = $1`,
    [req.params.id]
  );
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

  const statusHistory = await query(
    `SELECT sh.*, u.first_name || ' ' || u.last_name AS changed_by_name
     FROM merchant_status_history sh
     JOIN users u ON sh.changed_by = u.id
     WHERE sh.merchant_id = $1
     ORDER BY sh.created_at DESC`,
    [req.params.id]
  );

  res.json({ ...merchant, statusHistory });
});

// ─── POST /api/v1/merchants ───────────────────────────────────────────────────
router.post('/', [
  body('legal_name').optional(),
  body('contact_email').optional().custom((value) => {
    if (value && value.trim() !== '' && !/.+@.+\..+/.test(value)) {
      throw new Error('Email inválido');
    }
    return true;
  }),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const user = req.user!;
  const d    = req.body;

  // contact_name & mcc_code are optional now (new form flow)
  const legalName   = d.legal_name || d.trade_name || 'Sin nombre';
  const contactName = d.contact_name || d.trade_name || 'Contacto';

  const merchant = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO merchants (
        legal_name, trade_name, tax_id, country, state, city, address, postal_code, website,
        mcc_code, mcc_description, business_type, industry,
        contact_name, contact_email, contact_phone, contact_position,
        secondary_contact_name, secondary_contact_email, secondary_contact_phone,
        bank_name, bank_account_number, bank_account_type, bank_routing_number,
        bank_swift, bank_iban, bank_country,
        accepts_credit_card, accepts_debit_card, accepts_ach, accepts_wire, accepts_crypto,
        payment_methods_detail, monthly_volume, average_ticket, max_transaction, min_transaction, currency,
        integration_type, api_endpoint, webhook_url, ip_whitelist,
        technical_contact_email, technical_contact_phone,
        status, risk_level, assigned_to, onboarding_assigned_to, notes, tags, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
        $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51
      ) RETURNING *`,
      [
        legalName,           d.trade_name || null,     d.tax_id || null,
        d.country || null,   d.state || null,           d.city || null,
        d.address || null,   d.postal_code || null,     d.website || null,
        d.mcc_code || null,  d.mcc_description || null, d.business_type || null,
        d.industry || null,
        contactName,         d.contact_email || null,   d.contact_phone || null,
        d.contact_position || null,
        d.secondary_contact_name || null, d.secondary_contact_email || null,
        d.secondary_contact_phone || null,
        d.bank_name || null, d.bank_account_number || null, d.bank_account_type || null,
        d.bank_routing_number || null, d.bank_swift || null,
        d.bank_iban || null, d.bank_country || null,
        d.accepts_credit_card  || false,
        d.accepts_debit_card   || false,
        d.accepts_ach          || false,
        d.accepts_wire         || false,
        d.accepts_crypto       || false,
        JSON.stringify(d.payment_methods_detail || []),
        d.monthly_volume    || null, d.average_ticket || null,
        d.max_transaction   || null, d.min_transaction || null,
        d.currency          || 'USD',
        d.integration_type  || null, d.api_endpoint || null,
        d.webhook_url       || null, d.ip_whitelist  || [],
        d.technical_contact_email || null, d.technical_contact_phone || null,
        d.status     || 'lead',
        d.risk_level || 'medium',
        d.assigned_to || user.id,
        d.onboarding_assigned_to || null,
        d.notes || null,
        d.tags  || [],
        user.id,
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, merchant_id, action, entity_type, entity_id, new_values)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, result.rows[0].id, 'CREATE', 'merchant', result.rows[0].id, result.rows[0]]
    );

    return result.rows[0];
  });

  await calculateMerchantScore(merchant.id);
  await triggerWebhooks('merchant.created', merchant);
  if (req.io) req.io.emit('merchant:created', merchant);

  res.status(201).json(merchant);
});

// ─── PUT /api/v1/merchants/:id ────────────────────────────────────────────────
router.put('/:id', authorize('admin', 'onboarding'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const existing = await queryOne('SELECT * FROM merchants WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ error: 'Merchant not found' });

  const d = req.body;
  const allowedFields = [
    'legal_name','trade_name','tax_id','country','state','city','address',
    'postal_code','website','mcc_code','mcc_description','business_type','industry',
    'contact_name','contact_email','contact_phone','contact_position',
    'secondary_contact_name','secondary_contact_email','secondary_contact_phone',
    'bank_name','bank_account_number','bank_account_type','bank_routing_number',
    'bank_swift','bank_iban','bank_country',
    'accepts_credit_card','accepts_debit_card','accepts_ach','accepts_wire','accepts_crypto',
    'payment_methods_detail','monthly_volume','average_ticket','max_transaction',
    'min_transaction','currency','integration_type','api_endpoint','webhook_url',
    'ip_whitelist','technical_contact_email','technical_contact_phone',
    'risk_level','assigned_to','onboarding_assigned_to','notes','tags',
  ];

  const sets: string[]  = [];
  const vals: any[]     = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (d[field] !== undefined) {
      const val = field === 'payment_methods_detail' ? JSON.stringify(d[field]) : d[field];
      sets.push(field + ' = $' + idx++);
      vals.push(val);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  sets.push('last_activity_at = NOW()');
  sets.push('updated_at = NOW()');
  vals.push(id);

  const [updated] = await query(
    'UPDATE merchants SET ' + sets.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
    vals
  );

  await query(
    `INSERT INTO audit_logs (user_id, merchant_id, action, entity_type, entity_id, old_values, new_values)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, id, 'UPDATE', 'merchant', id, existing, updated]
  );

  await calculateMerchantScore(id);
  await triggerWebhooks('merchant.updated', updated);
  if (req.io) req.io.to('merchant:' + id).emit('merchant:updated', updated);

  res.json(updated);
});

// ─── PATCH /api/v1/merchants/:id/status ──────────────────────────────────────
router.patch('/:id/status',
  authorize('admin', 'onboarding'),   // commercial excluded
  [body('status').notEmpty()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = req.user!;
    const { id } = req.params;
    // Sanitize: trim and remove trailing underscores
    const status = (req.body.status || '').trim().replace(/^_+|_+$/g, '');
    const { reason } = req.body;

    const existing = await queryOne<any>('SELECT * FROM merchants WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Merchant not found' });

    // ── Regla: solo se puede finalizar si score >= 80 ─────────────────────
    if (FINALIZED_STATUSES.includes(status.trim().toLowerCase()) && !isFinalized(existing.status)) {
      const currentScore = existing.score ?? 0;
      if (currentScore < 80) {
        return res.status(422).json({
          error: `No se puede cambiar a "${status}". El comercio necesita un Score mínimo de 80 (actual: ${currentScore}).`,
          code: 'SCORE_TOO_LOW',
          currentScore,
          requiredScore: 80,
        });
      }
    }

    // ── Regla: comercio ya finalizado — no se puede cambiar estado ────────
    if (isFinalized(existing.status)) {
      return res.status(403).json({
        error: 'Este comercio está finalizado. No se puede cambiar su estado.',
        code: 'MERCHANT_FINALIZED',
      });
    }

    // Status is now VARCHAR — accept any value (dynamic statuses from dashboard)
    let extraSql = '';
    if (status === 'in_review' && !existing.onboarding_started_at) {
      extraSql += ', onboarding_started_at = NOW()';
    }
    if (status === 'certified' || status === 'finalizado') {
      extraSql += ', onboarding_completed_at = NOW()';
    }

    const [updated] = await query(
      `UPDATE merchants
       SET status = $1,
           last_activity_at = NOW(),
           updated_at = NOW()
           ${extraSql}
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    await query(
      `INSERT INTO merchant_status_history (merchant_id, changed_by, old_status, new_status, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, user.id, existing.status, status, reason || null]
    );

    await query(
      `INSERT INTO audit_logs (user_id, merchant_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user.id, id, 'STATUS_CHANGE', 'merchant', id, { status: existing.status }, { status }]
    );

    await notifyStatusChange(id, existing.legal_name, existing.status, status, req.io);
    await triggerWebhooks('merchant.status_changed', {
      merchantId: id,
      merchantName: existing.legal_name,
      oldStatus: existing.status,
      newStatus: status,
    });

    // Recalculate score — applies minimum 80 rule if status is finalizado
    await calculateMerchantScore(id);

    // Fetch updated merchant with fresh score to return correct data
    const finalMerchant = await queryOne('SELECT * FROM merchants WHERE id = $1', [id]);

    if (req.io) {
      req.io.to('merchant:' + id).emit('merchant:status_changed', { merchantId: id, status });
      req.io.emit('dashboard:refresh');
    }

    res.json(finalMerchant);
  }
);

// ─── GET /api/v1/merchants/:id/timeline ──────────────────────────────────────
router.get('/:id/timeline', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const [comments, statusHistory, documents, tasks] = await Promise.all([
    query(
      `SELECT c.*, u.first_name || ' ' || u.last_name AS user_name,
              u.role AS user_role, u.avatar_url, 'comment' AS type
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.merchant_id = $1`, [id]
    ),
    query(
      `SELECT sh.*, u.first_name || ' ' || u.last_name AS user_name, 'status_change' AS type
       FROM merchant_status_history sh JOIN users u ON sh.changed_by = u.id
       WHERE sh.merchant_id = $1`, [id]
    ),
    query(
      `SELECT d.*, u.first_name || ' ' || u.last_name AS user_name, 'document' AS type
       FROM documents d JOIN users u ON d.uploaded_by = u.id
       WHERE d.merchant_id = $1`, [id]
    ),
    query(
      `SELECT t.*, u.first_name || ' ' || u.last_name AS assigned_name, 'task' AS type
       FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.merchant_id = $1`, [id]
    ),
  ]);

  const timeline = [...comments, ...statusHistory, ...documents, ...tasks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(timeline);
});

// ─── DELETE /api/v1/merchants/:id ─────────────────────────────────────────────
router.delete('/:id', authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existing = await queryOne('SELECT id FROM merchants WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ error: 'Merchant not found' });

  await query('DELETE FROM merchants WHERE id = $1', [id]);
  res.json({ message: 'Merchant deleted successfully' });
});

export default router;
