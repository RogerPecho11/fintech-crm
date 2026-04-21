import { query, queryOne } from '../database/connection';
import { Merchant } from '../types';
import { isFinalized, FINALIZED_STATUSES } from '../lib/finalized';

// Score mínimo garantizado al finalizar
const MIN_SCORE_ON_FINALIZED = 80;

interface ScoreFactors {
  completeness:  number; // 0-30
  activity:      number; // 0-25
  documentation: number; // 0-20
  integration:   number; // 0-15
  risk:          number; // 0-10
}

export async function calculateMerchantScore(merchantId: string): Promise<number> {
  const merchant = await queryOne<Merchant>(
    'SELECT * FROM merchants WHERE id = $1',
    [merchantId]
  );
  if (!merchant) return 0;

  // ── Regla: comercio finalizado — el score se congela ────────────────────
  if (isFinalized(merchant.status)) {
    const currentScore = merchant.score ?? 0;
    if (currentScore < MIN_SCORE_ON_FINALIZED) {
      await query(
        'UPDATE merchants SET score = $1, updated_at = NOW() WHERE id = $2',
        [MIN_SCORE_ON_FINALIZED, merchantId]
      );
      return MIN_SCORE_ON_FINALIZED;
    }
    // Score ya es >= 80, no tocar
    return currentScore;
  }

  // ── Cálculo normal para estados activos ───────────────────────────────────
  const factors = await computeScoreFactors(merchant);
  const totalScore = Math.min(100, Math.max(0, Math.round(
    factors.completeness +
    factors.activity +
    factors.documentation +
    factors.integration +
    factors.risk
  )));

  await query(
    'UPDATE merchants SET score = $1, updated_at = NOW() WHERE id = $2',
    [totalScore, merchantId]
  );

  return totalScore;
}

async function computeScoreFactors(merchant: Merchant): Promise<ScoreFactors> {
  // 1. Completitud del perfil (0-30)
  const completenessScore = calculateCompleteness(merchant);

  // 2. Actividad reciente (0-25)
  const activityScore = calculateActivityScore(merchant.last_activity_at);

  // 3. Documentos subidos (0-20) — 4 pts por doc, máx 5 docs
  const docCount = await query(
    'SELECT COUNT(*) as count FROM documents WHERE merchant_id = $1',
    [merchant.id]
  );
  const docs = parseInt(docCount[0]?.count || '0');
  const documentationScore = Math.min(20, docs * 4);

  // 4. Integración técnica (0-15)
  let integrationScore = 0;
  if (merchant.integration_type) integrationScore += 5;
  if (merchant.api_endpoint)     integrationScore += 5;
  if (merchant.webhook_url)      integrationScore += 3;
  if (merchant.ip_whitelist && merchant.ip_whitelist.length > 0) integrationScore += 2;

  // 5. Nivel de riesgo (0-10) — menor riesgo = mayor score
  const riskScores: Record<string, number> = {
    // Valores originales del enum
    low: 10, medium: 7, high: 3, critical: 0,
    // Nuevos niveles dinámicos
    diamond: 10, gold: 8, silver: 6, bronze: 3,
  };
  const riskScore = riskScores[merchant.risk_level] ?? 5;

  return { completeness: completenessScore, activity: activityScore, documentation: documentationScore, integration: integrationScore, risk: riskScore };
}

function calculateCompleteness(merchant: Merchant): number {
  const fields = [
    merchant.legal_name,
    merchant.trade_name,
    merchant.tax_id,
    merchant.country,
    merchant.city,
    merchant.address,
    merchant.website,
    merchant.mcc_code,
    merchant.contact_name,
    merchant.contact_email,
    merchant.contact_phone,
    merchant.bank_name,
    merchant.bank_account_number,
    merchant.monthly_volume,
    merchant.average_ticket,
  ];
  const filled = fields.filter(f => f !== null && f !== undefined && f !== '').length;
  return Math.round((filled / fields.length) * 30);
}

function calculateActivityScore(lastActivity: Date): number {
  const diffHours = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
  if (diffHours < 24)  return 25;
  if (diffHours < 48)  return 20;
  if (diffHours < 72)  return 15;
  if (diffHours < 168) return 10; // 1 semana
  if (diffHours < 720) return 5;  // 1 mes
  return 0;
}

export async function recalculateAllScores(): Promise<void> {
  // Excluir estados finalizados del recálculo automático
  const merchants = await query<{ id: string }>(
    `SELECT id FROM merchants WHERE TRIM(LOWER(status)) NOT IN (${FINALIZED_STATUSES.map((_, i) => '$' + (i + 1)).join(',')})`,
    FINALIZED_STATUSES
  );
  for (const m of merchants) {
    await calculateMerchantScore(m.id);
  }
}

export async function getInactiveMerchants(thresholdHours = 48): Promise<Merchant[]> {
  const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
  const excluded = [...FINALIZED_STATUSES, 'suspended'];
  return query<Merchant>(
    `SELECT * FROM merchants
     WHERE last_activity_at < $1
     AND TRIM(LOWER(status)) NOT IN (${excluded.map((_, i) => '$' + (i + 2)).join(',')})
     ORDER BY last_activity_at ASC`,
    [threshold, ...excluded]
  );
}

/** Verifica si un estado es de tipo "finalizado" */
export function isFinalizedStatus(status: string): boolean {
  return FINALIZED_STATUSES.includes(status);
}
