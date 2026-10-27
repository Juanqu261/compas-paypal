# Data

This directory is the home for COMPAS data assets. It is not a database. The backend's schema lives in `migrations/`. With `DATABASE_URL`, the backend stores its mandates, logs and audit events there. See `schema/README.md`.

- `fixtures/demo/` — labeled demo/test scenarios. The medication purchase is the allowed story. The alcohol purchase is the rejected story.
- `schema/` — future database or document schemas.
- `migrations/` — future schema migrations.
- `seeds/` — future seed and reference data, including a merchant taxonomy when one exists.

The frontend reads the demo fixtures for display. The backend tests check their expected policy labels. Neither runtime owns a second copy of the scenario data.
