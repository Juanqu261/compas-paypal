-- PayPal replaces Open Payments as COMPAS's payment rail. Not applied yet.
--
-- A merchant is a PayPal account, named by its PayPal merchant id, instead of
-- an Open Payments wallet address. A payer approves each allowed purchase's
-- PayPal order at PayPal, so there is no standing grant and no grant store.
-- A spending record keeps the PayPal order, its capture and its state.
--
-- DESTRUCTIVE: it empties every COMPAS runtime table first. Their rows are
-- demo/test data that name test-network wallets, which mean nothing on
-- PayPal, and the append-only trust and observation logs can't be rewritten.
-- The backend reseeds the demo at its next start. The Cámara de Comercio
-- registry (registry_companies, registry_establishments) is kept.

truncate compas.merchant_observations, compas.spending_records, compas.purchase_intents,
  compas.payer_grants, compas.audit_events, compas.mandates, compas.merchants,
  compas.trust_log_entries, compas.parties;

-- ───────────────────────── Shared types ─────────────────────────

-- A PayPal account id: a payee's merchant_id or a payer's payer_id.
-- 13 characters from PayPal's alphabet, which leaves out 0, 1, I and O.
create domain compas.paypal_account_id as text
  check (value ~ '^[2-9A-HJ-NP-Z]{13}$');

-- Where the PayPal side of an allowed purchase stands. See SpendingRecord.
alter domain compas.payment_state drop constraint payment_state_check;
alter domain compas.payment_state add constraint payment_state_check
  check (value in ('AWAITING_PAYER_APPROVAL', 'PENDING', 'COMPLETED', 'CANCELLED', 'FAILED'));

-- ───────────────────────── People and merchants ─────────────────────────

-- The only PayPal account allowed to approve orders under a payer's mandates.
alter table compas.parties drop column wallet_address_url;
alter table compas.parties add column paypal_payer_id compas.paypal_account_id;

alter table compas.merchants rename column wallet_address_url to paypal_merchant_id;
alter table compas.merchants alter column paypal_merchant_id type compas.paypal_account_id
  using paypal_merchant_id::text::compas.paypal_account_id;

-- ───────────────────────── Mandates ─────────────────────────

-- Confirming a budget asks nothing of PayPal, so nothing waits for authorization.
alter table compas.mandates drop constraint mandates_status_check;
alter table compas.mandates add constraint mandates_status_check
  check (status in ('DRAFT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED'));

-- No grant: the payer approves every order at PayPal.
drop table compas.payer_grants;

-- ───────────────────────── Purchases ─────────────────────────

alter table compas.purchase_intents rename column merchant_wallet_address_url to paypal_merchant_id;
alter table compas.purchase_intents alter column paypal_merchant_id type compas.paypal_account_id
  using paypal_merchant_id::text::compas.paypal_account_id;

-- The order is for exactly the requested amount, so there is no quote and no
-- separate debit. Open Payments references go; the PayPal order takes their place.
alter table compas.spending_records rename column merchant_wallet_address_url to paypal_merchant_id;
alter table compas.spending_records alter column paypal_merchant_id type compas.paypal_account_id
  using paypal_merchant_id::text::compas.paypal_account_id;
alter table compas.spending_records
  drop column debit_value,
  drop column debit_asset_code,
  drop column debit_asset_scale,
  drop column incoming_payment_url,
  drop column quote_id;
-- The two checks on outgoing_payment_url follow the rename: an order and its
-- state come together, and only an ALLOW has an order.
alter table compas.spending_records rename column outgoing_payment_url to paypal_order_id;
alter table compas.spending_records
  -- Where the payer approves the order at PayPal. Shown to the payer only.
  add column paypal_approval_url text,
  add column paypal_capture_id text,
  add column payment_failure_code text check (payment_failure_code in
    ('MANDATE_NOT_USABLE', 'ORDER_MISMATCH', 'PAYER_ACCOUNT_MISMATCH', 'CAPTURE_DECLINED', 'ORDER_EXPIRED')),
  -- Line categories, never descriptions, so a capture can join the merchant's history later.
  add column line_categories compas.category[] not null default '{}',
  add column has_uncategorized_lines boolean not null default false,
  add check (paypal_approval_url is null or paypal_approval_url ~ '^https://([a-z0-9-]+\.)*paypal\.com/'),
  add check (payment_failure_code is null or payment_state = 'FAILED');
create unique index spending_records_paypal_order_idx on compas.spending_records (paypal_order_id)
  where paypal_order_id is not null;

create or replace function compas.guard_spending_record_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  payment_columns constant text[] := array['paypal_order_id', 'paypal_approval_url',
    'paypal_capture_id', 'payment_state', 'payment_failure_code'];
begin
  if (to_jsonb(new) - payment_columns) is distinct from (to_jsonb(old) - payment_columns) then
    raise exception 'compas.spending_records: only the PayPal fields may change'
      using errcode = 'restrict_violation';
  end if;
  if old.paypal_order_id is not null and (new.paypal_order_id is distinct from old.paypal_order_id
      or new.paypal_approval_url is distinct from old.paypal_approval_url) then
    raise exception 'compas.spending_records: the PayPal order is already recorded'
      using errcode = 'restrict_violation';
  end if;
  if old.paypal_capture_id is not null and new.paypal_capture_id is distinct from old.paypal_capture_id then
    raise exception 'compas.spending_records: the PayPal capture is already recorded'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

-- ───────────────────────── Merchant evidence ─────────────────────────

-- A claim's PAYPAL_MERCHANT subject, a binding's merchant or a flag's merchant.
-- The checks on wallet_address_url follow the rename.
alter table compas.trust_log_entries rename column wallet_address_url to paypal_merchant_id;
alter table compas.trust_log_entries alter column paypal_merchant_id type compas.paypal_account_id
  using paypal_merchant_id::text::compas.paypal_account_id;
alter index compas.trust_log_wallet_idx rename to trust_log_merchant_idx;

alter table compas.merchant_observations rename column merchant_wallet_address_url to paypal_merchant_id;
alter table compas.merchant_observations alter column paypal_merchant_id type compas.paypal_account_id
  using paypal_merchant_id::text::compas.paypal_account_id;

-- ───────────────────────── Audit ─────────────────────────

alter table compas.audit_events rename column open_payments_refs to paypal_refs;

drop domain compas.wallet_url;

-- ───────────────────────── Access ─────────────────────────

-- The column grant on outgoing_payment_url follows the rename to paypal_order_id.
grant update (paypal_approval_url, paypal_capture_id, payment_failure_code)
  on compas.spending_records to compas_backend;
