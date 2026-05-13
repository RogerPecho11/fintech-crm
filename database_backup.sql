--
-- PostgreSQL database dump
--

\restrict 1vHppSFaJTx2OmDd26yezWuOXbuKlQ4g81bQRfXOuKU4B3v7hP42qczBwabQbM3

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'certification',
    'identity',
    'bank_statement',
    'tax_document',
    'contract',
    'evidence',
    'other'
);


--
-- Name: merchant_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.merchant_status AS ENUM (
    'lead',
    'pending',
    'in_review',
    'documentation_required',
    'approved',
    'rejected',
    'certified',
    'suspended',
    'inactive'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'inactivity_alert',
    'status_change',
    'task_due',
    'document_required',
    'comment_mention',
    'task_assigned',
    'general',
    'sla_warning',
    'sla_breach'
);


--
-- Name: risk_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical',
    'diamond',
    'gold',
    'silver',
    'bronze'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'commercial',
    'onboarding'
);


--
-- Name: webhook_event; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.webhook_event AS ENUM (
    'merchant.created',
    'merchant.updated',
    'merchant.status_changed',
    'document.uploaded',
    'task.completed',
    'comment.added'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    merchant_id uuid,
    action character varying(100) NOT NULL,
    entity_type character varying(100),
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(50),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    created_by uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    all_day boolean DEFAULT false,
    location character varying(255),
    attendees uuid[],
    reminder_minutes integer DEFAULT 30,
    color character varying(20) DEFAULT '#3B82F6'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    is_internal boolean DEFAULT true,
    parent_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    name character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size integer NOT NULL,
    mime_type character varying(100) NOT NULL,
    document_type public.document_type DEFAULT 'other'::public.document_type,
    description text,
    is_verified boolean DEFAULT false,
    verified_by uuid,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: merchant_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    old_status character varying(100),
    new_status character varying(100) NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legal_name character varying(255) NOT NULL,
    trade_name character varying(255),
    tax_id character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    state character varying(100),
    city character varying(100),
    address text,
    postal_code character varying(20),
    website character varying(500),
    mcc_code character varying(10) NOT NULL,
    mcc_description character varying(255),
    business_type character varying(100),
    industry character varying(100),
    contact_name character varying(255) NOT NULL,
    contact_email character varying(255) NOT NULL,
    contact_phone character varying(50),
    contact_position character varying(100),
    secondary_contact_name character varying(255),
    secondary_contact_email character varying(255),
    secondary_contact_phone character varying(50),
    bank_name character varying(255),
    bank_account_number character varying(100),
    bank_account_type character varying(50),
    bank_routing_number character varying(100),
    bank_swift character varying(50),
    bank_iban character varying(100),
    bank_country character varying(100),
    accepts_credit_card boolean DEFAULT false,
    accepts_debit_card boolean DEFAULT false,
    accepts_ach boolean DEFAULT false,
    accepts_wire boolean DEFAULT false,
    accepts_crypto boolean DEFAULT false,
    payment_methods_detail jsonb DEFAULT '[]'::jsonb,
    monthly_volume numeric(15,2),
    average_ticket numeric(15,2),
    max_transaction numeric(15,2),
    min_transaction numeric(15,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    integration_type character varying(100),
    api_endpoint character varying(500),
    webhook_url character varying(500),
    ip_whitelist text[],
    technical_contact_email character varying(255),
    technical_contact_phone character varying(50),
    status character varying(100) DEFAULT 'lead'::public.merchant_status,
    risk_level public.risk_level DEFAULT 'medium'::public.risk_level,
    score integer DEFAULT 0,
    priority integer DEFAULT 5,
    assigned_to uuid,
    onboarding_started_at timestamp without time zone,
    onboarding_completed_at timestamp without time zone,
    last_activity_at timestamp without time zone DEFAULT now(),
    notes text,
    tags text[],
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT merchants_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT merchants_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp without time zone DEFAULT now()
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    merchant_id uuid,
    type public.notification_type NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sla_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_key character varying(100) NOT NULL,
    max_hours numeric(8,2),
    alert_threshold_pct integer,
    updated_by uuid,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: sla_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    entity_type character varying(20) NOT NULL,
    assigned_to uuid,
    event_type character varying(20) NOT NULL,
    effective_sla_hours numeric(8,2),
    hours_elapsed numeric(8,2) NOT NULL,
    hours_overdue numeric(8,2),
    occurred_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT sla_history_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['merchant'::character varying, 'task'::character varying])::text[]))),
    CONSTRAINT sla_history_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['warning'::character varying, 'breached'::character varying, 'recovered'::character varying])::text[])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    created_by uuid NOT NULL,
    assigned_to uuid,
    title character varying(255) NOT NULL,
    description text,
    status public.task_status DEFAULT 'pending'::public.task_status,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    due_date timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    role public.user_role DEFAULT 'commercial'::public.user_role NOT NULL,
    avatar_url character varying(500),
    phone character varying(50),
    is_active boolean DEFAULT true,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: webhook_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    url character varying(500) NOT NULL,
    secret character varying(255),
    events public.webhook_event[] NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid,
    event public.webhook_event NOT NULL,
    payload jsonb NOT NULL,
    response_status integer,
    response_body text,
    success boolean DEFAULT false,
    attempted_at timestamp without time zone DEFAULT now()
);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, merchant_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at) FROM stdin;
06ec2e0b-69f9-48fd-87a7-939ac0cf6fb8	88dcc2d9-995b-48e7-984c-3109283a3310	94420bd3-250b-417b-8642-d449beea44b3	CREATE	merchant	94420bd3-250b-417b-8642-d449beea44b3	\N	{"id": "94420bd3-250b-417b-8642-d449beea44b3", "city": "Lima", "tags": ["diamante"], "notes": "", "score": 0, "state": "Lima Metropolitana", "status": "pending", "tax_id": "20611494298", "address": "Alfredodo Benavides 266 Dprto 501", "country": "Perú", "website": "https://www.juegaenlinea.pe/", "currency": "EUR", "industry": "", "mcc_code": "8049", "priority": 5, "bank_iban": "", "bank_name": "", "bank_swift": "", "created_at": "2026-04-16T17:15:24.678Z", "created_by": "88dcc2d9-995b-48e7-984c-3109283a3310", "legal_name": "INGUS BRIDGE PERU S.A.C.", "risk_level": "medium", "trade_name": "Juega en Línea", "updated_at": "2026-04-16T17:15:24.678Z", "accepts_ach": false, "assigned_to": "6a1d6d19-de3b-4146-8b6a-91141811199f", "postal_code": "00001", "webhook_url": "http://localhost:3000/merchants/new", "accepts_wire": true, "api_endpoint": "2323", "bank_country": "", "contact_name": "jose", "ip_whitelist": ["Pendiente"], "business_type": "apuesta", "contact_email": "roger.pecho@prontopaga.com", "contact_phone": "99999999", "accepts_crypto": false, "average_ticket": "323232.00", "monthly_volume": "23232.00", "max_transaction": "232.00", "mcc_description": "Offices and Clinics of Other Health Practitioners", "min_transaction": "23232.00", "contact_position": " desarrollador", "integration_type": "api", "last_activity_at": "2026-04-16T17:15:24.678Z", "bank_account_type": "checking", "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": "", "bank_routing_number": "", "onboarding_started_at": null, "payment_methods_detail": [], "secondary_contact_name": "", "onboarding_completed_at": null, "secondary_contact_email": "", "secondary_contact_phone": "", "technical_contact_email": "rogerfrankp@gmail.com", "technical_contact_phone": "232323232"}	\N	\N	2026-04-16 12:15:24.678251
8d8ffc5b-332e-4732-b972-9048aea1c555	a9118708-4ec9-4064-8dd7-21949eb1a94a	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	CREATE	merchant	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	\N	{"id": "c6cb9b8c-6da6-41f0-bbff-b1f148938c19", "city": null, "tags": [], "notes": "d", "score": 0, "state": null, "status": "approved", "tax_id": "34334344", "address": "Av. Manuel Olguin Nro. 335 Int. 1401", "country": "Perú", "website": "https://www.juegaenlinea.pe/", "currency": "USD", "industry": "gambling", "mcc_code": "6011", "priority": 5, "bank_iban": null, "bank_name": null, "bank_swift": null, "created_at": "2026-04-17T01:50:47.435Z", "created_by": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "legal_name": "pruebas", "risk_level": "silver", "trade_name": "pruebas", "updated_at": "2026-04-17T01:50:47.435Z", "accepts_ach": false, "assigned_to": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "postal_code": null, "webhook_url": null, "accepts_wire": false, "api_endpoint": null, "bank_country": null, "contact_name": "pepe", "ip_whitelist": [], "business_type": "Retail", "contact_email": "rogerfrankp@gmail.com", "contact_phone": "99999995", "accepts_crypto": false, "average_ticket": null, "monthly_volume": null, "max_transaction": null, "mcc_description": "Financial Institutions", "min_transaction": null, "contact_position": "vendedor", "integration_type": null, "last_activity_at": "2026-04-17T01:50:47.435Z", "bank_account_type": null, "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": null, "bank_routing_number": null, "onboarding_started_at": null, "payment_methods_detail": [{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}], "secondary_contact_name": null, "onboarding_completed_at": null, "secondary_contact_email": null, "secondary_contact_phone": null, "technical_contact_email": null, "technical_contact_phone": null}	\N	\N	2026-04-16 20:50:47.435192
4b16ee54-d407-409e-b460-d751371f3442	a9118708-4ec9-4064-8dd7-21949eb1a94a	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	UPDATE	merchant	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	{"id": "c6cb9b8c-6da6-41f0-bbff-b1f148938c19", "city": null, "tags": [], "notes": "d", "score": 50, "state": null, "status": "approved", "tax_id": "34334344", "address": "Av. Manuel Olguin Nro. 335 Int. 1401", "country": "Perú", "website": "https://www.juegaenlinea.pe/", "currency": "USD", "industry": "gambling", "mcc_code": "6011", "priority": 5, "bank_iban": null, "bank_name": null, "bank_swift": null, "created_at": "2026-04-17T01:50:47.435Z", "created_by": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "legal_name": "pruebas", "risk_level": "silver", "trade_name": "pruebas", "updated_at": "2026-04-17T01:50:47.446Z", "accepts_ach": false, "assigned_to": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "postal_code": null, "webhook_url": null, "accepts_wire": false, "api_endpoint": null, "bank_country": null, "contact_name": "pepe", "ip_whitelist": [], "business_type": "Retail", "contact_email": "rogerfrankp@gmail.com", "contact_phone": "99999995", "accepts_crypto": false, "average_ticket": null, "monthly_volume": null, "max_transaction": null, "mcc_description": "Financial Institutions", "min_transaction": null, "contact_position": "vendedor", "integration_type": null, "last_activity_at": "2026-04-17T01:50:47.435Z", "bank_account_type": null, "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": null, "bank_routing_number": null, "onboarding_started_at": null, "payment_methods_detail": [{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}], "secondary_contact_name": null, "onboarding_completed_at": null, "secondary_contact_email": null, "secondary_contact_phone": null, "technical_contact_email": null, "technical_contact_phone": null}	{"id": "c6cb9b8c-6da6-41f0-bbff-b1f148938c19", "city": null, "tags": [], "notes": "d", "score": 50, "state": null, "status": "approved", "tax_id": "34334344", "address": "Alfredodo Benavides 266 Dprto 501", "country": "Perú", "website": "https://www.juegaenlinea.pe/", "currency": "USD", "industry": "gambling", "mcc_code": "6011", "priority": 5, "bank_iban": null, "bank_name": null, "bank_swift": null, "created_at": "2026-04-17T01:50:47.435Z", "created_by": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "legal_name": "pruebas", "risk_level": "silver", "trade_name": "pruebas", "updated_at": "2026-04-17T01:52:04.702Z", "accepts_ach": false, "assigned_to": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "postal_code": null, "webhook_url": null, "accepts_wire": false, "api_endpoint": null, "bank_country": null, "contact_name": "pepe", "ip_whitelist": [], "business_type": "Retail", "contact_email": "rogerfrankp@gmail.com", "contact_phone": "99999995", "accepts_crypto": false, "average_ticket": null, "monthly_volume": null, "max_transaction": null, "mcc_description": "Financial Institutions", "min_transaction": null, "contact_position": "vendedor", "integration_type": null, "last_activity_at": "2026-04-17T01:52:04.702Z", "bank_account_type": null, "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": null, "bank_routing_number": null, "onboarding_started_at": null, "payment_methods_detail": [{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}], "secondary_contact_name": null, "onboarding_completed_at": null, "secondary_contact_email": null, "secondary_contact_phone": null, "technical_contact_email": null, "technical_contact_phone": null}	\N	\N	2026-04-16 20:52:04.705724
1677ae3a-5585-4d76-81e9-677595825e39	a9118708-4ec9-4064-8dd7-21949eb1a94a	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	UPDATE	merchant	c6cb9b8c-6da6-41f0-bbff-b1f148938c19	{"id": "c6cb9b8c-6da6-41f0-bbff-b1f148938c19", "city": null, "tags": [], "notes": "d", "score": 50, "state": null, "status": "approved", "tax_id": "34334344", "address": "Alfredodo Benavides 266 Dprto 501", "country": "Perú", "website": "https://www.juegaenlinea.pe/", "currency": "USD", "industry": "gambling", "mcc_code": "6011", "priority": 5, "bank_iban": null, "bank_name": null, "bank_swift": null, "created_at": "2026-04-17T01:50:47.435Z", "created_by": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "legal_name": "pruebas", "risk_level": "silver", "trade_name": "pruebas", "updated_at": "2026-04-17T01:52:04.711Z", "accepts_ach": false, "assigned_to": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "postal_code": null, "webhook_url": null, "accepts_wire": false, "api_endpoint": null, "bank_country": null, "contact_name": "pepe", "ip_whitelist": [], "business_type": "Retail", "contact_email": "rogerfrankp@gmail.com", "contact_phone": "99999995", "accepts_crypto": false, "average_ticket": null, "monthly_volume": null, "max_transaction": null, "mcc_description": "Financial Institutions", "min_transaction": null, "contact_position": "vendedor", "integration_type": null, "last_activity_at": "2026-04-17T01:52:04.702Z", "bank_account_type": null, "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": null, "bank_routing_number": null, "onboarding_started_at": null, "payment_methods_detail": [{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}], "secondary_contact_name": null, "onboarding_completed_at": null, "secondary_contact_email": null, "secondary_contact_phone": null, "technical_contact_email": null, "technical_contact_phone": null}	{"id": "c6cb9b8c-6da6-41f0-bbff-b1f148938c19", "city": null, "tags": [], "notes": "{\\"_meta\\":true,\\"request_type\\":\\"\\",\\"merchant_email\\":\\"rogerfrankp@gmail.com\\",\\"merchant_user\\":\\"pruebas\\",\\"report_email\\":\\"rogerfrankp@gmail.com\\",\\"has_iva\\":\\"yes\\",\\"accepts_third_party\\":\\"yes\\",\\"communication_channel\\":\\"Teams\\",\\"category\\":\\"55\\",\\"origin_country\\":\\"PE\\",\\"risk_label\\":\\"silver\\"}\\ndeeeeee", "score": 50, "state": null, "status": "approved", "tax_id": "34334344", "address": "Av. Manuel Olguin Nro. 335 Int. 1401", "country": "Chile", "website": "https://www.juegaenlinea.pe/", "currency": "USD", "industry": "gambling", "mcc_code": "6011", "priority": 5, "bank_iban": null, "bank_name": null, "bank_swift": null, "created_at": "2026-04-17T01:50:47.435Z", "created_by": "a9118708-4ec9-4064-8dd7-21949eb1a94a", "legal_name": "pruebas", "risk_level": "silver", "trade_name": "pruebas", "updated_at": "2026-04-17T01:56:18.182Z", "accepts_ach": false, "assigned_to": "6a1d6d19-de3b-4146-8b6a-91141811199f", "postal_code": null, "webhook_url": null, "accepts_wire": false, "api_endpoint": null, "bank_country": null, "contact_name": "pepe", "ip_whitelist": [], "business_type": "Retail", "contact_email": "rogerfrankp@gmail.com", "contact_phone": "99999995", "accepts_crypto": false, "average_ticket": null, "monthly_volume": null, "max_transaction": null, "mcc_description": "Financial Institutions", "min_transaction": null, "contact_position": "vendedor", "integration_type": null, "last_activity_at": "2026-04-17T01:56:18.182Z", "bank_account_type": null, "accepts_debit_card": false, "accepts_credit_card": true, "bank_account_number": null, "bank_routing_number": null, "onboarding_started_at": null, "payment_methods_detail": [{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}], "secondary_contact_name": null, "onboarding_completed_at": null, "secondary_contact_email": null, "secondary_contact_phone": null, "technical_contact_email": null, "technical_contact_phone": null}	\N	\N	2026-04-16 20:56:18.186681
0116f11a-d245-4b56-9250-ed4b30d4f684	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	STATUS_CHANGE	merchant	94420bd3-250b-417b-8642-d449beea44b3	{"status": "pending"}	{"status": "finalizado"}	\N	\N	2026-04-16 21:07:24.717003
b4f1b6b2-7bb0-4757-9894-f74f3b864a50	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	STATUS_CHANGE	merchant	94420bd3-250b-417b-8642-d449beea44b3	{"status": "finalizado"}	{"status": "finalizado_"}	\N	\N	2026-04-16 21:12:14.846875
a7339943-27b0-4cc0-a46e-94168d55f3b7	a9118708-4ec9-4064-8dd7-21949eb1a94a	812898d6-a2b9-4b68-aaf4-bee8672898af	STATUS_CHANGE	merchant	812898d6-a2b9-4b68-aaf4-bee8672898af	{"status": "documentation_required"}	{"status": "finalizado_"}	\N	\N	2026-04-16 21:12:52.15879
425f9d2e-0742-4014-a2a6-337edceca752	a9118708-4ec9-4064-8dd7-21949eb1a94a	455bbd7e-4c45-4874-b880-cebd9ff790f3	STATUS_CHANGE	merchant	455bbd7e-4c45-4874-b880-cebd9ff790f3	{"status": "in_review"}	{"status": "finalizado_"}	\N	\N	2026-04-16 21:19:18.488252
7ee3ea39-99a9-4d5f-8e45-9de7c9e212ad	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	STATUS_CHANGE	merchant	94420bd3-250b-417b-8642-d449beea44b3	{"status": "finalizado_"}	{"status": "documentation_required"}	\N	\N	2026-04-16 21:22:02.61568
0d547119-e389-4685-9944-859c50323ac8	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	STATUS_CHANGE	merchant	94420bd3-250b-417b-8642-d449beea44b3	{"status": "documentation_required"}	{"status": "finalizado_"}	\N	\N	2026-04-16 21:22:07.239847
\.


--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.calendar_events (id, merchant_id, created_by, title, description, start_time, end_time, all_day, location, attendees, reminder_minutes, color, created_at, updated_at) FROM stdin;
139fea5b-351f-44f7-875e-3df0eef0fb99	\N	88dcc2d9-995b-48e7-984c-3109283a3310	cambio de tarifa	cambio de tarifa 23	2026-04-16 12:17:00	2026-04-18 12:17:00	f		{}	120	#f73b73	2026-04-16 12:17:18.491903	2026-04-16 12:17:18.491903
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.comments (id, merchant_id, user_id, content, is_internal, parent_id, created_at, updated_at) FROM stdin;
79f73a37-261a-4435-9ec2-43dc92c55983	72e3cd35-abe9-4e89-b527-102142128a2e	88dcc2d9-995b-48e7-984c-3109283a3310	Cliente confirmó volumen mensual estimado.	t	\N	2026-04-16 12:04:57.173979	2026-04-16 12:04:57.173979
5e90d24b-0aec-4b13-836e-0414608ffdc4	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	a9118708-4ec9-4064-8dd7-21949eb1a94a	Llamada de seguimiento programada para la próxima semana.	t	\N	2026-04-16 12:04:57.179664	2026-04-16 12:04:57.179664
52a601ff-b3e0-4c20-b8ac-00f586673a22	455bbd7e-4c45-4874-b880-cebd9ff790f3	88dcc2d9-995b-48e7-984c-3109283a3310	Integración técnica completada exitosamente.	t	\N	2026-04-16 12:04:57.182229	2026-04-16 12:04:57.182229
5bc8ba5b-254f-4c74-987f-3e932ab311bc	812898d6-a2b9-4b68-aaf4-bee8672898af	6a1d6d19-de3b-4146-8b6a-91141811199f	Se solicitaron documentos adicionales al contacto principal.	t	\N	2026-04-16 12:04:57.184451	2026-04-16 12:04:57.184451
16b7b2b9-9194-4653-8561-119132912c2c	2ade9a43-9f74-4523-aee3-db5959d3c000	a9118708-4ec9-4064-8dd7-21949eb1a94a	Se solicitaron documentos adicionales al contacto principal.	t	\N	2026-04-16 12:04:57.186506	2026-04-16 12:04:57.186506
993b0095-50ab-4b67-8b20-2eb56aae34e5	e141778d-eb0a-4e08-9966-8b7db5c10aa1	a9118708-4ec9-4064-8dd7-21949eb1a94a	Se solicitaron documentos adicionales al contacto principal.	t	\N	2026-04-16 12:04:57.188351	2026-04-16 12:04:57.188351
217c3197-a746-4c85-a3f9-5599916b4156	088e7281-23e7-4149-89f0-d7598a70f037	a9118708-4ec9-4064-8dd7-21949eb1a94a	Documentación recibida y en revisión por el equipo de compliance.	t	\N	2026-04-16 12:04:57.190729	2026-04-16 12:04:57.190729
43a1cac3-c2c1-477e-a95a-d88afaa18844	05cbec13-5365-4898-8b96-3dfdcffb9766	6a1d6d19-de3b-4146-8b6a-91141811199f	Se solicitaron documentos adicionales al contacto principal.	t	\N	2026-04-16 12:04:57.193086	2026-04-16 12:04:57.193086
7cf9b776-bc5d-4912-9a43-32af51a7d5bc	fb61c0d9-4b88-4b85-be8c-e8e39c7e0f3a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Cliente confirmó volumen mensual estimado.	t	\N	2026-04-16 12:04:57.195294	2026-04-16 12:04:57.195294
44996ca0-3847-4051-84ec-69cff9f9452a	fbed7f26-216f-4c37-87a4-8ce4698c6e32	a9118708-4ec9-4064-8dd7-21949eb1a94a	Revisión de contrato en proceso con el área legal.	t	\N	2026-04-16 12:04:57.197293	2026-04-16 12:04:57.197293
4650b42a-43f0-4129-92e4-8219eb0f01b4	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	88dcc2d9-995b-48e7-984c-3109283a3310	Pruebas fallidas en sandbox	t	\N	2026-04-16 12:08:10.37583	2026-04-16 12:08:10.37583
0a14a44c-68d3-4ce4-bf79-2466df6f9e38	94420bd3-250b-417b-8642-d449beea44b3	6a1d6d19-de3b-4146-8b6a-91141811199f	Comercio se entrega llaves	t	\N	2026-04-16 15:34:56.245737	2026-04-16 15:34:56.245737
c3d3b3cc-b1c0-4506-90dc-186d8558a8c5	94420bd3-250b-417b-8642-d449beea44b3	a9118708-4ec9-4064-8dd7-21949eb1a94a	se finalizo	t	\N	2026-04-16 21:02:53.813	2026-04-16 21:02:53.813
756db498-ea98-4643-bc07-63d1fe93d660	455bbd7e-4c45-4874-b880-cebd9ff790f3	a9118708-4ec9-4064-8dd7-21949eb1a94a	lk	t	\N	2026-04-16 21:19:25.293978	2026-04-16 21:19:25.293978
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, merchant_id, uploaded_by, name, original_name, file_path, file_size, mime_type, document_type, description, is_verified, verified_by, verified_at, created_at) FROM stdin;
f40e9123-16dc-4f6d-86fc-b5db6ddd3107	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	88dcc2d9-995b-48e7-984c-3109283a3310	certificado Produccion Viva Fortuna.pdf	certificado Produccion Viva Fortuna.pdf	8bc06bc3-815b-438a-ac42-d233c46a2522.pdf	1014778	application/pdf	other	\N	f	\N	\N	2026-04-16 12:08:46.213123
d833224d-d30d-413c-b95f-96aa5db34b40	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	88dcc2d9-995b-48e7-984c-3109283a3310	Captura de pantalla 2026-02-27 154258.png	Captura de pantalla 2026-02-27 154258.png	dac277ad-c756-4772-ad26-4ec1fb5eaefb.png	197781	image/png	other	\N	f	\N	\N	2026-04-16 12:09:23.729987
68e4f53a-5e7d-4ad6-9e52-867265ed6334	e141778d-eb0a-4e08-9966-8b7db5c10aa1	88dcc2d9-995b-48e7-984c-3109283a3310	Captura de pantalla 2025-01-08 082438.png	Captura de pantalla 2025-01-08 082438.png	518197f3-c6e2-4d6f-993b-1960bad4a05f.png	26320	image/png	other	\N	f	\N	\N	2026-04-16 12:10:11.881153
b017a908-f1ce-40c6-9bd5-96f20cb245ec	e141778d-eb0a-4e08-9966-8b7db5c10aa1	88dcc2d9-995b-48e7-984c-3109283a3310	certificado Produccion Viva Fortuna.pdf	certificado Produccion Viva Fortuna.pdf	ef446843-9f2c-4017-8d4b-a1051c455cfa.pdf	1014778	application/pdf	other	\N	f	\N	\N	2026-04-16 12:10:20.201162
34988712-40e2-4074-9c7f-67fa863b2e20	94420bd3-250b-417b-8642-d449beea44b3	6a1d6d19-de3b-4146-8b6a-91141811199f	logo-final-640w.png	logo-final-640w.png	fedca098-b490-4b8a-88ba-38988f7cbb5b.png	9208	image/png	other	\N	f	\N	\N	2026-04-16 15:35:28.088397
760bdadc-7976-4a3e-b8be-23c0af1dbbb8	94420bd3-250b-417b-8642-d449beea44b3	6a1d6d19-de3b-4146-8b6a-91141811199f	04.13.2026_-_Fee_Proposal_-_Jugabet_CL_(1)_(1).pdf	04.13.2026_-_Fee_Proposal_-_Jugabet_CL_(1)_(1).pdf	ff379765-b329-4667-a1d3-069e2a7cb6dc.pdf	484334	application/pdf	other	\N	f	\N	\N	2026-04-16 15:35:39.486278
0d2566bf-3cba-4387-a6c4-8b09902655a9	94420bd3-250b-417b-8642-d449beea44b3	a9118708-4ec9-4064-8dd7-21949eb1a94a	04.13.2026_-_Fee_Proposal_-_Jugabet_CL_(1)_(1).pdf	04.13.2026_-_Fee_Proposal_-_Jugabet_CL_(1)_(1).pdf	d3a672fa-558d-4b97-9293-3c336dbe9609.pdf	484334	application/pdf	other	\N	f	\N	\N	2026-04-16 21:12:24.974162
deccdc78-99d4-43fa-b5e4-dbb4c14cdae5	812898d6-a2b9-4b68-aaf4-bee8672898af	a9118708-4ec9-4064-8dd7-21949eb1a94a	MINI-BROCHURE-GJT2 (1).pdf	MINI-BROCHURE-GJT2 (1).pdf	c433be6d-fe93-425d-b95d-1af9434d1b0d.pdf	1066898	application/pdf	other	\N	f	\N	\N	2026-04-16 21:19:06.524824
\.


--
-- Data for Name: merchant_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.merchant_status_history (id, merchant_id, changed_by, old_status, new_status, reason, created_at) FROM stdin;
9c9cb513-796e-4161-a6a5-06b4deb830a2	72e3cd35-abe9-4e89-b527-102142128a2e	88dcc2d9-995b-48e7-984c-3109283a3310	lead	certified	Actualización inicial de estado	2026-04-16 12:04:57.170629
4c6267a9-d4de-4251-a9b0-f9ea404ab0cc	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	a9118708-4ec9-4064-8dd7-21949eb1a94a	lead	approved	Actualización inicial de estado	2026-04-16 12:04:57.179046
45e47099-6e58-4621-950f-994d3f14f57a	455bbd7e-4c45-4874-b880-cebd9ff790f3	88dcc2d9-995b-48e7-984c-3109283a3310	lead	in_review	Actualización inicial de estado	2026-04-16 12:04:57.181749
7cb0c19f-5f6a-4476-905b-94017608cb47	812898d6-a2b9-4b68-aaf4-bee8672898af	6a1d6d19-de3b-4146-8b6a-91141811199f	lead	documentation_required	Actualización inicial de estado	2026-04-16 12:04:57.183986
09f47c9b-4c16-407e-aa95-714c85a73381	2ade9a43-9f74-4523-aee3-db5959d3c000	a9118708-4ec9-4064-8dd7-21949eb1a94a	lead	pending	Actualización inicial de estado	2026-04-16 12:04:57.186121
5e373f55-fbae-45ac-9c60-4c89d19ab6c9	088e7281-23e7-4149-89f0-d7598a70f037	a9118708-4ec9-4064-8dd7-21949eb1a94a	lead	suspended	Actualización inicial de estado	2026-04-16 12:04:57.190225
cb03c949-b7d8-4b9d-a58b-efb07439e693	05cbec13-5365-4898-8b96-3dfdcffb9766	6a1d6d19-de3b-4146-8b6a-91141811199f	lead	approved	Actualización inicial de estado	2026-04-16 12:04:57.192596
5c6b3a46-11c1-46e0-aea8-8c086d8f484a	fb61c0d9-4b88-4b85-be8c-e8e39c7e0f3a	a9118708-4ec9-4064-8dd7-21949eb1a94a	lead	rejected	Actualización inicial de estado	2026-04-16 12:04:57.194875
8aa3928c-fe75-440f-b28a-712f940cd342	fbed7f26-216f-4c37-87a4-8ce4698c6e32	a9118708-4ec9-4064-8dd7-21949eb1a94a	lead	in_review	Actualización inicial de estado	2026-04-16 12:04:57.1969
7ab34729-0898-4ec7-b3fb-21fbd37e8f00	94420bd3-250b-417b-8642-d449beea44b3	a9118708-4ec9-4064-8dd7-21949eb1a94a	pending	finalizado	Proceso completado	2026-04-16 21:07:24.714737
accf1afb-64b5-4c78-ac31-8af7e0a34a1e	94420bd3-250b-417b-8642-d449beea44b3	6a1d6d19-de3b-4146-8b6a-91141811199f	finalizado	documentation_required	\N	2026-04-16 21:22:02.613548
fa8fd2cd-0916-40ce-b4a1-0994553f7a4d	94420bd3-250b-417b-8642-d449beea44b3	a9118708-4ec9-4064-8dd7-21949eb1a94a	finalizado	finalizado	\N	2026-04-16 21:12:14.844612
5b653dc0-0814-4892-b842-0a36f1c25e96	812898d6-a2b9-4b68-aaf4-bee8672898af	a9118708-4ec9-4064-8dd7-21949eb1a94a	documentation_required	finalizado	\N	2026-04-16 21:12:52.157875
b1785121-3052-40a1-9e98-969bcf609244	455bbd7e-4c45-4874-b880-cebd9ff790f3	a9118708-4ec9-4064-8dd7-21949eb1a94a	in_review	finalizado	\N	2026-04-16 21:19:18.486632
92438d1f-e6af-4be3-8d0d-77449b4261ee	94420bd3-250b-417b-8642-d449beea44b3	6a1d6d19-de3b-4146-8b6a-91141811199f	documentation_required	finalizado	\N	2026-04-16 21:22:07.238265
\.


--
-- Data for Name: merchants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.merchants (id, legal_name, trade_name, tax_id, country, state, city, address, postal_code, website, mcc_code, mcc_description, business_type, industry, contact_name, contact_email, contact_phone, contact_position, secondary_contact_name, secondary_contact_email, secondary_contact_phone, bank_name, bank_account_number, bank_account_type, bank_routing_number, bank_swift, bank_iban, bank_country, accepts_credit_card, accepts_debit_card, accepts_ach, accepts_wire, accepts_crypto, payment_methods_detail, monthly_volume, average_ticket, max_transaction, min_transaction, currency, integration_type, api_endpoint, webhook_url, ip_whitelist, technical_contact_email, technical_contact_phone, status, risk_level, score, priority, assigned_to, onboarding_started_at, onboarding_completed_at, last_activity_at, notes, tags, created_by, created_at, updated_at) FROM stdin;
c6cb9b8c-6da6-41f0-bbff-b1f148938c19	pruebas	pruebas	34334344	Chile	\N	\N	Av. Manuel Olguin Nro. 335 Int. 1401	\N	https://www.juegaenlinea.pe/	6011	Financial Institutions	Retail	gambling	pepe	rogerfrankp@gmail.com	99999995	vendedor	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	f	f	f	f	[{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "", "amount_between_fee": ""}, "pay_in": [{"fee": "3", "min_fee": "3", "currency": "USD", "provider": "radar", "method_id": "card_mc", "commission": "2", "method_name": "Mastercard"}], "pay_out": [{"fee": "3", "min_fee": "2", "currency": "PEN", "provider": "radar", "method_id": "wallet_yape", "commission": "2", "method_name": "Yape"}], "country_code": "PE", "country_name": "Perú"}]	\N	\N	\N	\N	USD	\N	\N	\N	{}	\N	\N	approved	silver	50	5	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	\N	2026-04-16 20:56:18.182571	{"_meta":true,"request_type":"","merchant_email":"rogerfrankp@gmail.com","merchant_user":"pruebas","report_email":"rogerfrankp@gmail.com","has_iva":"yes","accepts_third_party":"yes","communication_channel":"Teams","category":"55","origin_country":"PE","risk_label":"silver"}\ndeeeeee	{}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 20:50:47.435192	2026-04-16 20:56:18.192677
fbed7f26-216f-4c37-87a4-8ce4698c6e32	Distribuidora Norte S.A.C.	DistriNorte	20834567890	Perú	Lambayeque	Chiclayo	Av. Balta 1234, Chiclayo	14001	https://distrinorte.pe	5045	Computers, Peripherals, and Software	Distribuidora	Tecnología	Luis Sánchez	lsanchez@distrinorte.pe	+51 74 234-5678	Jefe de Ventas	Ana Flores	aflores@distrinorte.pe	+51 74 234-5679	Scotiabank Perú	000-1234567	checking	\N	\N	\N	\N	t	t	t	f	f	[{"pay4u": {"has_tax": true, "currency": "PEN", "amount_over_fee": "2.50", "amount_between_fee": "1.80"}, "pay_in": [{"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_visa", "commission": "3.5", "method_name": "Visa"}, {"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_mc", "commission": "3.5", "method_name": "Mastercard"}, {"fee": "0.10", "min_fee": "0.20", "currency": "PEN", "provider": "BCP", "method_id": "wallet_yape", "commission": "1.5", "method_name": "Yape"}, {"fee": "0.50", "min_fee": "1.00", "currency": "PEN", "provider": "PagoEfectivo SAC", "method_id": "cash_pe", "commission": "2.0", "method_name": "PagoEfectivo"}], "pay_out": [{"fee": "1.50", "min_fee": "1.50", "currency": "PEN", "provider": "BCP", "method_id": "bank_transfer", "commission": "0.5", "method_name": "Transferencia Bancaria"}, {"fee": "0.20", "min_fee": "0.20", "currency": "PEN", "provider": "Interbank", "method_id": "wallet_plin", "commission": "0.8", "method_name": "Plin"}], "country_code": "PE", "country_name": "Perú"}]	420000.00	1200.00	25000.00	100.00	PEN	api	https://distrinorte.pe/api/v1/payments	https://distrinorte.pe/webhooks	{190.235.12.45,190.235.12.46}	tech@distrinorte.pe	+51 74 234-5680	in_review	medium	83	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 15:36:20.936713	{"_meta":true,"request_type":"Ampliación de Servicios","merchant_email":"ventas@distrinorte.pe","merchant_user":"distrinorte_pe","report_email":"reportes@distrinorte.pe","has_iva":"yes","accepts_third_party":"yes","communication_channel":"Slack","category":"Distribución Tecnología","origin_country":"PE","risk_label":"silver"}\nSegunda empresa del grupo. Revisión en curso.	{distribucion,tech,norte}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.196243	2026-04-16 15:31:22.939441
72e3cd35-abe9-4e89-b527-102142128a2e	Supermercados La Canasta S.A.C.	La Canasta	20501234567	Perú	Lima	Lima	Av. Javier Prado Este 4200, San Borja	15036	https://lacanasta.com.pe	5411	Grocery Stores, Supermarkets	Retail	Alimentación	Carlos Mendoza Ríos	cmendoza@lacanasta.com.pe	+51 1 234-5678	Gerente Financiero	\N	\N	\N	BCP	194-12345678-0-12	checking	\N	BCPLPEPL	\N	\N	t	t	f	t	f	[{"pay4u": {"has_tax": true, "currency": "PEN", "amount_over_fee": "2.50", "amount_between_fee": "1.80"}, "pay_in": [{"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_visa", "commission": "3.5", "method_name": "Visa"}, {"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_mc", "commission": "3.5", "method_name": "Mastercard"}, {"fee": "0.10", "min_fee": "0.20", "currency": "PEN", "provider": "BCP", "method_id": "wallet_yape", "commission": "1.5", "method_name": "Yape"}, {"fee": "0.50", "min_fee": "1.00", "currency": "PEN", "provider": "PagoEfectivo SAC", "method_id": "cash_pe", "commission": "2.0", "method_name": "PagoEfectivo"}], "pay_out": [{"fee": "1.50", "min_fee": "1.50", "currency": "PEN", "provider": "BCP", "method_id": "bank_transfer", "commission": "0.5", "method_name": "Transferencia Bancaria"}, {"fee": "0.20", "min_fee": "0.20", "currency": "PEN", "provider": "Interbank", "method_id": "wallet_plin", "commission": "0.8", "method_name": "Plin"}], "country_code": "PE", "country_name": "Perú"}]	850000.00	120.00	5000.00	5.00	PEN	api	https://api.lacanasta.com.pe/payments	https://api.lacanasta.com.pe/webhooks/prontopaga	{}	\N	\N	certified	low	60	5	88dcc2d9-995b-48e7-984c-3109283a3310	\N	\N	2026-04-12 10:49:30.851915	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"pagos@lacanasta.com.pe","merchant_user":"lacanasta_pe","report_email":"reportes@lacanasta.com.pe","has_iva":"yes","accepts_third_party":"no","communication_channel":"Email","category":"Supermercado","origin_country":"PE","risk_label":"gold"}\nCliente premium. Integración completada sin incidencias.	{vip,retail,certificado}	88dcc2d9-995b-48e7-984c-3109283a3310	2026-04-16 12:04:57.149466	2026-04-16 15:31:22.919694
455bbd7e-4c45-4874-b880-cebd9ff790f3	Restaurantes El Sabor Ecuatoriano Cía. Ltda.	El Sabor	1791234567001	Ecuador	Guayas	Guayaquil	Av. Francisco de Orellana, Edificio World Trade Center	090150	https://elsabor.ec	5812	Eating Places, Restaurants	Restaurante	Gastronomía	Roberto Alvarado	ralvarado@elsabor.ec	+593 4 234-5678	Director Operativo	\N	\N	\N	Banco Pichincha	2200123456	savings	\N	\N	\N	\N	t	t	f	f	f	[{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "1.50", "amount_between_fee": "1.00"}, "pay_in": [{"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_visa", "commission": "3.2", "method_name": "Visa"}, {"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_mc", "commission": "3.2", "method_name": "Mastercard"}, {"fee": "0.50", "min_fee": "1.00", "currency": "USD", "provider": "Pago Ágil", "method_id": "cash_ec", "commission": "2.5", "method_name": "Efectivo Ecuador"}], "pay_out": [{"fee": "0.75", "min_fee": "0.75", "currency": "USD", "provider": "Banco Pichincha", "method_id": "bank_transfer", "commission": "0.4", "method_name": "Transferencia Bancaria"}], "country_code": "EC", "country_name": "Ecuador"}]	95000.00	35.00	500.00	5.00	USD	hosted	\N	\N	{}	\N	\N	finalizado	medium	67	5	88dcc2d9-995b-48e7-984c-3109283a3310	\N	\N	2026-04-16 21:19:25.29857	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"admin@elsabor.ec","merchant_user":"elsabor_ec","report_email":"contabilidad@elsabor.ec","has_iva":"yes","accepts_third_party":"no","communication_channel":"WhatsApp","category":"Restaurante Casual","origin_country":"EC","risk_label":"silver"}\nEn proceso de revisión de documentación bancaria.	{gastronomia,ecuador}	88dcc2d9-995b-48e7-984c-3109283a3310	2026-04-16 12:04:57.180949	2026-04-16 21:19:18.498039
c0d0ba89-496c-4916-81f6-5030e3f0cfd6	TechSolutions Chile SpA	TechSol	76.543.210-K	Chile	Región Metropolitana	Santiago	Av. Apoquindo 4501, Las Condes	7550000	https://techsol.cl	7372	Computer Programming, Data Processing	SaaS	Tecnología	Valentina Torres	vtorres@techsol.cl	+56 2 2345-6789	CEO	\N	\N	\N	Banco de Chile	00-123-45678-09	checking	\N	BCHICLRM	\N	\N	t	t	t	t	f	[{"pay4u": {"has_tax": true, "currency": "CLP", "amount_over_fee": "1500", "amount_between_fee": "1000"}, "pay_in": [{"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_visa", "commission": "2.95", "method_name": "Visa"}, {"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_mc", "commission": "2.95", "method_name": "Mastercard"}, {"fee": "500", "min_fee": "500", "currency": "CLP", "provider": "Klap Chile", "method_id": "cash_cl", "commission": "1.8", "method_name": "Klap"}], "pay_out": [{"fee": "1000", "min_fee": "1000", "currency": "CLP", "provider": "Banco de Chile", "method_id": "bank_transfer", "commission": "0.3", "method_name": "Transferencia Bancaria"}, {"fee": "200", "min_fee": "200", "currency": "CLP", "provider": "BCI", "method_id": "wallet_mach", "commission": "0.5", "method_name": "MACH"}], "country_code": "CL", "country_name": "Chile"}]	45000000.00	150000.00	2000000.00	10000.00	CLP	sdk	https://payments.techsol.cl/v2	https://payments.techsol.cl/hooks	{}	\N	\N	approved	low	86	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 15:41:12.753237	{"_meta":true,"request_type":"Ampliación de Servicios","merchant_email":"billing@techsol.cl","merchant_user":"techsol_cl","report_email":"finance@techsol.cl","has_iva":"yes","accepts_third_party":"yes","communication_channel":"Slack","category":"Software B2B","origin_country":"CL","risk_label":"diamond"}\nEmpresa de software con alto volumen. Aprobada, pendiente certificación.	{tech,saas,chile}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.178154	2026-04-16 15:31:22.922802
e141778d-eb0a-4e08-9966-8b7db5c10aa1	Tienda Online Moda EC S.A.S.	ModaEC	1792345678001	Ecuador	Pichincha	Quito	Av. Naciones Unidas E7-26, Quito	170515	https://modaec.com	5651	Family Clothing Stores	E-commerce	Moda	Gabriela Moreno	gmoreno@modaec.com	+593 2 345-6789	Fundadora	\N	\N	\N	Produbanco	12001234567	savings	\N	\N	\N	\N	t	t	f	f	t	[{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "1.50", "amount_between_fee": "1.00"}, "pay_in": [{"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_visa", "commission": "3.2", "method_name": "Visa"}, {"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_mc", "commission": "3.2", "method_name": "Mastercard"}, {"fee": "0.50", "min_fee": "1.00", "currency": "USD", "provider": "Pago Ágil", "method_id": "cash_ec", "commission": "2.5", "method_name": "Efectivo Ecuador"}], "pay_out": [{"fee": "0.75", "min_fee": "0.75", "currency": "USD", "provider": "Banco Pichincha", "method_id": "bank_transfer", "commission": "0.4", "method_name": "Transferencia Bancaria"}], "country_code": "EC", "country_name": "Ecuador"}]	28000.00	65.00	800.00	15.00	USD	api	https://modaec.com/api/checkout	https://modaec.com/webhooks	{}	\N	\N	lead	low	86	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 15:36:17.445907	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"hola@modaec.com","merchant_user":"modaec","report_email":"reportes@modaec.com","has_iva":"no","accepts_third_party":"yes","communication_channel":"WhatsApp","category":"Moda Online","origin_country":"EC","risk_label":"gold"}\nStartup en crecimiento. Primer contacto realizado por LinkedIn.	{ecommerce,moda,startup}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.187557	2026-04-16 15:31:22.9325
fb61c0d9-4b88-4b85-be8c-e8e39c7e0f3a	Clínica Dental Sonrisa Perfecta S.R.L.	Sonrisa Perfecta	1790987654001	Ecuador	Azuay	Cuenca	Av. Remigio Crespo 5-89, Cuenca	010101	https://sonrisaperfecta.ec	8049	Offices and Clinics of Other Health Practitioners	Clínica	Salud	Dr. Pablo Vega	pvega@sonrisaperfecta.ec	+593 7 234-5678	Director Médico	\N	\N	\N	Banco del Austro	3001234567	savings	\N	\N	\N	\N	t	t	f	f	f	[{"pay4u": {"has_tax": false, "currency": "USD", "amount_over_fee": "1.50", "amount_between_fee": "1.00"}, "pay_in": [{"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_visa", "commission": "3.2", "method_name": "Visa"}, {"fee": "0.25", "min_fee": "0.50", "currency": "USD", "provider": "Datafast", "method_id": "card_mc", "commission": "3.2", "method_name": "Mastercard"}], "pay_out": [{"fee": "0.75", "min_fee": "0.75", "currency": "USD", "provider": "Banco Pichincha", "method_id": "bank_transfer", "commission": "0.4", "method_name": "Transferencia Bancaria"}], "country_code": "EC", "country_name": "Ecuador"}]	18000.00	250.00	3000.00	20.00	USD	plugin	\N	\N	{}	\N	\N	rejected	medium	55	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 21:51:42.008314	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"info@sonrisaperfecta.ec","merchant_user":"sonrisaperfecta","report_email":"admin@sonrisaperfecta.ec","has_iva":"no","accepts_third_party":"no","communication_channel":"Teléfono","category":"Clínica Dental","origin_country":"EC","risk_label":"silver"}\nRechazado por no cumplir requisitos mínimos de volumen mensual. Puede repostular en 90 días.	{salud,clinica,ecuador}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.194108	2026-04-16 15:31:22.937715
2ade9a43-9f74-4523-aee3-db5959d3c000	Importadora Andina Chile S.A.	Andina Import	77.891.234-5	Chile	Valparaíso	Valparaíso	Puerto de Valparaíso, Bodega 12	2340000	https://andinaimport.cl	5065	Electrical Parts and Equipment	Importadora	Comercio Exterior	Andrés Fuentes	afuentes@andinaimport.cl	+56 32 234-5678	Gerente Comercial	\N	\N	\N	Santander Chile	0-000-1234567-0	checking	\N	BSCHCLRM	CL12345678901234567890	\N	f	f	t	t	f	[{"pay4u": {"has_tax": true, "currency": "CLP", "amount_over_fee": "1500", "amount_between_fee": "1000"}, "pay_in": [{"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_visa", "commission": "2.95", "method_name": "Visa"}, {"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_mc", "commission": "2.95", "method_name": "Mastercard"}], "pay_out": [{"fee": "1000", "min_fee": "1000", "currency": "CLP", "provider": "Banco de Chile", "method_id": "bank_transfer", "commission": "0.3", "method_name": "Transferencia Bancaria"}], "country_code": "CL", "country_name": "Chile"}]	1200000.00	8500.00	150000.00	500.00	USD	api	https://erp.andinaimport.cl/api/payments	\N	{}	\N	\N	pending	high	50	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 15:36:11.618129	{"_meta":true,"request_type":"Migración","merchant_email":"pagos@andinaimport.cl","merchant_user":"andina_cl","report_email":"finanzas@andinaimport.cl","has_iva":"yes","accepts_third_party":"yes","communication_channel":"Email","category":"Importadora B2B","origin_country":"CL","risk_label":"bronze"}\nEmpresa con operaciones internacionales. Requiere revisión de compliance.	{importadora,b2b,alto-volumen}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.185387	2026-04-16 15:31:22.930427
088e7281-23e7-4149-89f0-d7598a70f037	Constructora Pacífico S.A.C.	Pacífico Construye	20723456789	Perú	La Libertad	Trujillo	Av. España 1234, Trujillo	13001	https://pacificoconstruye.pe	5999	Miscellaneous and Specialty Retail Stores	Construcción	Inmobiliaria	Jorge Castillo	jcastillo@pacificoconstruye.pe	+51 44 234-5678	Gerente General	\N	\N	\N	BBVA Perú	0011-0123-01-00123456	checking	\N	BCONPEPL	\N	\N	f	f	t	t	f	[{"pay4u": {"has_tax": true, "currency": "PEN", "amount_over_fee": "2.50", "amount_between_fee": "1.80"}, "pay_in": [{"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_visa", "commission": "3.5", "method_name": "Visa"}, {"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_mc", "commission": "3.5", "method_name": "Mastercard"}], "pay_out": [{"fee": "1.50", "min_fee": "1.50", "currency": "PEN", "provider": "BCP", "method_id": "bank_transfer", "commission": "0.5", "method_name": "Transferencia Bancaria"}], "country_code": "PE", "country_name": "Perú"}]	2500000.00	45000.00	500000.00	1000.00	PEN	manual	\N	\N	{}	\N	\N	suspended	high	69	5	a9118708-4ec9-4064-8dd7-21949eb1a94a	\N	\N	2026-04-16 15:41:11.459613	{"_meta":true,"request_type":"Renovación","merchant_email":"pagos@pacificoconstruye.pe","merchant_user":"pacifico_pe","report_email":"contabilidad@pacificoconstruye.pe","has_iva":"yes","accepts_third_party":"no","communication_channel":"Email","category":"Construcción e Inmobiliaria","origin_country":"PE","risk_label":"bronze"}\nSuspendido por inconsistencias en documentación fiscal. En revisión legal.	{construccion,b2b,suspendido}	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 12:04:57.189468	2026-04-16 15:31:22.934433
94420bd3-250b-417b-8642-d449beea44b3	INGUS BRIDGE PERU S.A.C.	Juega en Línea	20611494298	Perú	Lima Metropolitana	Lima	Alfredodo Benavides 266 Dprto 501	00001	https://www.juegaenlinea.pe/	8049	Offices and Clinics of Other Health Practitioners	apuesta		jose	roger.pecho@prontopaga.com	99999999	 desarrollador						checking					t	f	f	t	f	[{"pay4u": {"has_tax": true, "currency": "PEN", "amount_over_fee": "2.50", "amount_between_fee": "1.80"}, "pay_in": [{"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_visa", "commission": "3.5", "method_name": "Visa"}, {"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_mc", "commission": "3.5", "method_name": "Mastercard"}, {"fee": "0.10", "min_fee": "0.20", "currency": "PEN", "provider": "BCP", "method_id": "wallet_yape", "commission": "1.5", "method_name": "Yape"}, {"fee": "0.50", "min_fee": "1.00", "currency": "PEN", "provider": "PagoEfectivo SAC", "method_id": "cash_pe", "commission": "2.0", "method_name": "PagoEfectivo"}], "pay_out": [{"fee": "1.50", "min_fee": "1.50", "currency": "PEN", "provider": "BCP", "method_id": "bank_transfer", "commission": "0.5", "method_name": "Transferencia Bancaria"}, {"fee": "0.20", "min_fee": "0.20", "currency": "PEN", "provider": "Interbank", "method_id": "wallet_plin", "commission": "0.8", "method_name": "Plin"}], "country_code": "PE", "country_name": "Perú"}]	23232.00	323232.00	232.00	23232.00	EUR	api	2323	http://localhost:3000/merchants/new	{Pendiente}	rogerfrankp@gmail.com	232323232	finalizado	high	81	5	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	2026-04-16 21:07:24.712517	2026-04-16 21:22:07.236614	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"pagos@juegaenlinea.pe","merchant_user":"juegaenlinea_pe","report_email":"finanzas@juegaenlinea.pe","has_iva":"yes","accepts_third_party":"yes","communication_channel":"WhatsApp","category":"Gaming / Entretenimiento","origin_country":"PE","risk_label":"bronze"}	{diamante}	88dcc2d9-995b-48e7-984c-3109283a3310	2026-04-16 12:15:24.678251	2026-04-16 21:22:07.246949
05cbec13-5365-4898-8b96-3dfdcffb9766	Hotel Boutique Viña del Mar S.A.	Hotel Pacífico Viña	78.234.567-8	Chile	Valparaíso	Viña del Mar	Av. San Martín 667, Viña del Mar	2520000	https://hotelpacificovina.cl	7011	Hotels, Motels, Resorts	Hotelería	Turismo	Sofía Reyes	sreyes@hotelpacificovina.cl	+56 32 345-6789	Directora General	\N	\N	\N	BCI	12345678	checking	\N	CREDCLRM	\N	\N	t	t	f	t	f	[{"pay4u": {"has_tax": true, "currency": "CLP", "amount_over_fee": "1500", "amount_between_fee": "1000"}, "pay_in": [{"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_visa", "commission": "2.95", "method_name": "Visa"}, {"fee": "0.00", "min_fee": "0.00", "currency": "CLP", "provider": "Transbank", "method_id": "card_mc", "commission": "2.95", "method_name": "Mastercard"}, {"fee": "500", "min_fee": "500", "currency": "CLP", "provider": "Klap Chile", "method_id": "cash_cl", "commission": "1.8", "method_name": "Klap"}], "pay_out": [{"fee": "1000", "min_fee": "1000", "currency": "CLP", "provider": "Banco de Chile", "method_id": "bank_transfer", "commission": "0.3", "method_name": "Transferencia Bancaria"}, {"fee": "200", "min_fee": "200", "currency": "CLP", "provider": "BCI", "method_id": "wallet_mach", "commission": "0.5", "method_name": "MACH"}], "country_code": "CL", "country_name": "Chile"}]	85000000.00	180000.00	3000000.00	50000.00	CLP	hosted	\N	https://hotelpacificovina.cl/prontopaga/hook	{}	\N	\N	approved	low	56	5	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	\N	2026-04-16 21:51:38.17479	{"_meta":true,"request_type":"Ampliación de Servicios","merchant_email":"reservas@hotelpacificovina.cl","merchant_user":"hotelpacificovina","report_email":"administracion@hotelpacificovina.cl","has_iva":"yes","accepts_third_party":"yes","communication_channel":"Teams","category":"Hotel Boutique","origin_country":"CL","risk_label":"gold"}\nHotel 4 estrellas. Integración con PMS Cloudbeds en progreso.	{turismo,hotel,chile}	6a1d6d19-de3b-4146-8b6a-91141811199f	2026-04-16 12:04:57.191689	2026-04-16 15:31:22.93603
812898d6-a2b9-4b68-aaf4-bee8672898af	Farmacia Salud Total S.A.	Salud Total	20612345678	Perú	Arequipa	Arequipa	Calle Mercaderes 234, Centro Histórico	04001	https://saludtotal.pe	5912	Drug Stores and Pharmacies	Farmacia	Salud	María Elena Quispe	mquispe@saludtotal.pe	+51 54 234-567	Administradora	\N	\N	\N	Interbank	200-3012345678	checking	\N	\N	\N	\N	t	t	f	f	f	[{"pay4u": {"has_tax": true, "currency": "PEN", "amount_over_fee": "2.50", "amount_between_fee": "1.80"}, "pay_in": [{"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_visa", "commission": "3.5", "method_name": "Visa"}, {"fee": "0.30", "min_fee": "0.50", "currency": "PEN", "provider": "Niubiz", "method_id": "card_mc", "commission": "3.5", "method_name": "Mastercard"}, {"fee": "0.10", "min_fee": "0.20", "currency": "PEN", "provider": "BCP", "method_id": "wallet_yape", "commission": "1.5", "method_name": "Yape"}], "pay_out": [{"fee": "1.50", "min_fee": "1.50", "currency": "PEN", "provider": "BCP", "method_id": "bank_transfer", "commission": "0.5", "method_name": "Transferencia Bancaria"}], "country_code": "PE", "country_name": "Perú"}]	320000.00	85.00	2000.00	10.00	PEN	plugin	\N	\N	{}	\N	\N	finalizado	medium	71	5	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	\N	2026-04-16 22:33:36.222867	{"_meta":true,"request_type":"Nuevo Comercio","merchant_email":"ventas@saludtotal.pe","merchant_user":"saludtotal_pe","report_email":"admin@saludtotal.pe","has_iva":"no","accepts_third_party":"no","communication_channel":"Teléfono","category":"Farmacia Retail","origin_country":"PE","risk_label":"silver"}\nFalta enviar copia de licencia sanitaria y RUC actualizado.	{salud,farmacia,arequipa}	6a1d6d19-de3b-4146-8b6a-91141811199f	2026-04-16 12:04:57.183218	2026-04-16 21:19:06.536889
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migrations (id, name, executed_at) FROM stdin;
1	001_create_users	2026-04-16 10:39:04.234406
2	002_create_merchants	2026-04-16 10:39:04.252879
3	003_create_comments	2026-04-16 10:39:04.263136
4	004_create_documents	2026-04-16 10:39:04.271342
5	005_create_tasks	2026-04-16 10:39:04.28473
6	006_create_calendar_events	2026-04-16 10:39:04.295766
7	007_create_webhooks	2026-04-16 10:39:04.308856
8	008_create_notifications	2026-04-16 10:39:04.319489
9	009_create_audit_log	2026-04-16 10:39:04.331502
10	010_create_status_history	2026-04-16 10:39:04.339618
11	011_create_sla_config	2026-04-16 22:50:48.963775
12	012_create_sla_history	2026-04-16 22:50:48.980399
13	013_extend_notification_type	2026-04-16 22:50:48.98282
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, merchant_id, type, title, message, is_read, read_at, metadata, created_at) FROM stdin;
f0b4a5d5-98ef-4935-8bc4-d3c470825291	88dcc2d9-995b-48e7-984c-3109283a3310	455bbd7e-4c45-4874-b880-cebd9ff790f3	inactivity_alert	⚠️ Comercio sin actividad	Restaurantes El Sabor Ecuatoriano Cía. Ltda. lleva 94 horas sin actividad	f	\N	{"merchantName": "Restaurantes El Sabor Ecuatoriano Cía. Ltda.", "hoursInactive": 94}	2026-04-16 16:00:00.742339
9d95f829-8cda-47d7-81f6-f5783da98ba4	88dcc2d9-995b-48e7-984c-3109283a3310	455bbd7e-4c45-4874-b880-cebd9ff790f3	inactivity_alert	⚠️ Comercio sin actividad	Restaurantes El Sabor Ecuatoriano Cía. Ltda. lleva 99 horas sin actividad	f	\N	{"merchantName": "Restaurantes El Sabor Ecuatoriano Cía. Ltda.", "hoursInactive": 99}	2026-04-16 21:00:00.961805
1ac1519b-c2fe-4678-8060-b61100918c87	88dcc2d9-995b-48e7-984c-3109283a3310	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "pending" a "finalizado"	f	\N	{"newStatus": "finalizado", "oldStatus": "pending"}	2026-04-16 21:07:24.719018
a314e387-3258-4be6-9274-0bb392981a01	88dcc2d9-995b-48e7-984c-3109283a3310	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado" a "finalizado_"	f	\N	{"newStatus": "finalizado_", "oldStatus": "finalizado"}	2026-04-16 21:12:14.852475
5da779b7-299b-49c1-a0fb-f06e7da02e4d	88dcc2d9-995b-48e7-984c-3109283a3310	812898d6-a2b9-4b68-aaf4-bee8672898af	status_change	Estado de comercio actualizado	Farmacia Salud Total S.A. cambió de "documentation_required" a "finalizado_"	f	\N	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:12:52.162271
1f76d448-b1ad-4d81-acd9-10856e0e9468	88dcc2d9-995b-48e7-984c-3109283a3310	455bbd7e-4c45-4874-b880-cebd9ff790f3	status_change	Estado de comercio actualizado	Restaurantes El Sabor Ecuatoriano Cía. Ltda. cambió de "in_review" a "finalizado_"	f	\N	{"newStatus": "finalizado_", "oldStatus": "in_review"}	2026-04-16 21:19:18.492041
21edde38-ad30-49b3-aaab-b688982dde02	88dcc2d9-995b-48e7-984c-3109283a3310	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado_" a "documentation_required"	f	\N	{"newStatus": "documentation_required", "oldStatus": "finalizado_"}	2026-04-16 21:22:02.617954
71ac8b54-d360-4432-8de7-333c7f369b80	88dcc2d9-995b-48e7-984c-3109283a3310	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "documentation_required" a "finalizado_"	f	\N	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:22:07.242298
f0b24c00-aeda-421d-85cd-4f828847bfc7	a9118708-4ec9-4064-8dd7-21949eb1a94a	088e7281-23e7-4149-89f0-d7598a70f037	inactivity_alert	⚠️ Comercio sin actividad	Constructora Pacífico S.A.C. lleva 219 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Constructora Pacífico S.A.C.", "hoursInactive": 219}	2026-04-16 13:00:00.687744
8f57526c-50cf-4ac7-a52d-ddd053022eb7	a9118708-4ec9-4064-8dd7-21949eb1a94a	2ade9a43-9f74-4523-aee3-db5959d3c000	inactivity_alert	⚠️ Comercio sin actividad	Importadora Andina Chile S.A. lleva 210 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Importadora Andina Chile S.A.", "hoursInactive": 210}	2026-04-16 13:00:00.689032
91fec78a-95b1-468b-b6b1-2295f2ab834d	a9118708-4ec9-4064-8dd7-21949eb1a94a	088e7281-23e7-4149-89f0-d7598a70f037	inactivity_alert	⚠️ Comercio sin actividad	Constructora Pacífico S.A.C. lleva 220 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Constructora Pacífico S.A.C.", "hoursInactive": 220}	2026-04-16 14:00:00.405169
d93e403e-a40a-4c15-9fef-a961b47a61a5	a9118708-4ec9-4064-8dd7-21949eb1a94a	2ade9a43-9f74-4523-aee3-db5959d3c000	inactivity_alert	⚠️ Comercio sin actividad	Importadora Andina Chile S.A. lleva 211 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Importadora Andina Chile S.A.", "hoursInactive": 211}	2026-04-16 14:00:00.406521
b57ffd6b-d580-4849-9d69-597a32b79015	a9118708-4ec9-4064-8dd7-21949eb1a94a	088e7281-23e7-4149-89f0-d7598a70f037	inactivity_alert	⚠️ Comercio sin actividad	Constructora Pacífico S.A.C. lleva 221 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Constructora Pacífico S.A.C.", "hoursInactive": 221}	2026-04-16 15:00:00.345768
a13a5034-a775-44af-baae-19c7a4631ef4	a9118708-4ec9-4064-8dd7-21949eb1a94a	2ade9a43-9f74-4523-aee3-db5959d3c000	inactivity_alert	⚠️ Comercio sin actividad	Importadora Andina Chile S.A. lleva 212 horas sin actividad	t	2026-04-16 23:07:47.40629	{"merchantName": "Importadora Andina Chile S.A.", "hoursInactive": 212}	2026-04-16 15:00:00.346382
3ce83dc6-e1eb-4e88-b517-80592e4c48cc	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "pending" a "finalizado"	t	2026-04-16 23:07:47.40629	{"newStatus": "finalizado", "oldStatus": "pending"}	2026-04-16 21:07:24.787906
c99641a4-d1eb-49a3-812b-c6c46afd213b	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado" a "finalizado_"	t	2026-04-16 23:07:47.40629	{"newStatus": "finalizado_", "oldStatus": "finalizado"}	2026-04-16 21:12:14.853072
24101456-2184-4260-85f2-5438720ec2ec	a9118708-4ec9-4064-8dd7-21949eb1a94a	812898d6-a2b9-4b68-aaf4-bee8672898af	status_change	Estado de comercio actualizado	Farmacia Salud Total S.A. cambió de "documentation_required" a "finalizado_"	t	2026-04-16 23:07:47.40629	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:12:52.16278
3515b204-2a5f-4384-acff-7ea245cde651	a9118708-4ec9-4064-8dd7-21949eb1a94a	455bbd7e-4c45-4874-b880-cebd9ff790f3	status_change	Estado de comercio actualizado	Restaurantes El Sabor Ecuatoriano Cía. Ltda. cambió de "in_review" a "finalizado_"	t	2026-04-16 23:07:47.40629	{"newStatus": "finalizado_", "oldStatus": "in_review"}	2026-04-16 21:19:18.492412
1b0d4c01-1ade-44ef-b8e2-f19f7be2cf63	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "documentation_required" a "finalizado_"	t	2026-04-16 23:07:47.40629	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:22:07.242369
77495885-eb03-43c7-84c5-16c4d3c56abe	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "documentation_required" a "finalizado_"	t	2026-04-16 21:54:20.621484	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:22:07.242443
bf3b329e-aedc-4c1f-b68b-d7f0d2e6cfe5	6a1d6d19-de3b-4146-8b6a-91141811199f	812898d6-a2b9-4b68-aaf4-bee8672898af	inactivity_alert	⚠️ Comercio sin actividad	Farmacia Salud Total S.A. lleva 565 horas sin actividad	t	2026-04-16 21:54:20.621484	{"merchantName": "Farmacia Salud Total S.A.", "hoursInactive": 565}	2026-04-16 13:00:00.681848
b6e2cf90-5fa5-4166-a8ba-31af49080f9f	6a1d6d19-de3b-4146-8b6a-91141811199f	812898d6-a2b9-4b68-aaf4-bee8672898af	inactivity_alert	⚠️ Comercio sin actividad	Farmacia Salud Total S.A. lleva 566 horas sin actividad	t	2026-04-16 21:54:20.621484	{"merchantName": "Farmacia Salud Total S.A.", "hoursInactive": 566}	2026-04-16 14:00:00.402433
8452fc69-487c-4962-9848-0f00a464c5dc	6a1d6d19-de3b-4146-8b6a-91141811199f	812898d6-a2b9-4b68-aaf4-bee8672898af	inactivity_alert	⚠️ Comercio sin actividad	Farmacia Salud Total S.A. lleva 567 horas sin actividad	t	2026-04-16 21:54:20.621484	{"merchantName": "Farmacia Salud Total S.A.", "hoursInactive": 567}	2026-04-16 15:00:00.342377
48d44237-d0e1-4ad3-8472-a1de24074e48	6a1d6d19-de3b-4146-8b6a-91141811199f	05cbec13-5365-4898-8b96-3dfdcffb9766	inactivity_alert	⚠️ Comercio sin actividad	Hotel Boutique Viña del Mar S.A. lleva 54 horas sin actividad	t	2026-04-16 21:54:20.621484	{"merchantName": "Hotel Boutique Viña del Mar S.A.", "hoursInactive": 54}	2026-04-16 16:00:00.744695
239344bc-3afc-40bf-b523-2fa8840a8e70	6a1d6d19-de3b-4146-8b6a-91141811199f	05cbec13-5365-4898-8b96-3dfdcffb9766	inactivity_alert	⚠️ Comercio sin actividad	Hotel Boutique Viña del Mar S.A. lleva 59 horas sin actividad	t	2026-04-16 21:54:20.621484	{"merchantName": "Hotel Boutique Viña del Mar S.A.", "hoursInactive": 59}	2026-04-16 21:00:00.965297
e11a89a2-355c-4053-a96f-f8426882ccc3	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "pending" a "finalizado"	t	2026-04-16 21:54:20.621484	{"newStatus": "finalizado", "oldStatus": "pending"}	2026-04-16 21:07:24.909429
5707731f-982d-4b2f-8d81-d0dcbca4a1f5	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado" a "finalizado_"	t	2026-04-16 21:54:20.621484	{"newStatus": "finalizado_", "oldStatus": "finalizado"}	2026-04-16 21:12:14.852701
bc90fdfc-bafc-4cf5-9600-61e3a07924ba	6a1d6d19-de3b-4146-8b6a-91141811199f	812898d6-a2b9-4b68-aaf4-bee8672898af	status_change	Estado de comercio actualizado	Farmacia Salud Total S.A. cambió de "documentation_required" a "finalizado_"	t	2026-04-16 21:54:20.621484	{"newStatus": "finalizado_", "oldStatus": "documentation_required"}	2026-04-16 21:12:52.162519
13edec26-925b-4dfa-bd1d-26cd56abdcbb	6a1d6d19-de3b-4146-8b6a-91141811199f	455bbd7e-4c45-4874-b880-cebd9ff790f3	status_change	Estado de comercio actualizado	Restaurantes El Sabor Ecuatoriano Cía. Ltda. cambió de "in_review" a "finalizado_"	t	2026-04-16 21:54:20.621484	{"newStatus": "finalizado_", "oldStatus": "in_review"}	2026-04-16 21:19:18.492192
baf189d0-7596-4801-97ec-72d531d3ce56	6a1d6d19-de3b-4146-8b6a-91141811199f	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado_" a "documentation_required"	t	2026-04-16 21:54:20.621484	{"newStatus": "documentation_required", "oldStatus": "finalizado_"}	2026-04-16 21:22:02.618635
55f741ba-7be7-44ba-b168-8355526f7689	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	task_assigned	Nueva tarea asignada	Se te asignó la tarea: "puebas"	f	\N	{"taskId": "25f71c4c-3b36-4ecd-b369-8bf6325aba59"}	2026-04-16 23:05:31.781285
dd329984-ae5e-4f4f-a33a-d633232555c2	a9118708-4ec9-4064-8dd7-21949eb1a94a	94420bd3-250b-417b-8642-d449beea44b3	status_change	Estado de comercio actualizado	INGUS BRIDGE PERU S.A.C. cambió de "finalizado_" a "documentation_required"	t	2026-04-16 23:07:47.40629	{"newStatus": "documentation_required", "oldStatus": "finalizado_"}	2026-04-16 21:22:02.618265
16ec9038-18b3-4e97-a14e-edf4d0b9cc15	6a1d6d19-de3b-4146-8b6a-91141811199f	\N	task_due	⏰ Tarea vencida	La tarea "puebas" está vencida	f	\N	{"taskId": "25f71c4c-3b36-4ecd-b369-8bf6325aba59", "taskTitle": "puebas"}	2026-04-16 23:30:00.547408
8dde279a-2dfc-4b15-a937-0357644440f5	dabeee42-5d68-4eca-9670-d8b79c9fd9b5	\N	task_due	⏰ Tarea vencida	La tarea "pruebas" está vencida	t	2026-04-16 23:33:04.850074	{"taskId": "d2c4eea7-ec63-4e70-9e17-600f34669784", "taskTitle": "pruebas"}	2026-04-16 23:30:00.5509
\.


--
-- Data for Name: sla_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sla_config (id, entity_type, entity_key, max_hours, alert_threshold_pct, updated_by, updated_at, created_at) FROM stdin;
365a3b3b-aad9-4eac-adce-220edde4047e	merchant_status	lead	\N	\N	\N	2026-04-16 22:55:31.573384	2026-04-16 22:55:31.573384
457e1e91-8f25-4c43-bbc5-f5ae1c46f056	merchant_status	pending	72.00	\N	\N	2026-04-16 22:55:31.594056	2026-04-16 22:55:31.594056
471ec5e6-c21d-4583-b507-575a0ad2ecfb	merchant_status	in_review	48.00	\N	\N	2026-04-16 22:55:31.594734	2026-04-16 22:55:31.594734
10edabf9-3fb9-4a11-85d1-677f2022a8cb	merchant_status	documentation_required	24.00	\N	\N	2026-04-16 22:55:31.595136	2026-04-16 22:55:31.595136
1bf19576-d12c-4baf-8998-5c07344a7fa2	merchant_status	approved	48.00	\N	\N	2026-04-16 22:55:31.595605	2026-04-16 22:55:31.595605
1e50e69c-9029-45b7-9846-f8c6640c44b2	merchant_status	suspended	\N	\N	\N	2026-04-16 22:55:31.596068	2026-04-16 22:55:31.596068
9b9edcfa-a5f4-4558-86a3-5481abc7cd07	risk_level	diamond	24.00	\N	\N	2026-04-16 22:55:31.596575	2026-04-16 22:55:31.596575
dd6fb902-ed29-47fc-8827-74bb1ea68d27	risk_level	gold	48.00	\N	\N	2026-04-16 22:55:31.597138	2026-04-16 22:55:31.597138
871cf63a-4152-461b-98e6-8df3e9dfbb43	risk_level	silver	72.00	\N	\N	2026-04-16 22:55:31.597527	2026-04-16 22:55:31.597527
08073c1a-d459-438f-9895-4ef36200f30a	risk_level	bronze	96.00	\N	\N	2026-04-16 22:55:31.597864	2026-04-16 22:55:31.597864
372ddd85-0268-4ab0-9192-c0f151d88edf	global	default	\N	75	\N	2026-04-16 22:55:31.599981	2026-04-16 22:55:31.599981
e133e40f-cd86-4958-8c26-c3500b99e353	task_priority	high	24.00	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 23:05:10.244481	2026-04-16 22:55:31.598632
edebd225-f00b-4574-8683-6f6620286b2a	task_priority	low	168.00	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 23:05:10.264918	2026-04-16 22:55:31.599546
7b71012e-7d34-448d-8b48-18f507fb3dde	task_priority	medium	72.00	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 23:05:10.266361	2026-04-16 22:55:31.599066
894d78bd-8574-47ae-9ef9-01d710a66386	task_priority	urgent	1.00	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	2026-04-16 23:05:10.267398	2026-04-16 22:55:31.598212
\.


--
-- Data for Name: sla_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sla_history (id, entity_id, entity_type, assigned_to, event_type, effective_sla_hours, hours_elapsed, hours_overdue, occurred_at, created_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, merchant_id, created_by, assigned_to, title, description, status, priority, due_date, completed_at, created_at, updated_at) FROM stdin;
e7c33a0d-f55c-4e9b-a703-a4a4a7415c2f	72e3cd35-abe9-4e89-b527-102142128a2e	88dcc2d9-995b-48e7-984c-3109283a3310	88dcc2d9-995b-48e7-984c-3109283a3310	Completar integración técnica con el equipo de desarrollo	\N	completed	medium	\N	\N	2026-04-16 12:04:57.175951	2026-04-16 12:04:57.175951
75a0d96e-7231-43dd-b1e3-f7750d83f753	455bbd7e-4c45-4874-b880-cebd9ff790f3	88dcc2d9-995b-48e7-984c-3109283a3310	88dcc2d9-995b-48e7-984c-3109283a3310	Verificar documentos de identidad del representante legal	\N	completed	low	\N	2026-04-16 12:16:39.045234	2026-04-16 12:04:57.182673	2026-04-16 12:16:39.045234
fa258af3-1bd0-4baa-8ef4-593ac264d9df	2ade9a43-9f74-4523-aee3-db5959d3c000	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Programar llamada de onboarding con el cliente	\N	completed	urgent	\N	2026-04-16 15:36:11.614489	2026-04-16 12:04:57.186965	2026-04-16 15:36:11.614489
989c4d6c-6ddd-46ba-a4ac-c7cd8966f5c6	e141778d-eb0a-4e08-9966-8b7db5c10aa1	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Revisar historial crediticio del comercio	\N	completed	high	\N	2026-04-16 15:36:17.427048	2026-04-16 12:04:57.188786	2026-04-16 15:36:17.427048
8e54103d-bc65-42d9-b8c6-f7d5eb19959b	fbed7f26-216f-4c37-87a4-8ce4698c6e32	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Verificar documentos de identidad del representante legal	\N	completed	medium	\N	2026-04-16 15:36:20.91398	2026-04-16 12:04:57.197692	2026-04-16 15:36:20.91398
ff916772-ba99-419e-82d9-bb5e3f065fa2	088e7281-23e7-4149-89f0-d7598a70f037	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Programar llamada de onboarding con el cliente	\N	completed	urgent	\N	2026-04-16 15:41:11.438523	2026-04-16 12:04:57.191085	2026-04-16 15:41:11.438523
760cd263-22ac-42f5-9e96-f339839e317d	c0d0ba89-496c-4916-81f6-5030e3f0cfd6	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Revisar historial crediticio del comercio	\N	completed	high	\N	2026-04-16 15:41:12.734748	2026-04-16 12:04:57.180172	2026-04-16 15:41:12.734748
fa1c6c09-7bd4-4d1f-bd65-c0f3cd80be69	05cbec13-5365-4898-8b96-3dfdcffb9766	6a1d6d19-de3b-4146-8b6a-91141811199f	6a1d6d19-de3b-4146-8b6a-91141811199f	Enviar contrato para firma digital	\N	completed	high	\N	2026-04-16 21:51:38.154518	2026-04-16 12:04:57.193558	2026-04-16 21:51:38.154518
ddb1f83f-16d9-43d3-83e2-e3de7a2942cc	fb61c0d9-4b88-4b85-be8c-e8e39c7e0f3a	a9118708-4ec9-4064-8dd7-21949eb1a94a	a9118708-4ec9-4064-8dd7-21949eb1a94a	Completar integración técnica con el equipo de desarrollo	\N	in_progress	low	\N	\N	2026-04-16 12:04:57.195672	2026-04-16 21:51:42.006788
acbf9775-e7d0-495a-8f73-78e929bd8e5f	812898d6-a2b9-4b68-aaf4-bee8672898af	6a1d6d19-de3b-4146-8b6a-91141811199f	6a1d6d19-de3b-4146-8b6a-91141811199f	Enviar contrato para firma digital	\N	in_progress	low	\N	\N	2026-04-16 12:04:57.184906	2026-04-16 22:33:36.220399
25f71c4c-3b36-4ecd-b369-8bf6325aba59	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	6a1d6d19-de3b-4146-8b6a-91141811199f	puebas	sd	pending	urgent	2026-04-16 23:05:00	\N	2026-04-16 23:05:31.758063	2026-04-16 23:05:31.758063
d2c4eea7-ec63-4e70-9e17-600f34669784	\N	a9118708-4ec9-4064-8dd7-21949eb1a94a	dabeee42-5d68-4eca-9670-d8b79c9fd9b5	pruebas	fdfd	in_progress	urgent	2026-04-16 23:06:00	\N	2026-04-16 23:06:30.67682	2026-04-16 23:17:27.558011
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, first_name, last_name, role, avatar_url, phone, is_active, last_login, created_at, updated_at) FROM stdin;
6a1d6d19-de3b-4146-8b6a-91141811199f	onboarding@fintechcrm.com	$2a$12$5xaPZwSUdeUwM8Wr8xy8.uJh55weljfQ8sXHIoiVB09/9DW32GCdK	Ana	García	onboarding	\N	\N	t	2026-04-16 22:47:04.818816	2026-04-16 10:39:05.042612	2026-04-16 21:34:12.845035
88dcc2d9-995b-48e7-984c-3109283a3310	commercial@fintechcrm.com	$2a$12$6xogb/jL0xuG0nsRDB4MD.utzsktEnk9/4rOe4V9CcY6nDn2aqkT.	Carlos	Mendoza	commercial	\N	\N	t	2026-04-16 23:08:09.310988	2026-04-16 10:39:04.815126	2026-04-16 21:34:13.537052
a9118708-4ec9-4064-8dd7-21949eb1a94a	admin@fintechcrm.com	$2a$12$OECGdHh6nnhEB7WjtiH6ne4A9gBJmf3onqr0vkKDFC5EmGR4wzyi.	Admin	System	admin	\N	\N	t	2026-04-16 23:08:18.147521	2026-04-16 10:39:04.570866	2026-04-16 10:39:04.570866
dabeee42-5d68-4eca-9670-d8b79c9fd9b5	rogerfrankp@gmail.com	$2a$12$OGOa/ctxoND0k1TbXNCrvOrSMonjtiKa6Hj1gO8rTi2Fymmba.9a2	Roger	Pecho	onboarding	\N	976233721	t	2026-04-16 23:17:01.151473	2026-04-16 23:06:02.173128	2026-04-16 23:16:41.268332
\.


--
-- Data for Name: webhook_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.webhook_configs (id, name, url, secret, events, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: webhook_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.webhook_logs (id, webhook_id, event, payload, response_status, response_body, success, attempted_at) FROM stdin;
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migrations_id_seq', 13, true);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: merchant_status_history merchant_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_status_history
    ADD CONSTRAINT merchant_status_history_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: sla_config sla_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_config
    ADD CONSTRAINT sla_config_pkey PRIMARY KEY (id);


--
-- Name: sla_history sla_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_history
    ADD CONSTRAINT sla_history_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: sla_config uq_sla_config_entity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_config
    ADD CONSTRAINT uq_sla_config_entity UNIQUE (entity_type, entity_key);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_configs webhook_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_configs
    ADD CONSTRAINT webhook_configs_pkey PRIMARY KEY (id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_merchant ON public.audit_logs USING btree (merchant_id);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_comments_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_merchant ON public.comments USING btree (merchant_id);


--
-- Name: idx_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_user ON public.comments USING btree (user_id);


--
-- Name: idx_documents_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_merchant ON public.documents USING btree (merchant_id);


--
-- Name: idx_events_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_created_by ON public.calendar_events USING btree (created_by);


--
-- Name: idx_events_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_merchant ON public.calendar_events USING btree (merchant_id);


--
-- Name: idx_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_start ON public.calendar_events USING btree (start_time);


--
-- Name: idx_merchants_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_assigned_to ON public.merchants USING btree (assigned_to);


--
-- Name: idx_merchants_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_last_activity ON public.merchants USING btree (last_activity_at);


--
-- Name: idx_merchants_mcc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_mcc ON public.merchants USING btree (mcc_code);


--
-- Name: idx_merchants_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_score ON public.merchants USING btree (score);


--
-- Name: idx_merchants_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_status ON public.merchants USING btree (status);


--
-- Name: idx_merchants_tax_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_merchants_tax_id ON public.merchants USING btree (tax_id);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_sla_config_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_config_type ON public.sla_config USING btree (entity_type);


--
-- Name: idx_sla_history_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_history_assigned ON public.sla_history USING btree (assigned_to);


--
-- Name: idx_sla_history_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_history_entity ON public.sla_history USING btree (entity_id, entity_type);


--
-- Name: idx_sla_history_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_history_event ON public.sla_history USING btree (event_type);


--
-- Name: idx_sla_history_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_history_occurred ON public.sla_history USING btree (occurred_at);


--
-- Name: idx_status_history_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_merchant ON public.merchant_status_history USING btree (merchant_id);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_merchant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_merchant ON public.tasks USING btree (merchant_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_webhook_logs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_event ON public.webhook_logs USING btree (event);


--
-- Name: idx_webhook_logs_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_webhook ON public.webhook_logs USING btree (webhook_id);


--
-- Name: audit_logs audit_logs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: calendar_events calendar_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: calendar_events calendar_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: comments comments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id);


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: documents documents_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: documents documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: merchant_status_history merchant_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_status_history
    ADD CONSTRAINT merchant_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: merchant_status_history merchant_status_history_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_status_history
    ADD CONSTRAINT merchant_status_history_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchants merchants_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: merchants merchants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sla_config sla_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_config
    ADD CONSTRAINT sla_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: sla_history sla_history_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_history
    ADD CONSTRAINT sla_history_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: webhook_configs webhook_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_configs
    ADD CONSTRAINT webhook_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: webhook_logs webhook_logs_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhook_configs(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 1vHppSFaJTx2OmDd26yezWuOXbuKlQ4g81bQRfXOuKU4B3v7hP42qczBwabQbM3

