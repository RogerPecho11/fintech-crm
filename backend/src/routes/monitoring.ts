import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// Todos los endpoints devuelven vacío para no romper llamadas pendientes
router.get('/daily-volume', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/by-method', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/approval-rate', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/alerts', (_req: AuthenticatedRequest, res: Response) => res.json({ inactivity: [], drops: [], payoutTime: [] }));
router.get('/payout-time', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/methods-by-commerce', (_req: AuthenticatedRequest, res: Response) => res.json({ payin: [], payout: [] }));
router.get('/commerces', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/countries', (_req: AuthenticatedRequest, res: Response) => res.json([]));
router.get('/commerce-info/:id', (_req: AuthenticatedRequest, res: Response) => res.json({}));

export default router;
