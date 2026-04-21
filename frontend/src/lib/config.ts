// ─────────────────────────────────────────────────────────────
//  Configuración dinámica del CRM (persiste en localStorage)
//  Estados, Niveles de Riesgo y Métodos de Pago son editables
//  desde el Dashboard por usuarios admin/onboarding.
// ─────────────────────────────────────────────────────────────

export interface MerchantStatusConfig {
  value: string;
  label: string;
  color: string;   // Tailwind bg+text classes
  hex: string;     // Color hex para badges inline
  isDefault: boolean;
}

export interface RiskLevelConfig {
  value: string;
  label: string;
  icon: string;    // emoji
  color: string;
  hex: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'pay_in' | 'pay_out' | 'both';
  countries: string[];  // country codes, empty = all
}

// ── Defaults ──────────────────────────────────────────────────

export const DEFAULT_STATUSES: MerchantStatusConfig[] = [
  { value: 'lead',                   label: 'Lead',                  color: 'bg-gray-100 text-gray-600',                          hex: '#6B7280', isDefault: true },
  { value: 'pending',                label: 'Pendiente',             color: 'bg-yellow-50 text-yellow-700 border border-yellow-200', hex: '#D97706', isDefault: true },
  { value: 'in_review',              label: 'En Revisión',           color: 'bg-blue-50 text-blue-700 border border-blue-200',      hex: '#2563EB', isDefault: true },
  { value: 'documentation_required', label: 'Docs. Requeridos',      color: 'bg-orange-50 text-orange-700 border border-orange-200',hex: '#EA580C', isDefault: true },
  { value: 'approved',               label: 'Aprobado',              color: 'bg-green-50 text-green-700 border border-green-200',   hex: '#16A34A', isDefault: true },
  { value: 'rejected',               label: 'Rechazado',             color: 'bg-red-50 text-red-700 border border-red-200',         hex: '#DC2626', isDefault: true },
  { value: 'certified',              label: 'Certificado',           color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', hex: '#059669', isDefault: true },
  { value: 'finalizado',             label: 'Finalizado',            color: 'bg-teal-50 text-teal-700 border border-teal-200',      hex: '#0D9488', isDefault: true },
  { value: 'suspended',              label: 'Suspendido',            color: 'bg-purple-50 text-purple-700 border border-purple-200', hex: '#7C3AED', isDefault: true },
  { value: 'inactive',               label: 'Inactivo',              color: 'bg-gray-100 text-gray-400',                            hex: '#9CA3AF', isDefault: true },
];

export const DEFAULT_RISK_LEVELS: RiskLevelConfig[] = [
  { value: 'diamond', label: 'Diamante', icon: '💎', color: 'bg-cyan-50 text-cyan-700 border border-cyan-200',     hex: '#0891B2', isDefault: true },
  { value: 'gold',    label: 'Oro',      icon: '🥇', color: 'bg-yellow-50 text-yellow-700 border border-yellow-200', hex: '#D97706', isDefault: true },
  { value: 'silver',  label: 'Plata',    icon: '🥈', color: 'bg-slate-100 text-slate-600 border border-slate-200',  hex: '#64748B', isDefault: true },
  { value: 'bronze',  label: 'Bronce',   icon: '🥉', color: 'bg-orange-50 text-orange-700 border border-orange-200', hex: '#C2410C', isDefault: true },
];

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'card_visa',      name: 'Visa',              type: 'pay_in',  countries: [] },
  { id: 'card_mc',        name: 'Mastercard',        type: 'pay_in',  countries: [] },
  { id: 'card_amex',      name: 'American Express',  type: 'pay_in',  countries: [] },
  { id: 'bank_transfer',  name: 'Transferencia Bancaria', type: 'both', countries: [] },
  { id: 'cash_pe',        name: 'PagoEfectivo',      type: 'pay_in',  countries: ['PE'] },
  { id: 'cash_cl',        name: 'Klap',              type: 'pay_in',  countries: ['CL'] },
  { id: 'cash_ec',        name: 'Efectivo Ecuador',  type: 'pay_in',  countries: ['EC'] },
  { id: 'wallet_yape',    name: 'Yape',              type: 'both',    countries: ['PE'] },
  { id: 'wallet_plin',    name: 'Plin',              type: 'both',    countries: ['PE'] },
  { id: 'wallet_mach',    name: 'MACH',              type: 'both',    countries: ['CL'] },
  { id: 'ach',            name: 'ACH',               type: 'both',    countries: [] },
  { id: 'wire',           name: 'Wire Transfer',     type: 'both',    countries: [] },
  { id: 'crypto',         name: 'Criptomonedas',     type: 'both',    countries: [] },
  { id: 'pay4u',          name: 'Pay4U',             type: 'pay_out', countries: [] },
];

// ── Storage keys ──────────────────────────────────────────────
const KEY_STATUSES  = 'crm_statuses';
const KEY_RISKS     = 'crm_risk_levels';
const KEY_PAYMENTS  = 'crm_payment_methods';

// ── Getters ───────────────────────────────────────────────────
export function getStatuses(): MerchantStatusConfig[] {
  try {
    const s = localStorage.getItem(KEY_STATUSES);
    return s ? JSON.parse(s) : DEFAULT_STATUSES;
  } catch { return DEFAULT_STATUSES; }
}

export function getRiskLevels(): RiskLevelConfig[] {
  try {
    const s = localStorage.getItem(KEY_RISKS);
    return s ? JSON.parse(s) : DEFAULT_RISK_LEVELS;
  } catch { return DEFAULT_RISK_LEVELS; }
}

export function getPaymentMethods(): PaymentMethod[] {
  try {
    const s = localStorage.getItem(KEY_PAYMENTS);
    return s ? JSON.parse(s) : DEFAULT_PAYMENT_METHODS;
  } catch { return DEFAULT_PAYMENT_METHODS; }
}

// ── Setters ───────────────────────────────────────────────────
export function saveStatuses(list: MerchantStatusConfig[]): void {
  localStorage.setItem(KEY_STATUSES, JSON.stringify(list));
}

export function saveRiskLevels(list: RiskLevelConfig[]): void {
  localStorage.setItem(KEY_RISKS, JSON.stringify(list));
}

export function savePaymentMethods(list: PaymentMethod[]): void {
  localStorage.setItem(KEY_PAYMENTS, JSON.stringify(list));
}

// ── Helpers ───────────────────────────────────────────────────
export function getStatusConfig(value: string): MerchantStatusConfig {
  return getStatuses().find(s => s.value === value) ?? {
    value, label: value, color: 'bg-gray-100 text-gray-600', hex: '#6B7280', isDefault: false,
  };
}

export function getRiskConfig(value: string): RiskLevelConfig {
  return getRiskLevels().find(r => r.value === value) ?? {
    value, label: value, icon: '⚪', color: 'bg-gray-100 text-gray-600', hex: '#6B7280', isDefault: false,
  };
}

export function getPaymentMethodsForCountry(countryCode: string, type: 'pay_in' | 'pay_out'): PaymentMethod[] {
  return getPaymentMethods().filter(m =>
    (m.type === type || m.type === 'both') &&
    (m.countries.length === 0 || m.countries.includes(countryCode))
  );
}
