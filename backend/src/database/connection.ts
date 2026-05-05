import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // required by Render
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'fintech_crm',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    await runMigrations(client);
  } finally {
    client.release();
  }
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn('Slow query detected:', { text, duration, rows: res.rowCount });
  }
  return res.rows;
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations(client: PoolClient): Promise<void> {
  // Create migrations table
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const migrations = getMigrations();

  for (const migration of migrations) {
    const exists = await client.query(
      'SELECT id FROM migrations WHERE name = $1',
      [migration.name]
    );

    if (exists.rows.length === 0) {
      console.log(`Running migration: ${migration.name}`);
      await client.query(migration.sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
      console.log(`✅ Migration completed: ${migration.name}`);
    }
  }
}

function getMigrations() {
  return [
    {
      name: '001_create_users',
      sql: `
        CREATE TYPE user_role AS ENUM ('admin', 'commercial', 'onboarding');
        
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          role user_role NOT NULL DEFAULT 'commercial',
          avatar_url VARCHAR(500),
          phone VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_users_email ON users(email);
        CREATE INDEX idx_users_role ON users(role);
      `
    },
    {
      name: '002_create_merchants',
      sql: `
        CREATE TYPE merchant_status AS ENUM (
          'lead', 'pending', 'in_review', 'documentation_required',
          'approved', 'rejected', 'certified', 'suspended', 'inactive'
        );

        CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');

        CREATE TABLE IF NOT EXISTS merchants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          
          -- General Info
          legal_name VARCHAR(255) NOT NULL,
          trade_name VARCHAR(255),
          tax_id VARCHAR(100) NOT NULL,
          country VARCHAR(100) NOT NULL,
          state VARCHAR(100),
          city VARCHAR(100),
          address TEXT,
          postal_code VARCHAR(20),
          website VARCHAR(500),
          
          -- MCC
          mcc_code VARCHAR(10) NOT NULL,
          mcc_description VARCHAR(255),
          business_type VARCHAR(100),
          industry VARCHAR(100),
          
          -- Contact
          contact_name VARCHAR(255) NOT NULL,
          contact_email VARCHAR(255) NOT NULL,
          contact_phone VARCHAR(50),
          contact_position VARCHAR(100),
          secondary_contact_name VARCHAR(255),
          secondary_contact_email VARCHAR(255),
          secondary_contact_phone VARCHAR(50),
          
          -- Banking
          bank_name VARCHAR(255),
          bank_account_number VARCHAR(100),
          bank_account_type VARCHAR(50),
          bank_routing_number VARCHAR(100),
          bank_swift VARCHAR(50),
          bank_iban VARCHAR(100),
          bank_country VARCHAR(100),
          
          -- Payment Methods
          accepts_credit_card BOOLEAN DEFAULT false,
          accepts_debit_card BOOLEAN DEFAULT false,
          accepts_ach BOOLEAN DEFAULT false,
          accepts_wire BOOLEAN DEFAULT false,
          accepts_crypto BOOLEAN DEFAULT false,
          payment_methods_detail JSONB DEFAULT '[]',
          
          -- Operational Limits
          monthly_volume DECIMAL(15,2),
          average_ticket DECIMAL(15,2),
          max_transaction DECIMAL(15,2),
          min_transaction DECIMAL(15,2),
          currency VARCHAR(10) DEFAULT 'USD',
          
          -- Technical Info
          integration_type VARCHAR(100),
          api_endpoint VARCHAR(500),
          webhook_url VARCHAR(500),
          ip_whitelist TEXT[],
          technical_contact_email VARCHAR(255),
          technical_contact_phone VARCHAR(50),
          
          -- Status & Scoring
          status merchant_status DEFAULT 'lead',
          risk_level risk_level DEFAULT 'medium',
          score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
          priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
          
          -- Metadata
          assigned_to UUID REFERENCES users(id),
          onboarding_started_at TIMESTAMP,
          onboarding_completed_at TIMESTAMP,
          last_activity_at TIMESTAMP DEFAULT NOW(),
          notes TEXT,
          tags TEXT[],
          
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_merchants_status ON merchants(status);
        CREATE INDEX idx_merchants_assigned_to ON merchants(assigned_to);
        CREATE INDEX idx_merchants_tax_id ON merchants(tax_id);
        CREATE INDEX idx_merchants_mcc ON merchants(mcc_code);
        CREATE INDEX idx_merchants_last_activity ON merchants(last_activity_at);
        CREATE INDEX idx_merchants_score ON merchants(score);
      `
    },
    {
      name: '003_create_comments',
      sql: `
        CREATE TABLE IF NOT EXISTS comments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id),
          content TEXT NOT NULL,
          is_internal BOOLEAN DEFAULT true,
          parent_id UUID REFERENCES comments(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_comments_merchant ON comments(merchant_id);
        CREATE INDEX idx_comments_user ON comments(user_id);
      `
    },
    {
      name: '004_create_documents',
      sql: `
        CREATE TYPE document_type AS ENUM (
          'certification', 'identity', 'bank_statement', 'tax_document',
          'contract', 'evidence', 'other'
        );

        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
          uploaded_by UUID NOT NULL REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          file_size INTEGER NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          document_type document_type DEFAULT 'other',
          description TEXT,
          is_verified BOOLEAN DEFAULT false,
          verified_by UUID REFERENCES users(id),
          verified_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_documents_merchant ON documents(merchant_id);
      `
    },
    {
      name: '005_create_tasks',
      sql: `
        CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
        CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES users(id),
          assigned_to UUID REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status task_status DEFAULT 'pending',
          priority task_priority DEFAULT 'medium',
          due_date TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_tasks_merchant ON tasks(merchant_id);
        CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX idx_tasks_status ON tasks(status);
        CREATE INDEX idx_tasks_due_date ON tasks(due_date);
      `
    },
    {
      name: '006_create_calendar_events',
      sql: `
        CREATE TABLE IF NOT EXISTS calendar_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          all_day BOOLEAN DEFAULT false,
          location VARCHAR(255),
          attendees UUID[],
          reminder_minutes INTEGER DEFAULT 30,
          color VARCHAR(20) DEFAULT '#3B82F6',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_events_merchant ON calendar_events(merchant_id);
        CREATE INDEX idx_events_start ON calendar_events(start_time);
        CREATE INDEX idx_events_created_by ON calendar_events(created_by);
      `
    },
    {
      name: '007_create_webhooks',
      sql: `
        CREATE TYPE webhook_event AS ENUM (
          'merchant.created', 'merchant.updated', 'merchant.status_changed',
          'document.uploaded', 'task.completed', 'comment.added'
        );

        CREATE TABLE IF NOT EXISTS webhook_configs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          url VARCHAR(500) NOT NULL,
          secret VARCHAR(255),
          events webhook_event[] NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS webhook_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
          event webhook_event NOT NULL,
          payload JSONB NOT NULL,
          response_status INTEGER,
          response_body TEXT,
          success BOOLEAN DEFAULT false,
          attempted_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_webhook_logs_webhook ON webhook_logs(webhook_id);
        CREATE INDEX idx_webhook_logs_event ON webhook_logs(event);
      `
    },
    {
      name: '008_create_notifications',
      sql: `
        CREATE TYPE notification_type AS ENUM (
          'inactivity_alert', 'status_change', 'task_due', 'document_required',
          'comment_mention', 'task_assigned', 'general'
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
          type notification_type NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_notifications_user ON notifications(user_id);
        CREATE INDEX idx_notifications_read ON notifications(is_read);
        CREATE INDEX idx_notifications_created ON notifications(created_at);
      `
    },
    {
      name: '009_create_audit_log',
      sql: `
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id),
          merchant_id UUID REFERENCES merchants(id),
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(100),
          entity_id UUID,
          old_values JSONB,
          new_values JSONB,
          ip_address VARCHAR(50),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_audit_merchant ON audit_logs(merchant_id);
        CREATE INDEX idx_audit_user ON audit_logs(user_id);
        CREATE INDEX idx_audit_action ON audit_logs(action);
        CREATE INDEX idx_audit_created ON audit_logs(created_at);
      `
    },
    {
      name: '010_create_status_history',
      sql: `
        CREATE TABLE IF NOT EXISTS merchant_status_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
          changed_by UUID NOT NULL REFERENCES users(id),
          old_status VARCHAR(100),
          new_status VARCHAR(100) NOT NULL,
          reason TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_status_history_merchant ON merchant_status_history(merchant_id);
      `
    },
    {
      name: '011_create_sla_config',
      sql: `
        CREATE TABLE IF NOT EXISTS sla_config (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_type     VARCHAR(50)  NOT NULL,
          entity_key      VARCHAR(100) NOT NULL,
          max_hours       DECIMAL(8,2),
          alert_threshold_pct INTEGER,
          updated_by      UUID REFERENCES users(id),
          updated_at      TIMESTAMP DEFAULT NOW(),
          created_at      TIMESTAMP DEFAULT NOW(),
          CONSTRAINT uq_sla_config_entity UNIQUE (entity_type, entity_key)
        );

        CREATE INDEX idx_sla_config_type ON sla_config(entity_type);
      `
    },
    {
      name: '012_create_sla_history',
      sql: `
        CREATE TABLE IF NOT EXISTS sla_history (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_id           UUID NOT NULL,
          entity_type         VARCHAR(20) NOT NULL CHECK (entity_type IN ('merchant', 'task')),
          assigned_to         UUID REFERENCES users(id),
          event_type          VARCHAR(20) NOT NULL CHECK (event_type IN ('warning', 'breached', 'recovered')),
          effective_sla_hours DECIMAL(8,2),
          hours_elapsed       DECIMAL(8,2) NOT NULL,
          hours_overdue       DECIMAL(8,2),
          occurred_at         TIMESTAMP DEFAULT NOW(),
          created_at          TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX idx_sla_history_entity   ON sla_history(entity_id, entity_type);
        CREATE INDEX idx_sla_history_assigned ON sla_history(assigned_to);
        CREATE INDEX idx_sla_history_occurred ON sla_history(occurred_at);
        CREATE INDEX idx_sla_history_event    ON sla_history(event_type);
      `
    },
    {
      name: '013_extend_notification_type',
      sql: `
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'sla_warning';
        ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'sla_breach';
      `
    },
    {
      name: '014_relax_merchant_constraints',
      sql: `
        -- Make required columns optional for flexible form flow
        ALTER TABLE merchants ALTER COLUMN tax_id DROP NOT NULL;
        ALTER TABLE merchants ALTER COLUMN country DROP NOT NULL;
        ALTER TABLE merchants ALTER COLUMN mcc_code DROP NOT NULL;
        ALTER TABLE merchants ALTER COLUMN contact_name DROP NOT NULL;
        ALTER TABLE merchants ALTER COLUMN contact_email DROP NOT NULL;

        -- Change status from ENUM to VARCHAR for dynamic statuses
        ALTER TABLE merchants ALTER COLUMN status TYPE VARCHAR(100) USING status::text;
        ALTER TABLE merchants ALTER COLUMN status SET DEFAULT 'lead';

        -- Change risk_level from ENUM to VARCHAR for dynamic risk levels
        ALTER TABLE merchants ALTER COLUMN risk_level TYPE VARCHAR(100) USING risk_level::text;
        ALTER TABLE merchants ALTER COLUMN risk_level SET DEFAULT 'diamond';
      `
    },
    {
      name: '015_add_onboarding_assigned_to',
      sql: `
        ALTER TABLE merchants ADD COLUMN IF NOT EXISTS onboarding_assigned_to UUID REFERENCES users(id);
        CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_assigned ON merchants(onboarding_assigned_to);
      `
    },
    {
      name: '016_create_app_config',
      sql: `
        CREATE TABLE IF NOT EXISTS app_config (
          key         VARCHAR(100) PRIMARY KEY,
          value       JSONB NOT NULL,
          updated_by  UUID REFERENCES users(id),
          updated_at  TIMESTAMP DEFAULT NOW()
        );
      `
    },
    {
      name: '017_create_mexico_submissions',
      sql: `
        CREATE TABLE IF NOT EXISTS mexico_submissions (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          giro            VARCHAR(50) NOT NULL,
          mcc             VARCHAR(20),
          trade_name      VARCHAR(255) NOT NULL,
          legal_name      VARCHAR(255),
          rfc             VARCHAR(100),
          address         TEXT,
          postal_code     VARCHAR(20),
          website         VARCHAR(255),
          phone           VARCHAR(50),
          fiscal_doc_path VARCHAR(255),
          ine_doc_path    VARCHAR(255),
          domicilio_doc_path VARCHAR(255),
          acta_doc_path   VARCHAR(255),
          licencia_doc_path VARCHAR(255),
          status          VARCHAR(20) DEFAULT 'pending',
          notes           TEXT,
          created_at      TIMESTAMP DEFAULT NOW(),
          updated_at      TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mexico_submissions_status ON mexico_submissions(status);
        CREATE INDEX IF NOT EXISTS idx_mexico_submissions_created ON mexico_submissions(created_at DESC);
      `
    }
  ];
}

export default pool;
