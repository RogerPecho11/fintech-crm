import { Router, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/config — todos los roles autenticados ───────────────────────
// Devuelve toda la configuración de la app (estados, riesgos, métodos de pago, etc.)
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  const rows = await query('SELECT key, value FROM app_config');
  const config: Record<string, any> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  res.json(config);
});

// ─── GET /api/v1/config/:key — todos los roles autenticados ──────────────────
router.get('/:key', async (req: AuthenticatedRequest, res: Response) => {
  const { key } = req.params;
  const row = await queryOne('SELECT value FROM app_config WHERE key = $1', [key]);
  if (!row) return res.status(404).json({ error: `Configuración "${key}" no encontrada.` });
  res.json(row.value);
});

// ─── PUT /api/v1/config/:key — admin y onboarding ───────────────────────────
router.put('/:key', authorize('admin', 'onboarding'), async (req: AuthenticatedRequest, res: Response) => {
  const { key } = req.params;
  const value = req.body;
  const user = req.user!;

  const validKeys = ['statuses', 'risk_levels', 'payment_methods', 'mcc_codes', 'business_types', 'industries', 'categories', 'countries'];
  if (!validKeys.includes(key)) {
    return res.status(400).json({ error: `Clave inválida: ${key}. Claves válidas: ${validKeys.join(', ')}` });
  }

  if (!value || (Array.isArray(value) && value.length === 0)) {
    return res.status(400).json({ error: 'El valor no puede estar vacío.' });
  }

  await query(
    `INSERT INTO app_config (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, JSON.stringify(value), user.id]
  );

  res.json({ message: `Configuración "${key}" actualizada.`, value });
});

// ─── PUT /api/v1/config — admin y onboarding (bulk update) ───────────────────
router.put('/', authorize('admin', 'onboarding'), async (req: AuthenticatedRequest, res: Response) => {
  const updates: Record<string, any> = req.body;
  const user = req.user!;

  const validKeys = ['statuses', 'risk_levels', 'payment_methods', 'mcc_codes', 'business_types', 'industries', 'categories', 'countries'];

  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.includes(key)) continue;
    await query(
      `INSERT INTO app_config (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, JSON.stringify(value), user.id]
    );
  }

  res.json({ message: 'Configuración actualizada.' });
});

export default router;
