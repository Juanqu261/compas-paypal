# Migrations

- `20261017032839_compas_core.sql`: the COMPAS schema, for the Open Payments rail. Applied to the team's Supabase project on 2026-10-16 as migration `20261017032839` (`compas_core`). See `../schema/README.md`.
- `20261026120000_paypal_rail.sql`: moves the schema to the PayPal rail. Applied to the same project on 2026-10-27 as migration `20261026120000` (`paypal_rail`), then the demo was reseeded by a backend start. Destructive: it empties the COMPAS runtime tables before changing them. See "The PayPal migration" in `../schema/README.md`.
