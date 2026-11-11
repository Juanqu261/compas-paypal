-- Fulfillment evidence, refunds and recurring care plans.
-- NOT APPLIED. Demo workspaces keep these in memory. Apply this file only
-- on a database that already has the PayPal schema, and never re-run
-- 20261026120000_paypal_rail.sql (it truncates runtime tables).
--
-- Additive: new tables only. No truncate, no delete, no drop.
-- Rollback, by hand, only if this file was applied and must be undone:
--   drop table if exists compas.care_plan_cycles;
--   drop table if exists compas.care_plans;
--   drop table if exists compas.refunds;
--   drop table if exists compas.fulfillment_evidence;

create table if not exists compas.fulfillment_evidence (
  id text primary key,
  purchase_id text not null,
  mandate_id text not null references compas.mandates (id),
  merchant_id text not null,
  paypal_order_id text,
  paypal_capture_id text,
  evidence_type text not null check (evidence_type in ('STRUCTURED_RECEIPT', 'RECEIPT_TEXT')),
  submitted_at timestamptz not null,
  submitted_by text not null,
  document_hash text not null check (document_hash ~ '^[a-f0-9]{64}$'),
  canonical text not null,
  claimed_items jsonb not null,
  verification_status text not null check (verification_status in (
    'NOT_SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED_DOCUMENT_MATCH', 'MISMATCH', 'REVIEW_REQUIRED', 'REJECTED'
  )),
  reason_codes jsonb not null default '[]',
  verifier_version text not null,
  review_status text not null check (review_status in ('NONE', 'REVIEW_REQUIRED')),
  reviewed_at timestamptz,
  unique (purchase_id, document_hash)
);

create table if not exists compas.refunds (
  refund_id text primary key,
  paypal_refund_id text not null unique,
  paypal_capture_id text not null,
  purchase_id text not null,
  mandate_id text not null references compas.mandates (id),
  amount_value text not null,
  amount_currency text not null,
  amount_scale integer not null,
  status text not null check (status in ('REQUESTED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  requested_at timestamptz not null,
  completed_at timestamptz,
  idempotency_key text not null,
  source text not null check (source in ('DEMO_SIMULATION', 'PAYPAL_WEBHOOK')),
  capacity_restored_value text not null,
  capacity_applied boolean not null default false,
  reason text,
  last_verified_at timestamptz not null,
  unique (mandate_id, idempotency_key)
);

create table if not exists compas.care_plans (
  id text primary key,
  payer_id text not null,
  delegate_id text not null,
  beneficiary_id text not null,
  mandate_id text not null references compas.mandates (id),
  name text not null,
  purpose text not null check (purpose = 'MEDICATION'),
  authorized_cums jsonb not null,
  product_label text not null,
  max_amount_value text not null,
  currency text not null,
  asset_scale integer not null,
  recurrence_rule text not null check (recurrence_rule = 'MONTHLY'),
  timezone text not null,
  anchor_day integer not null check (anchor_day between 1 and 31),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null check (status in ('ACTIVE', 'PAUSED', 'REVOKED', 'COMPLETED')),
  last_generated_period text,
  next_due_at text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists compas.care_plan_cycles (
  plan_id text not null references compas.care_plans (id),
  period_id text not null check (period_id ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null check (status in ('PREPARED', 'CONFIRMED')),
  due_day integer not null,
  errand_id text,
  paypal_order_created boolean not null default false check (paypal_order_created = false),
  created_at timestamptz not null,
  primary key (plan_id, period_id)
);
