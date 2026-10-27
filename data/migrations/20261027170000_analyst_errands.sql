-- The AI analyst, merchant catalogs mapped to product registries (INVIMA CUM in this MVP), the Cámara
-- binding through Log in with PayPal, and errands. Applied 2026-10-27.
--
-- The tables are empty: the backend still keeps all of these in memory (see
-- backend/src/integrations/analyst/create-analyst-layer.ts) until Postgres
-- adapters are written.
--
-- Additive only: it creates tables and touches no existing row. The analyst's
-- FLAGs and the Cámara's claims and bindings already live in
-- compas.trust_log_entries, which needs no change.
--
-- Product registries: a SKU maps to a code in a product registry, stored as
-- (registry, code). This MVP covers medicine only, and its one registry is
-- INVIMA's CUM ('INVIMA_CUM'): the backend's `cum` fields are written here with
-- registry 'INVIMA_CUM'. Another category (food, cosmetics) may need another
-- registry with its own code format and its own verifier; adding one extends
-- the registry checks below.
--
-- Health data: compas.errands and compas.errand_reservations name medicines
-- (CUM codes) for a beneficiary, so they are sensitive data under Ley 1581
-- de 2012. Only the backend role reads them, as with every COMPAS table.

-- ───────────────────────── Catalogs and product mappings ─────────────────────────

-- What a merchant lists. Text is the merchant's own, untrusted.
create table compas.catalog_items (
  paypal_merchant_id compas.paypal_account_id not null,
  sku_id text not null check (sku_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  name text not null check (length(name) between 1 and 500),
  description text check (length(description) <= 2000),
  price_value numeric,
  price_asset_code text,
  price_asset_scale smallint,
  updated_at timestamptz not null default now(),
  primary key (paypal_merchant_id, sku_id)
);

-- A SKU mapped to a registry code. VERIFIED only when that registry's
-- deterministic verifier re-read the code from the source and every check
-- passed (for a CUM: INVIMA's dataset, `cum-verifier.2`). One current mapping per SKU.
create table compas.catalog_mappings (
  paypal_merchant_id compas.paypal_account_id not null,
  sku_id text not null,
  registry text not null check (registry in ('INVIMA_CUM')),
  code text not null check (length(code) between 1 and 64),
  status text not null check (status in ('VERIFIED', 'REJECTED')),
  verifier_version text not null,
  checks jsonb not null,
  provenance text not null,
  sku_text_digest text not null,
  finding_id text not null,
  verified_at timestamptz not null,
  primary key (paypal_merchant_id, sku_id),
  -- Each registry's code format. A CUM is expediente-consecutivo.
  check (registry <> 'INVIMA_CUM' or code ~ '^\d{1,12}-\d{1,4}$')
);

-- ───────────────────────── Analyst findings ─────────────────────────

-- Pointers (CUM_MAPPING, CAMARA_CERTIFICATE) and judgments. A judgment holds
-- the FLAG it put in the trust log. No NIT and no email is ever stored here.
create table compas.analyst_findings (
  id text primary key,
  run_id text not null,
  paypal_merchant_id compas.paypal_account_id not null,
  kind text not null check (kind in ('POINTER', 'JUDGMENT')),
  pointer text check (pointer in ('CUM_MAPPING', 'CAMARA_CERTIFICATE')),
  judgment text check (judgment in ('CATALOG_OFF_PURPOSE', 'LOOKALIKE_SIGNALS')),
  -- The rest of the finding: SKU and registry code, verification code and outcome, or cited SKUs and note.
  detail jsonb not null,
  flag_entry_id text references compas.trust_log_entries (id),
  flag_submission_id text,
  status text check (status in ('OPEN', 'RESPONDED', 'WITHDRAWN')),
  merchant_response jsonb,
  withdrawal jsonb,
  recorded_at timestamptz not null,
  check ((kind = 'POINTER') = (pointer is not null)),
  check ((kind = 'JUDGMENT') = (judgment is not null and flag_entry_id is not null and status is not null))
);
create index analyst_findings_by_merchant on compas.analyst_findings (paypal_merchant_id, recorded_at);

-- ───────────────────────── Log in with PayPal ─────────────────────────

-- What Log in with PayPal proved about a merchant's account: its email.
create table compas.merchant_account_verifications (
  paypal_merchant_id compas.paypal_account_id primary key,
  email text not null,
  email_confirmed boolean not null,
  verified_account boolean not null,
  verified_at timestamptz not null
);

-- ───────────────────────── Errands ─────────────────────────

create table compas.errands (
  id text primary key check (id ~ '^errand-[A-Za-z0-9-]{1,80}$'),
  mandate_id text not null references compas.mandates (id),
  delegate_id text not null references compas.parties (id),
  kind text not null check (kind in ('ONE_OFF', 'STANDING')),
  status text not null check (status in ('ACTIVE', 'CANCELLED')),
  -- [{ label, acceptedProducts: [{ registry, code }], maxUnits }]. In this MVP
  -- every product is { registry: 'INVIMA_CUM', code: <CUM> }, from the API's acceptedCums.
  items jsonb not null,
  max_amount_value numeric not null check (max_amount_value > 0),
  max_amount_asset_code text not null,
  max_amount_asset_scale smallint not null,
  refill_every_days smallint check (refill_every_days between 7 and 90),
  expires_at timestamptz not null,
  drafted_by text not null check (drafted_by in ('MODEL', 'DELEGATE')),
  confirmed_at timestamptz not null,
  created_at timestamptz not null,
  check ((kind = 'STANDING') = (refill_every_days is not null))
);
create index errands_by_mandate on compas.errands (mandate_id);

-- What an allowed purchase holds against an errand. Released, never deleted,
-- when the purchase ends unpaid. Reserve with one conditional insert that
-- sums the live reservations of the window.
create table compas.errand_reservations (
  -- The spending record's id. No foreign key: the reservation is made before the record is written.
  decision_id text primary key,
  errand_id text not null references compas.errands (id),
  units integer[] not null,
  amount_value numeric not null check (amount_value >= 0),
  reserved_at timestamptz not null,
  released_at timestamptz
);
create index errand_reservations_live on compas.errand_reservations (errand_id, reserved_at) where released_at is null;

-- ───────────────────────── Access ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['catalog_items', 'catalog_mappings', 'analyst_findings',
    'merchant_account_verifications', 'errands', 'errand_reservations']
  loop
    execute format('alter table compas.%I enable row level security', t);
    execute format('create policy backend_only on compas.%I to compas_backend using (true) with check (true)', t);
  end loop;
end;
$$;

grant select, insert, update, delete on compas.catalog_items to compas_backend;
grant select, insert, update on compas.catalog_mappings, compas.merchant_account_verifications to compas_backend;
grant select, insert, update (status, merchant_response, withdrawal) on compas.analyst_findings to compas_backend;
grant select, insert, update (status) on compas.errands to compas_backend;
grant select, insert, update (released_at) on compas.errand_reservations to compas_backend;
