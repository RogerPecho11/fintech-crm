import { Router, Response } from 'express';
import { query } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /api/v1/dashboard/metrics
router.get('/metrics', async (_req: AuthenticatedRequest, res: Response) => {
  const [
    totalResult,
    byStatus,
    avgOnboarding,
    activeThisWeek,
    pendingTasks,
    riskDistribution,
    topScores,
    recentActivity,
    monthlyTrend,
  ] = await Promise.all([
    // Total merchants
    query('SELECT COUNT(*) as total FROM merchants'),

    // By status
    query(`
      SELECT status, COUNT(*) as count 
      FROM merchants 
      GROUP BY status 
      ORDER BY count DESC
    `),

    // Average onboarding time (days)
    query(`
      SELECT AVG(EXTRACT(EPOCH FROM (onboarding_completed_at - onboarding_started_at)) / 86400) as avg_days
      FROM merchants
      WHERE onboarding_completed_at IS NOT NULL AND onboarding_started_at IS NOT NULL
    `),

    // Active this week
    query(`
      SELECT COUNT(*) as count FROM merchants
      WHERE last_activity_at > NOW() - INTERVAL '7 days'
    `),

    // Pending tasks
    query(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status IN ('pending', 'in_progress')
    `),

    // Risk distribution
    query(`
      SELECT risk_level, COUNT(*) as count
      FROM merchants
      GROUP BY risk_level
    `),

    // Top scored merchants
    query(`
      SELECT id, legal_name, trade_name, score, status, risk_level
      FROM merchants
      ORDER BY score DESC
      LIMIT 5
    `),

    // Recent activity (last 10 events)
    query(`
      SELECT al.*, u.first_name || ' ' || u.last_name as user_name, m.legal_name as merchant_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN merchants m ON al.merchant_id = m.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `),

    // Monthly trend (last 6 months)
    query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as new_merchants,
        COUNT(*) FILTER (WHERE status = 'certified') as certified
      FROM merchants
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `),
  ]);

  const total = parseInt(totalResult[0]?.total || '0');
  const certified = byStatus.find((s: any) => s.status === 'certified');
  const conversionRate = total > 0 ? Math.round((parseInt(certified?.count || '0') / total) * 100) : 0;

  res.json({
    totalMerchants: total,
    merchantsByStatus: byStatus.reduce((acc: any, row: any) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {}),
    avgOnboardingDays: Math.round(parseFloat(avgOnboarding[0]?.avg_days || '0') * 10) / 10,
    conversionRate,
    activeThisWeek: parseInt(activeThisWeek[0]?.count || '0'),
    pendingTasks: parseInt(pendingTasks[0]?.count || '0'),
    riskDistribution: riskDistribution.reduce((acc: any, row: any) => {
      acc[row.risk_level] = parseInt(row.count);
      return acc;
    }, {}),
    topScores,
    recentActivity,
    monthlyTrend,
  });
});

// GET /api/v1/dashboard/team-performance
router.get('/team-performance', async (req: AuthenticatedRequest, res: Response) => {
  const { role, date_from, date_to } = req.query as Record<string, string>;

  const conditions: string[] = ['u.is_active = true'];
  const params: any[] = [];
  let idx = 1;

  if (role) {
    conditions.push('u.role = $' + idx++);
    params.push(role);
  }

  // Date filters apply to merchant assignment period
  const merchantDateFilter = date_from || date_to
    ? 'AND ' + [
        date_from ? 'm.created_at >= $' + idx++ : null,
        date_to   ? 'm.created_at <= $' + idx++ : null,
      ].filter(Boolean).join(' AND ')
    : '';

  if (date_from) params.push(date_from);
  if (date_to)   params.push(date_to + ' 23:59:59');

  const taskDateFilter = date_from || date_to
    ? 'AND ' + [
        date_from ? 't.created_at >= $' + (params.indexOf(date_from) + 1) : null,
        date_to   ? 't.created_at <= $' + (params.indexOf(date_to + ' 23:59:59') + 1) : null,
      ].filter(Boolean).join(' AND ')
    : '';

  const where = 'WHERE ' + conditions.join(' AND ');

  const performance = await query(
    `SELECT
       u.id,
       u.first_name || ' ' || u.last_name AS name,
       u.role,
       COUNT(DISTINCT m.id)                                                          AS assigned_merchants,
       COUNT(DISTINCT m.id) FILTER (WHERE TRIM(LOWER(m.status)) IN ('certified','finalizado')) AS certified_merchants,
       COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')                   AS completed_tasks,
       COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('pending', 'in_progress'))   AS pending_tasks,
       ROUND(AVG(m.score)::numeric, 1)                                               AS avg_merchant_score
     FROM users u
     LEFT JOIN merchants m ON m.assigned_to = u.id ${merchantDateFilter}
     LEFT JOIN tasks t     ON t.assigned_to  = u.id ${taskDateFilter}
     ${where}
     GROUP BY u.id, u.first_name, u.last_name, u.role
     ORDER BY certified_merchants DESC, assigned_merchants DESC`,
    params
  );

  res.json(performance);
});

// GET /api/v1/dashboard/inactivity-alerts
router.get('/inactivity-alerts', async (_req: AuthenticatedRequest, res: Response) => {
  const alerts = await query(`
    SELECT m.id, m.legal_name, m.status, m.last_activity_at,
      EXTRACT(EPOCH FROM (NOW() - m.last_activity_at)) / 3600 as hours_inactive,
      u.first_name || ' ' || u.last_name as assigned_to_name
    FROM merchants m
    LEFT JOIN users u ON m.assigned_to = u.id
    WHERE m.last_activity_at < NOW() - INTERVAL '48 hours'
    AND m.status NOT IN ('rejected', 'inactive', 'certified')
    ORDER BY m.last_activity_at ASC
    LIMIT 20
  `);

  res.json(alerts);
});

export default router;
