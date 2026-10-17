-- COMPAS core schema. Applied to the team's Supabase project on 2026-10-16.
--
-- Runtime state the backend keeps in memory today, plus the pending charge
-- the demo needs to hand a purchase from the merchant phone to the delegate
-- phone. Reference data stays in data/seeds/ as versioned files: CIIU and
-- license mappings, the trust matrix and the category sources.
--
-- Only the backend reads and writes this schema. It is not exposed through
-- the Supabase Data API, and the browser never queries it.
-- COMPAS holds no funds: there is no balance and no money ledger here.

create schema if not exists compas;
revoke all on schema compas from public, anon, authenticated;

-- ───────────────────────── Shared types ─────────────────────────

-- COMPAS purpose taxonomy. Not an Open Payments scope, not a CIIU code.
create domain compas.category as text
  check (value in ('MEDICATION', 'FOOD', 'PERSONAL_CARE', 'ALCOHOL', 'TOBACCO'));

-- MoneyAmount.value: integer minor units. numeric(20,0) holds any uint64.
create domain compas.minor_units as numeric(20, 0) check (value >= 0);
create domain compas.asset_code as text check (value ~ '^[A-Z0-9]{1,12}$');
create domain compas.asset_scale as smallint check (value between 0 and 255);

-- HMAC-SHA256, base64url. Never a raw NIT, cédula or party id.
create domain compas.hmac_ref as text check (value ~ '^[A-Za-z0-9_-]{43}$');

-- Normalized wallet address: https, no trailing slash, no query or fragment.
create domain compas.wallet_url as text
  check (value ~ '^https://[^?#\s]+[^/?#\s]$');

create domain compas.policy_outcome as text check (value in ('ALLOW', 'DENY', 'REVIEW'));
create domain compas.trust_level as text
  check (value in ('SELF_DECLARED', 'PROVIDER_VERIFIED', 'EXTERNAL_VERIFIED'));
create domain compas.payment_state as text check (value in ('PENDING', 'COMPLETED', 'FAILED'));
create domain compas.enforcement as text check (value in ('ENFORCED', 'MONITORED'));

-- ───────────────────────── Guards ─────────────────────────

create function compas.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '%.% is append-only', tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create function compas.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────── People and merchants ─────────────────────────

-- Pedro, Andrea, Gladys. A party's role comes from the mandate that names it.
create table compas.parties (
  id text primary key,
  display_name text not null,
  -- The payer's Open Payments wallet. Delegates and beneficiaries need none.
  wallet_address_url compas.wallet_url,
  created_at timestamptz not null default now()
);

-- Display data for a merchant wallet: what the Nequi Negocios surface shows.
-- Not category evidence. Categories come only from compas.trust_log_entries.
create table compas.merchants (
  wallet_address_url compas.wallet_url primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Mandates and grants ─────────────────────────

create table compas.mandates (
  id text primary key,
  payer_id text not null references compas.parties (id),
  delegate_id text not null references compas.parties (id),
  beneficiary_id text not null references compas.parties (id),

  -- Budget and remaining capacity share one asset. Capacity is permission,
  -- not a balance: the money stays in the payer's wallet.
  asset_code compas.asset_code not null,
  asset_scale compas.asset_scale not null,
  budget_value compas.minor_units not null,
  remaining_value compas.minor_units not null,

  -- PurposePolicy
  policy_id text not null,
  allowed_purposes text[] not null default '{}',
  eligible_categories compas.category[] not null,
  confidence_minimum text not null check (confidence_minimum in ('LOW', 'MEDIUM', 'HIGH')),
  -- Optional per-purchase cap below HIGH, in the payer wallet's asset.
  max_debit_below_high_value compas.minor_units,
  max_debit_below_high_asset_code compas.asset_code,
  max_debit_below_high_asset_scale compas.asset_scale,
  enforcement compas.enforcement not null,

  status text not null check (status in
    ('DRAFT', 'PENDING_AUTHORIZATION', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED')),
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (remaining_value <= budget_value),
  check (valid_from < expires_at),
  check (cardinality(eligible_categories) > 0),
  check (
    (max_debit_below_high_value is null) =
    (max_debit_below_high_asset_code is null) and
    (max_debit_below_high_value is null) =
    (max_debit_below_high_asset_scale is null)
  )
);
create index mandates_payer_id_idx on compas.mandates (payer_id);
create index mandates_delegate_id_idx on compas.mandates (delegate_id);
create index mandates_beneficiary_id_idx on compas.mandates (beneficiary_id);
create trigger mandates_touch before update on compas.mandates
  for each row execute function compas.touch_updated_at();

-- GrantStore. Every token is a secret: never log it or return it over HTTP.
-- Hardening after the hackathon: move the tokens to Supabase Vault.
create table compas.payer_grants (
  grant_key text primary key references compas.mandates (id) on delete cascade,
  state text not null check (state in ('PENDING', 'ACTIVE')),
  payer_wallet_address_url compas.wallet_url not null,
  resource_server text not null,
  continue_uri text not null,
  continue_access_token text not null,
  -- PENDING
  grant_endpoint text,
  client_nonce text,
  finish_nonce text,
  -- ACTIVE
  access_token text,
  manage_url text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now(),

  check (state <> 'PENDING' or
    (grant_endpoint is not null and client_nonce is not null and finish_nonce is not null)),
  check (state <> 'ACTIVE' or (access_token is not null and manage_url is not null))
);
create trigger payer_grants_touch before update on compas.payer_grants
  for each row execute function compas.touch_updated_at();

-- ───────────────────────── Purchases ─────────────────────────

-- A charge the merchant created and the delegate has not paid yet.
-- Line descriptions can name a medicine, so the backend clears them
-- (keeps id, category and amount) once the charge is decided.
create table compas.purchase_intents (
  id text primary key,
  merchant_wallet_address_url compas.wallet_url not null,
  -- Display only. Not evidence.
  merchant_display_name text,
  asset_code compas.asset_code not null,
  asset_scale compas.asset_scale not null,
  amount_value compas.minor_units not null,
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  status text not null default 'OPEN' check (status in ('OPEN', 'DECIDED', 'EXPIRED', 'CANCELLED')),
  -- Set when the delegate pays it under a mandate.
  mandate_id text references compas.mandates (id),
  delegate_id text references compas.parties (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),

  check (status <> 'DECIDED' or (mandate_id is not null and delegate_id is not null))
);
create index purchase_intents_open_idx on compas.purchase_intents (merchant_wallet_address_url, created_at desc)
  where status = 'OPEN';
create index purchase_intents_mandate_id_idx on compas.purchase_intents (mandate_id);
create index purchase_intents_delegate_id_idx on compas.purchase_intents (delegate_id);
create trigger purchase_intents_touch before update on compas.purchase_intents
  for each row execute function compas.touch_updated_at();

-- SpendingLog. One row per purchase attempt and its policy decision, allowed
-- or not. Only the Open Payments payment fields may change afterwards.
create table compas.spending_records (
  -- The policy decision id.
  id text primary key,
  mandate_id text not null references compas.mandates (id),
  purchase_intent_id text not null,
  merchant_wallet_address_url compas.wallet_url not null,
  merchant_display_name text,

  -- What the merchant asked for, in the merchant wallet's asset.
  requested_value compas.minor_units not null,
  requested_asset_code compas.asset_code not null,
  requested_asset_scale compas.asset_scale not null,
  -- What leaves the payer wallet, from the quote. Null when no quote was made.
  debit_value compas.minor_units,
  debit_asset_code compas.asset_code,
  debit_asset_scale compas.asset_scale,

  outcome compas.policy_outcome not null,
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  -- PurposeCheck, including the MerchantConfidenceRecord and its history
  -- summary, so an audit can replay the confidence.
  purpose_check jsonb,
  -- [{category, trustLevel}] at decision time.
  merchant_categories jsonb not null default '[]',
  monitored_exception boolean not null default false,

  incoming_payment_url text,
  quote_id text,
  outgoing_payment_url text,
  payment_state compas.payment_state,
  recorded_at timestamptz not null,

  check ((debit_value is null) = (debit_asset_code is null) and (debit_value is null) = (debit_asset_scale is null)),
  check ((outgoing_payment_url is null) = (payment_state is null)),
  check (outgoing_payment_url is null or outcome = 'ALLOW')
);
create index spending_records_mandate_idx on compas.spending_records (mandate_id, recorded_at desc);
create index spending_records_merchant_idx on compas.spending_records (merchant_wallet_address_url, recorded_at desc);

create function compas.guard_spending_record_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['outgoing_payment_url', 'payment_state'])
     is distinct from (to_jsonb(old) - array['outgoing_payment_url', 'payment_state']) then
    raise exception 'compas.spending_records: only the payment reference and state may change'
      using errcode = 'restrict_violation';
  end if;
  if old.outgoing_payment_url is not null and new.outgoing_payment_url is distinct from old.outgoing_payment_url then
    raise exception 'compas.spending_records: the outgoing payment is already recorded'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger spending_records_guard before update on compas.spending_records
  for each row execute function compas.guard_spending_record_update();
create trigger spending_records_no_delete before delete on compas.spending_records
  for each row execute function compas.forbid_mutation();

-- ───────────────────────── Merchant evidence ─────────────────────────

-- MerchantTrustLog. Append-only; corrections are REVOCATION entries.
-- The trust level is not stored: it comes from the source registry at read time.
create table compas.trust_log_entries (
  id text primary key,
  type text not null check (type in
    ('CATEGORY_CLAIM', 'LICENSE_CLAIM', 'IDENTITY_BINDING', 'REVOCATION', 'FLAG')),
  -- Registered in data/seeds/category-sources/, not in this database.
  source_id text not null,
  submission_id text not null,
  -- SHA-256 of the exact submission bytes, base64url.
  body_digest text not null,
  recorded_at timestamptz not null default now(),

  -- The wallet the entry is about: a claim's WALLET_ADDRESS subject, a
  -- binding's wallet or a flag's wallet. listByWalletAddress reads this.
  wallet_address_url compas.wallet_url,
  -- A claim's TAX_ID subject or a binding's subject. Never the raw NIT.
  subject_ref compas.hmac_ref,
  revokes_entry_id text references compas.trust_log_entries (id),
  observed_at timestamptz,
  valid_until timestamptz,
  -- Type-specific fields: codes, declaredCategories, evidenceRef, licenseType,
  -- licenseRef, reason, category, note.
  details jsonb not null default '{}',

  unique (source_id, submission_id),
  check (type not in ('CATEGORY_CLAIM', 'LICENSE_CLAIM') or
    ((wallet_address_url is null) <> (subject_ref is null) and observed_at is not null)),
  check (type <> 'IDENTITY_BINDING' or
    (wallet_address_url is not null and subject_ref is not null and observed_at is not null)),
  check (type <> 'REVOCATION' or revokes_entry_id is not null),
  check (type <> 'FLAG' or wallet_address_url is not null)
);
create index trust_log_wallet_idx on compas.trust_log_entries (wallet_address_url)
  where wallet_address_url is not null;
create index trust_log_subject_idx on compas.trust_log_entries (subject_ref, type)
  where subject_ref is not null;
create index trust_log_revokes_idx on compas.trust_log_entries (revokes_entry_id)
  where revokes_entry_id is not null;
create trigger trust_log_append_only before update or delete on compas.trust_log_entries
  for each row execute function compas.forbid_mutation();

-- MerchantObservationLog. What COMPAS saw happen at a merchant. Kept apart
-- from the trust log, so history never looks like an attestation.
-- No line descriptions, product names or amounts. Parties only as HMAC refs.
create table compas.merchant_observations (
  -- `${spendingRecordId}:paid` or `${spendingRecordId}:verdict`
  id text primary key,
  type text not null check (type in ('PAID', 'PAYER_VERDICT')),
  spending_record_id text not null references compas.spending_records (id),
  merchant_wallet_address_url compas.wallet_url not null,
  payer_ref compas.hmac_ref not null,
  observed_at timestamptz not null,
  -- PAID
  delegate_ref compas.hmac_ref,
  mandate_categories compas.category[],
  line_categories compas.category[],
  has_uncategorized_lines boolean,
  enforcement compas.enforcement,
  payment_state text check (payment_state in ('PENDING', 'COMPLETED')),
  -- PAYER_VERDICT
  verdict text check (verdict in ('MATCH', 'MISMATCH')),

  unique (spending_record_id, type),
  check (type <> 'PAID' or (delegate_ref is not null and mandate_categories is not null
    and line_categories is not null and has_uncategorized_lines is not null
    and enforcement is not null and payment_state is not null and verdict is null)),
  check (type <> 'PAYER_VERDICT' or (verdict is not null and delegate_ref is null))
);
create index merchant_observations_merchant_idx
  on compas.merchant_observations (merchant_wallet_address_url, observed_at);
create trigger merchant_observations_append_only before update or delete on compas.merchant_observations
  for each row execute function compas.forbid_mutation();

-- ───────────────────────── Audit ─────────────────────────

-- AuditRepository. Opaque operational fields only: no diagnoses or medicine names.
create table compas.audit_events (
  id text primary key,
  type text not null,
  occurred_at timestamptz not null,
  mandate_id text references compas.mandates (id),
  decision_id text,
  actor_id text,
  open_payments_refs jsonb,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object')
);
create index audit_events_mandate_idx on compas.audit_events (mandate_id, occurred_at);
create trigger audit_events_append_only before update or delete on compas.audit_events
  for each row execute function compas.forbid_mutation();

-- ───────────────────────── Cámara de Comercio registry ─────────────────────────

-- Loaded from data/seeds/merchant-registry/rues-medellin.json (Confecámaras
-- RUES open data, CC BY-SA 4.0). Public registry data, not attestations:
-- RegistryDbFeed turns rows into trust-log claims through ingestCategoryClaim.

-- Company owners only. A natural person's NIT is a cédula and is never stored.
create table compas.registry_companies (
  nit text primary key check (nit ~ '^[0-9]{5,15}$'),
  check_digit smallint not null check (check_digit between 0 and 9),
  name text,
  legal_form text,
  ciiu_primary text check (ciiu_primary ~ '^[0-9]{4}$'),
  snapshot_at timestamptz not null
);

create table compas.registry_establishments (
  camara text not null,
  matricula text not null,
  name text not null,
  registration_type text not null,
  status text not null check (status in ('ACTIVE', 'INACTIVE', 'CANCELLED')),
  ciiu_primary text not null check (ciiu_primary ~ '^[0-9]{4}$'),
  ciiu_secondary text[] not null default '{}' check (cardinality(ciiu_secondary) <= 3),
  registered_on date,
  renewed_on date,
  last_renewal_year smallint not null,
  owner_type text not null check (owner_type in ('PERSONA_NATURAL', 'PERSONA_JURIDICA')),
  owner_nit text references compas.registry_companies (nit),
  provenance text not null,
  snapshot_at timestamptz not null,

  primary key (camara, matricula),
  check ((owner_type = 'PERSONA_JURIDICA') = (owner_nit is not null))
);
-- BusinessRegistryLookup.findByNit
create index registry_establishments_owner_nit_idx on compas.registry_establishments (owner_nit)
  where owner_nit is not null;

-- ───────────────────────── Access ─────────────────────────

-- The backend's privileges. Create its login role once in the SQL editor,
-- never in git:  create role compas_api login password '…' in role compas_backend;
create role compas_backend nologin;

-- RLS on every table, with one policy for the backend role only. anon and
-- authenticated get nothing, even if the schema is exposed by mistake.
-- Grants, not policies, decide what the backend may do to each table.
do $$
declare t text;
begin
  foreach t in array array['parties', 'merchants', 'mandates', 'payer_grants',
    'purchase_intents', 'spending_records', 'trust_log_entries',
    'merchant_observations', 'audit_events', 'registry_companies', 'registry_establishments']
  loop
    execute format('alter table compas.%I enable row level security', t);
    execute format('create policy backend_only on compas.%I to compas_backend using (true) with check (true)', t);
  end loop;
end;
$$;

grant usage on schema compas to compas_backend;
grant select, insert, update on compas.parties, compas.merchants, compas.mandates,
  compas.purchase_intents to compas_backend;
grant select, insert, update, delete on compas.payer_grants to compas_backend;
grant select, insert, update (outgoing_payment_url, payment_state) on compas.spending_records to compas_backend;
grant select, insert on compas.trust_log_entries, compas.merchant_observations,
  compas.audit_events to compas_backend;
grant select on compas.registry_companies, compas.registry_establishments to compas_backend;
