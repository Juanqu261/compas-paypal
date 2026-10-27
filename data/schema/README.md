# Schema

**Status: two migrations, both applied.** [`../migrations/20261017032839_compas_core.sql`](../migrations/20261017032839_compas_core.sql) was applied to the team's Supabase project on 2026-10-16 as migration `20261017032839`, for the Open Payments rail. [`../migrations/20261026120000_paypal_rail.sql`](../migrations/20261026120000_paypal_rail.sql) moves the schema to the PayPal rail ([ADR 0008](../../docs/adr/0008-paypal-rail-per-order-approval.md)) and was applied to the team's Supabase project on 2026-10-27 as migration `20261026120000`. It is destructive: it empties every COMPAS runtime table first (see "The PayPal migration" below). The backend code expects both.

Before it was applied, the migration passed 40 checks of its constraints, append-only triggers and grants on a throwaway Postgres 17 container with dummy rows. After it was applied, Supabase showed RLS on all 11 tables, no `compas` access for `anon` or `authenticated`, and no security advisor warnings.

Frontend developers: read [`contracts/data-model/README.md`](../../contracts/data-model/README.md) instead.

## Tables

Everything lives in the `compas` schema. The browser never queries it. The frontend calls the backend, and only the backend decides `ALLOW`, `DENY` or `REVIEW`.

| Table | Backend port | What the demo shows from it |
| --- | --- | --- |
| `parties` | none yet | Pedro, Andrea and Gladys. A role comes from the mandate that names the party |
| `merchants` | none yet | The shop name on the Nequi Negocios and Nequi screens. Display only, never evidence |
| `mandates` | `MandateRepository` | Pedro's budget, purpose, minimum confidence, `ENFORCED`/`MONITORED`, remaining capacity |
| `purchase_intents` | none yet (new) | The charge the shop creates and Andrea pays: the QR handoff between two phones |
| `spending_records` | `SpendingLog` | Pedro's spending report: every attempt, its decision, reasons, confidence, line categories, and its PayPal order, approval link, capture and state |
| `trust_log_entries` | `MerchantTrustLog` | The shop's categories, trust levels and corroboration (`GET /merchants/categories`) |
| `merchant_observations` | `MerchantObservationLog` | Paid purchases and Pedro's `MATCH`/`MISMATCH`, the history axis of the trust matrix |
| `audit_events` | `AuditRepository` | The decision timeline |
| `registry_companies`, `registry_establishments` | `BusinessRegistryLookup` | The Cámara de Comercio evidence, loaded from `data/seeds/merchant-registry/` |

These stay in `data/seeds/` as versioned files, because they are reviewed configuration and tests read them: CIIU and license mappings, the trust matrix and the category sources.

## Rules the database enforces

- **Append-only.** `trust_log_entries`, `merchant_observations` and `audit_events` refuse `UPDATE` and `DELETE` for every role. In `spending_records`, only the PayPal fields may change: `paypal_order_id` and `paypal_approval_url` once, `paypal_capture_id` once, `payment_state` and `payment_failure_code`. `TRUNCATE` still resets the demo.
- **Non-custodial.** There is no balance or money table. `remaining_value` is authorization capacity, not money held. Amounts are integer minor units in `numeric(20,0)`, like `MoneyAmount.value`.
- **No raw identifiers in the logs.** `subject_ref`, `payer_ref` and `delegate_ref` must look like an HMAC-SHA256 in base64url (43 characters), so a raw NIT, cédula or party id is refused.
- **Registry privacy.** A natural person's shop has no NIT. Only company NITs are stored.
- **Shape checks** cover the following. Postgres runs every check on each insert or update.
  - COMPAS categories
  - PayPal account ids (`compas.paypal_account_id`: 13 characters, no 0, 1, I or O)
  - remaining capacity of at most the budget
  - one paid observation and one verdict per purchase
  - a PayPal order only on `ALLOW`, and its state with it
  - an approval link only on `paypal.com` over https
  - a failure code only on a `FAILED` payment

## Access

- `anon` and `authenticated` have no access to the `compas` schema. Every table also has RLS turned on, with a policy only for `compas_backend`.
- `compas_backend` is a `nologin` role, and its grants follow the ports:
  - it can't update or delete the logs
  - it can update only the payment columns of `spending_records`
  - it can only read the registry
- Create the login role once in the SQL editor, never in git: `create role compas_api login password '…' in role compas_backend;`.
- The backend connects with `DATABASE_URL` in `backend/.env` through the Supabase pooler (transaction mode, user `compas_api.<project-ref>`). It is never a `NEXT_PUBLIC_*` variable.
- No PayPal token or secret is stored: the backend keeps the client secret in its environment and the access token in memory.

## Backend integration

Done on 2026-10-16. Each item was checked against a local Postgres 17 with this migration, connecting as a member of `compas_backend`:

- **Adapters.** `backend/src/integrations/postgres/` has one adapter per port, on the `postgres` driver with prepared statements off for the pooler. They cover the trust log, observation log, spending log, mandates, audit and registry lookup.
- **Wiring.** With `DATABASE_URL`, the server stores mandates, spending records, audit events and the trust log here. `npm run compas:smoke` also stores the mandate, the spending and observation logs, and the mandate's capacity.
- **HMAC key.** With a database, a missing `MERCHANT_SUBJECT_HMAC_KEY` stops startup.
- **Idempotent demo seed.** A second start keeps the first start's entries.
- **Budget reservation.** With a mandate repository, `purchaseUnderMandate` reserves the charge with one conditional `UPDATE` before recording an `ALLOW`. If the reservation fails, the decision becomes `DENY BUDGET_EXCEEDED`. If creating the PayPal order throws, or the order closes unpaid, the reservation is released.
- **Demo tienda history.** Every observation must point at a spending record, which must point at a mandate. So in Postgres the history seed also writes 12 food mandates (`demo-food-mandate-N`), their parties and their spending records (`demo-tienda-purchase-N`), all `demo/test data`. A start that stops halfway is completed by the next one.
- **Registry load.** `DATABASE_ADMIN_URL=… npm run registry:load` loads 290 companies and 1,900 establishments.

Still open:

1. **The login role.** Create it in the Supabase SQL editor, never in git: `create role compas_api login password '…' in role compas_backend;`. Then set `DATABASE_URL` in `backend/.env`.
2. **`purchase_intents`** has no domain type or route yet. Clear line descriptions once a charge is decided.
3. **An ADR.** No ADR records Supabase Postgres as the persistence choice yet.
4. **The PayPal migration** was applied to the team's project on 2026-10-27, after checking that its `compas` tables held only demo/test data. The Open Payments checkout no longer works against that project.

## The PayPal migration

`20261026120000_paypal_rail.sql`, written on 2026-10-26 for [ADR 0008](../../docs/adr/0008-paypal-rail-per-order-approval.md):

- **Empties the runtime tables first:** `merchant_observations`, `spending_records`, `purchase_intents`, `payer_grants`, `audit_events`, `mandates`, `merchants`, `trust_log_entries` and `parties`. Their rows are demo/test data naming test-network wallets, and the append-only logs can't be rewritten. The backend reseeds the demo at its next start. The Cámara de Comercio registry tables are kept.
- Replaces the `wallet_url` domain with `paypal_account_id` on every merchant column, renamed `paypal_merchant_id`. `parties.wallet_address_url` becomes `paypal_payer_id`.
- Drops `payer_grants` and the `PENDING_AUTHORIZATION` status.
- On `spending_records`: drops the quote and debit columns, renames `outgoing_payment_url` to `paypal_order_id`, adds `paypal_approval_url`, `paypal_capture_id`, `payment_failure_code`, `line_categories` and `has_uncategorized_lines`, widens `payment_state`, and replaces the update guard.
- Renames `audit_events.open_payments_refs` to `paypal_refs`.

Checked on 2026-10-26 on a throwaway Postgres 17 container: the core migration, then rows shaped like the Open Payments demo data, then this migration, then the whole backend suite with `TEST_DATABASE_URL` as a member of `compas_backend` (248 tests, the Postgres adapter tests included). As that role, an amount update and a delete were refused for lack of grants; a changed approval link, an approval link off `paypal.com`, a wallet URL as a merchant id and a failure code without `FAILED` were refused by the guard and the checks.
