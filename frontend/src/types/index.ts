export type UserRole = 'admin' | 'commercial' | 'onboarding';
export type MerchantStatus = 'lead' | 'pending' | 'in_review' | 'documentation_required' | 'approved' | 'rejected' | 'certified' | 'suspended' | 'inactive';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DocumentType = 'certification' | 'identity' | 'bank_statement' | 'tax_document' | 'contract' | 'evidence' | 'other';
export type NotificationType = 'inactivity_alert' | 'status_change' | 'task_due' | 'document_required' | 'comment_mention' | 'task_assigned' | 'general' | 'sla_warning' | 'sla_breach';

export type SlaStatus = 'ok' | 'warning' | 'breached' | 'excluded';

export interface SlaConfigEntry {
  id?: string;
  entity_type: 'merchant_status' | 'risk_level' | 'task_priority' | 'global';
  entity_key: string;
  max_hours: number | null;
  alert_threshold_pct: number | null;
  updated_at?: string;
}

export interface SlaEvalResult {
  entity_id: string;
  entity_type: 'merchant' | 'task';
  status: SlaStatus;
  effective_sla_hours: number | null;
  hours_elapsed: number;
  hours_remaining: number | null;
  sla_by_status: number | null;
  sla_by_risk: number | null;
  last_activity_at: string;
}

export interface SlaStatusResponse {
  merchants: Record<string, SlaEvalResult>;
  tasks: Record<string, SlaEvalResult>;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url?: string;
  phone?: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

export interface Merchant {
  id: string;
  legal_name: string;
  trade_name?: string;
  tax_id: string;
  country: string;
  state?: string;
  city?: string;
  address?: string;
  postal_code?: string;
  website?: string;
  mcc_code: string;
  mcc_description?: string;
  business_type?: string;
  industry?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  contact_position?: string;
  secondary_contact_name?: string;
  secondary_contact_email?: string;
  secondary_contact_phone?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_type?: string;
  bank_routing_number?: string;
  bank_swift?: string;
  bank_iban?: string;
  bank_country?: string;
  accepts_credit_card: boolean;
  accepts_debit_card: boolean;
  accepts_ach: boolean;
  accepts_wire: boolean;
  accepts_crypto: boolean;
  payment_methods_detail: any[];
  monthly_volume?: number;
  average_ticket?: number;
  max_transaction?: number;
  min_transaction?: number;
  currency: string;
  integration_type?: string;
  api_endpoint?: string;
  webhook_url?: string;
  ip_whitelist?: string[];
  technical_contact_email?: string;
  technical_contact_phone?: string;
  status: MerchantStatus;
  risk_level: RiskLevel;
  score: number;
  priority: number;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_to_email?: string;
  onboarding_started_at?: string;
  onboarding_completed_at?: string;
  last_activity_at: string;
  notes?: string;
  tags?: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  statusHistory?: StatusHistoryEntry[];
}

export interface StatusHistoryEntry {
  id: string;
  merchant_id: string;
  changed_by: string;
  changed_by_name: string;
  old_status?: MerchantStatus;
  new_status: MerchantStatus;
  reason?: string;
  created_at: string;
}

export interface Comment {
  id: string;
  merchant_id: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  avatar_url?: string;
  content: string;
  is_internal: boolean;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  type?: 'comment';
}

export interface Document {
  id: string;
  merchant_id: string;
  uploaded_by: string;
  uploaded_by_name: string;
  name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  document_type: DocumentType;
  description?: string;
  is_verified: boolean;
  verified_by?: string;
  verified_by_name?: string;
  verified_at?: string;
  created_at: string;
  type?: 'document';
}

export interface Task {
  id: string;
  merchant_id?: string;
  merchant_name?: string;
  created_by: string;
  created_by_name: string;
  assigned_to?: string;
  assigned_to_name?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  type?: 'task';
}

export interface CalendarEvent {
  id: string;
  merchant_id?: string;
  merchant_name?: string;
  created_by: string;
  created_by_name: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  location?: string;
  attendees?: string[];
  reminder_minutes: number;
  color: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  merchant_id?: string;
  merchant_name?: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  read_at?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DashboardMetrics {
  totalMerchants: number;
  merchantsByStatus: Record<string, number>;
  avgOnboardingDays: number;
  conversionRate: number;
  activeThisWeek: number;
  pendingTasks: number;
  riskDistribution: Record<string, number>;
  topScores: Merchant[];
  recentActivity: any[];
  monthlyTrend: { month: string; new_merchants: number; certified: number }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const MCC_CODES = [
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

export const STATUS_LABELS: Record<MerchantStatus, string> = {
  lead: 'Lead',
  pending: 'Pendiente',
  in_review: 'En Revisión',
  documentation_required: 'Docs. Requeridos',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  certified: 'Certificado',
  suspended: 'Suspendido',
  inactive: 'Inactivo',
};

export const STATUS_COLORS: Record<MerchantStatus, string> = {
  lead:                    'bg-gray-100 text-gray-600',
  pending:                 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  in_review:               'bg-blue-50 text-blue-700 border border-blue-200',
  documentation_required:  'bg-orange-50 text-orange-700 border border-orange-200',
  approved:                'bg-green-50 text-green-700 border border-green-200',
  rejected:                'bg-red-50 text-red-700 border border-red-200',
  certified:               'bg-emerald-50 text-emerald-700 border border-emerald-200',
  suspended:               'bg-purple-50 text-purple-700 border border-purple-200',
  inactive:                'bg-gray-100 text-gray-400',
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low:      'bg-green-50 text-green-700 border border-green-200',
  medium:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
  high:     'bg-orange-50 text-orange-700 border border-orange-200',
  critical: 'bg-red-50 text-red-700 border border-red-200',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-50 text-blue-700 border border-blue-200',
  high:   'bg-orange-50 text-orange-700 border border-orange-200',
  urgent: 'bg-red-50 text-red-700 border border-red-200',
};
