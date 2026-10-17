# API

Implemented routes:

- `GET /health`
- `GET /open-payments/finish`: Pedro's wallet redirects here after consent. The route checks the finish hash, finishes the grant and redirects to `OPEN_PAYMENTS_RETURN_URL` with `payerAuthorization=granted|rejected|failed`. See `contracts/open-payments/README.md`.
- `POST /merchant-category-claims`: signed category evidence from push sources such as a wallet node. See `contracts/merchant-categories/README.md`.
- `GET /merchants/categories?walletAddress=…`: a merchant's resolved COMPAS categories, trust levels and declared categories with their corroboration. A view, not a policy decision.
- `POST /demo/sessions`: a DEMO identity for Pedro, Andrea or Gladys (`demo-identity.ts`). Off with `NODE_ENV=production` or `COMPAS_DEMO_IDENTITY=disabled`. A demo session asks a wallet for a grant only with `COMPAS_DEMO_PAYER_GRANTS=enabled` on the test network (`readDemoPayerGrantsMode`). Otherwise `POST /mandates/:id/authorize` answers `403 PAYER_GRANTS_DISABLED_FOR_DEMO`.
- `GET /me`, `GET /demo/participants`, `GET /mandates?role=payer|delegate`, `GET /mandates/:id`, `POST /mandates`, `POST /mandates/:id/authorize`, `POST /mandates/:id/revoke`, `GET /mandates/:id/spending` (`mandates.ts`). The actor comes from the session token. The finish callback activates a mandate after a verified consent. Mandates live in memory. See `contracts/mandates/README.md`.

Handled but not wired into `server.ts`:

- `POST /spending-records/:id/confirmation`: the payer's `MATCH` or `MISMATCH` on a paid purchase (`spending-confirmations.ts`). It is wired together with the purchase routes, because until then the observation log is empty. See `contracts/merchant-history/README.md`.

The frontend must call this process later. It must not import `backend/src`.

Likely future resources, not implemented:

- `POST /purchase-intents`
- `POST /policy-evaluations`
- `POST /payments`

A policy result is produced here. The browser does not decide `ALLOW`, `DENY`, or `REVIEW`.
