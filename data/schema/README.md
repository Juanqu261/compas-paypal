# Schema

Everything lives in the `compas` schema in Supabase Postgres. Only the backend queries it. Frontend developers should read [`contracts/data-model/README.md`](../../contracts/data-model/README.md) instead.

## Migrations

| File | Status |
| --- | --- |
| `20261017032839_compas_core.sql` | Applied 2026-10-16 |
| `20261026120000_paypal_rail.sql` | Applied 2026-10-27. **Destructive:** it empties the runtime tables. Never run it again |
| `20261027170000_analyst_errands.sql` | Applied 2026-10-27. Additive: catalogs, product mappings as `(registry, code)` (only `INVIMA_CUM` in this medicine MVP), analyst findings, merchant logins, errands. The tables are empty: the backend keeps these in memory until there are Postgres adapters |

## Tables

| Table | Port | Holds |
| --- | --- | --- |
| `parties`, `merchants` | none yet | People and shop names. Display only |
| `mandates` | `MandateRepository` | Budgets, purpose, minimum confidence, remaining capacity |
| `spending_records` | `SpendingLog` | Every attempt: its decision, its PayPal order and its state |
| `trust_log_entries` | `MerchantTrustLog` | Category claims, bindings, analyst flags, revocations |
| `merchant_observations` | `MerchantObservationLog` | Paid purchases and payer verdicts (the history axis) |
| `audit_events` | `AuditRepository` | The decision timeline |
| `registry_*` | `BusinessRegistryLookup` | The Cámara de Comercio extract |
| `purchase_intents` | none yet | Charges created by merchants (future) |

## Rules Postgres enforces

- **Append-only logs.** The trust log, the observations and the audit events refuse `UPDATE` and `DELETE`. A spending record may change only its PayPal fields.
- **Non-custodial.** No balance table. Amounts are integer minor units.
- **No raw identifiers in the logs.** NITs, cédulas and party ids are stored as HMAC refs.
- **Shape checks:** PayPal account ids, COMPAS categories, a PayPal order only on `ALLOW`, approval links only on `paypal.com`.

## Access

- RLS is on for every table, with a policy only for `compas_backend`. `anon` and `authenticated` get nothing.
- The login role is created once in the SQL editor, never in git: `create role compas_api login password '…' in role compas_backend;`.
- The backend connects through the pooler with `DATABASE_URL`. That variable is never a `NEXT_PUBLIC_*` variable.
- `MERCHANT_SUBJECT_HMAC_KEY` is required with a database and must never change.

## Open

- No ADR yet records Postgres as the persistence choice.
- `purchase_intents` has no domain type or route.
- The analyst and errand migration needs adapters before it is applied.
