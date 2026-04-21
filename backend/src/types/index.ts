import { Request } from 'express';

export type UserRole = 'admin' | 'commercial' | 'onboarding';

export type MerchantStatus =
  | 'lead'
  | 'pending'
  | 'in_review'
  | 'documentation_required'
  | 'approved'
  | 'rejected'
  | 'certified'
  | 'suspended'
  | 'inactive';

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
export type WebhookEvent = 'merchant.created' | 'merchant.updated' | 'merchant.status_changed' | 'document.uploaded' | 'task.completed' | 'comment.added';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url?: string;
  phone?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
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
  onboarding_started_at?: Date;
  onboarding_completed_at?: Date;
  last_activity_at: Date;
  notes?: string;
  tags?: string[];
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Comment {
  id: string;
  merchant_id: string;
  user_id: string;
  content: string;
  is_internal: boolean;
  parent_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  merchant_id: string;
  uploaded_by: string;
  name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  document_type: DocumentType;
  description?: string;
  is_verified: boolean;
  verified_by?: string;
  verified_at?: Date;
  created_at: Date;
}

export interface Task {
  id: string;
  merchant_id?: string;
  created_by: string;
  assigned_to?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CalendarEvent {
  id: string;
  merchant_id?: string;
  created_by: string;
  title: string;
  description?: string;
  start_time: Date;
  end_time?: Date;
  all_day: boolean;
  location?: string;
  attendees?: string[];
  reminder_minutes: number;
  color: string;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  merchant_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  read_at?: Date;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  io?: any;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardMetrics {
  totalMerchants: number;
  merchantsByStatus: Record<string, number>;
  avgOnboardingDays: number;
  conversionRate: number;
  activeThisWeek: number;
  pendingTasks: number;
  recentActivity: any[];
  topPerformers: any[];
  inactivityAlerts: number;
}
