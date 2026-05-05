// ─────────────────────────────────────────────────────────────
//  Configuración dinámica del CRM (persiste en localStorage)
//  Estados, Niveles de Riesgo, Métodos de Pago, MCC Codes,
//  Tipos de Comercio, Rubros y Categorías son editables
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

export interface MccCode {
  code: string;
  description: string;
}

export interface BusinessType {
  value: string;
  label: string;
}

export interface IndustryConfig {
  value: string;
  label: string;
}

export interface CategoryConfig {
  value: string;
  label: string;
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

export const DEFAULT_MCC_CODES: MccCode[] = [
  { code: '5411', description: 'Grocery Stores, Supermarkets' },
  { code: '5812', description: 'Eating Places, Restaurants' },
  { code: '5999', description: 'Miscellaneous and Specialty Retail Stores' },
  { code: '7372', description: 'Computer Programming, Data Processing' },
  { code: '5045', description: 'Computers, Peripherals, and Software' },
  { code: '5912', description: 'Drug Stores and Pharmacies' },
  { code: '5311', description: 'Department Stores' },
  { code: '5651', description: 'Family Clothing Stores' },
  { code: '5661', description: 'Shoe Stores' },
  { code: '5732', description: 'Electronics Stores' },
  { code: '5511', description: 'Car and Truck Dealers' },
  { code: '7011', description: 'Hotels, Motels, Resorts' },
  { code: '4111', description: 'Transportation - Suburban and Local' },
  { code: '4814', description: 'Telecommunication Services' },
  { code: '6011', description: 'Financial Institutions' },
  { code: '7941', description: 'Sports Clubs, Fields, Athletic Instruction' },
  { code: '8099', description: 'Health Practitioners' },
  { code: '8049', description: 'Offices and Clinics of Other Health Practitioners' },
  { code: '5047', description: 'Medical and Dental Laboratories' },
  { code: '5065', description: 'Electrical Parts and Equipment' },
];

export const DEFAULT_BUSINESS_TYPES: BusinessType[] = [
  { value: 'e-commerce', label: 'E-commerce' },
  { value: 'retail', label: 'Retail' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'saas', label: 'SaaS' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'salud', label: 'Salud' },
  { value: 'educación', label: 'Educación' },
  { value: 'turismo', label: 'Turismo' },
  { value: 'otro', label: 'Otro' },
];

export const DEFAULT_INDUSTRIES: IndustryConfig[] = [
  { value: 'tecnología', label: 'Tecnología' },
  { value: 'comercio', label: 'Comercio' },
  { value: 'servicios_financieros', label: 'Servicios Financieros' },
  { value: 'salud', label: 'Salud' },
  { value: 'educación', label: 'Educación' },
  { value: 'turismo', label: 'Turismo' },
  { value: 'alimentación', label: 'Alimentación' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'entretenimiento', label: 'Entretenimiento' },
  { value: 'otro', label: 'Otro' },
];

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { value: 'pequeño_comercio', label: 'Pequeño Comercio' },
  { value: 'mediano_comercio', label: 'Mediano Comercio' },
  { value: 'gran_empresa', label: 'Gran Empresa' },
  { value: 'corporativo', label: 'Corporativo' },
  { value: 'startup', label: 'Startup' },
  { value: 'otro', label: 'Otro' },
];

// ── Storage keys ──────────────────────────────────────────────
const KEY_STATUSES  = 'crm_statuses';
const KEY_RISKS     = 'crm_risk_levels';
const KEY_PAYMENTS  = 'crm_payment_methods';
const KEY_MCC_CODES      = 'crm_mcc_codes';
const KEY_BUSINESS_TYPES = 'crm_business_types';
const KEY_INDUSTRIES     = 'crm_industries';
const KEY_CATEGORIES     = 'crm_categories';

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

export function getMccCodes(): MccCode[] {
  try {
    const s = localStorage.getItem(KEY_MCC_CODES);
    return s ? JSON.parse(s) : DEFAULT_MCC_CODES;
  } catch { return DEFAULT_MCC_CODES; }
}

export function getBusinessTypes(): BusinessType[] {
  try {
    const s = localStorage.getItem(KEY_BUSINESS_TYPES);
    return s ? JSON.parse(s) : DEFAULT_BUSINESS_TYPES;
  } catch { return DEFAULT_BUSINESS_TYPES; }
}

export function getIndustries(): IndustryConfig[] {
  try {
    const s = localStorage.getItem(KEY_INDUSTRIES);
    return s ? JSON.parse(s) : DEFAULT_INDUSTRIES;
  } catch { return DEFAULT_INDUSTRIES; }
}

export function getCategories(): CategoryConfig[] {
  try {
    const s = localStorage.getItem(KEY_CATEGORIES);
    return s ? JSON.parse(s) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}

// ── Setters ───────────────────────────────────────────────────
export function saveStatuses(list: MerchantStatusConfig[]): void {
  localStorage.setItem(KEY_STATUSES, JSON.stringify(list));
  _syncToServer('statuses', list);
}

export function saveRiskLevels(list: RiskLevelConfig[]): void {
  localStorage.setItem(KEY_RISKS, JSON.stringify(list));
  _syncToServer('risk_levels', list);
}

export function savePaymentMethods(list: PaymentMethod[]): void {
  localStorage.setItem(KEY_PAYMENTS, JSON.stringify(list));
  _syncToServer('payment_methods', list);
}

export function saveMccCodes(list: MccCode[]): void {
  localStorage.setItem(KEY_MCC_CODES, JSON.stringify(list));
  _syncToServer('mcc_codes', list);
}

export function saveBusinessTypes(list: BusinessType[]): void {
  localStorage.setItem(KEY_BUSINESS_TYPES, JSON.stringify(list));
  _syncToServer('business_types', list);
}

export function saveIndustries(list: IndustryConfig[]): void {
  localStorage.setItem(KEY_INDUSTRIES, JSON.stringify(list));
  _syncToServer('industries', list);
}

export function saveCategories(list: CategoryConfig[]): void {
  localStorage.setItem(KEY_CATEGORIES, JSON.stringify(list));
  _syncToServer('categories', list);
}

// ── Server sync ───────────────────────────────────────────────
import api from './api';

function _syncToServer(key: string, value: any): void {
  api.put(`/config/${key}`, value).catch(err => {
    console.warn(`[Config] Error syncing "${key}" to server:`, err.message);
  });
}

/** Carga la configuración desde el servidor y actualiza localStorage.
 *  Llamar al iniciar la app para que todos los usuarios tengan la misma config. */
export async function syncConfigFromServer(): Promise<void> {
  try {
    const res = await api.get('/config');
    const data = res.data;

    if (data.statuses) localStorage.setItem(KEY_STATUSES, JSON.stringify(data.statuses));
    if (data.risk_levels) localStorage.setItem(KEY_RISKS, JSON.stringify(data.risk_levels));
    if (data.payment_methods) localStorage.setItem(KEY_PAYMENTS, JSON.stringify(data.payment_methods));
    if (data.mcc_codes) localStorage.setItem(KEY_MCC_CODES, JSON.stringify(data.mcc_codes));
    if (data.business_types) localStorage.setItem(KEY_BUSINESS_TYPES, JSON.stringify(data.business_types));
    if (data.industries) localStorage.setItem(KEY_INDUSTRIES, JSON.stringify(data.industries));
    if (data.categories) localStorage.setItem(KEY_CATEGORIES, JSON.stringify(data.categories));
    if (data.countries) localStorage.setItem('prontopaga_active_countries', JSON.stringify(data.countries));
  } catch (err: any) {
    console.warn('[Config] Error loading config from server:', err.message);
  }
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
