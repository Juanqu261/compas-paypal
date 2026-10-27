# Migrations

Applied to the team's Supabase project as named.

- `20261017032839_compas_core.sql`: the COMPAS schema. Applied 2026-10-16.
- `20261026120000_paypal_rail.sql`: the PayPal rail. Applied 2026-10-27. **Destructive:** it empties the runtime tables. Never run it again.
- `20261027170000_analyst_errands.sql`: catalogs, product mappings as `(registry, code)` (only `INVIMA_CUM` in this medicine MVP), analyst findings, merchant logins, errands. Applied 2026-10-27. Additive only. Its tables stay empty until the backend has Postgres adapters for them.

Details: `../schema/README.md`.
