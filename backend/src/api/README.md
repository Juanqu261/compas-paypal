# API

Implemented routes:

- `GET /health`
- `GET /open-payments/finish`: Pedro's wallet redirects here after consent. The route checks the finish hash, finishes the grant and redirects to `OPEN_PAYMENTS_RETURN_URL` with `payerAuthorization=granted|rejected|failed`. See `contracts/open-payments/README.md`.
- `POST /merchant-category-claims`: signed category evidence from push sources such as a wallet node. See `contracts/merchant-categories/README.md`.
- `GET /merchants/categories?walletAddress=…`: a merchant's resolved COMPAS categories, trust levels and declared categories with their corroboration. A view, not a policy decision.
- `POST /demo/sessions`: a DEMO identity for Pedro, Andrea or Gladys (`demo-identity.ts`). Off with `NODE_ENV=production` or `COMPAS_DEMO_IDENTITY=disabled`. A demo session asks a wallet for a grant only with `COMPAS_DEMO_PAYER_GRANTS=enabled` on the test network (`readDemoPayerGrantsMode`). Otherwise `POST /mandates/:id/authorize` answers `403 PAYER_GRANTS_DISABLED_FOR_DEMO`.
- `GET /me`, `GET /demo/participants`, `GET /mandates?role=payer|delegate`, `GET /mandates/:id`, `POST /mandates`, `POST /mandates/:id/authorize`, `POST /mandates/:id/revoke`, `GET /mandates/:id/spending` (`mandates.ts`). The actor comes from the session token. The finish callback activates a mandate after a verified consent. Mandates live in Postgres with `DATABASE_URL`, in memory without it. See `contracts/mandates/README.md`.

- `GET /demo/merchants`: demo/test data. The merchants a purchase may name, with their resolved categories, and whether any evidence source is registered. No wallet address. See `contracts/merchant-categories/README.md`.
- `POST /purchases/preview`, `POST /purchases` (`purchases.ts`): the delegate's purchase under a mandate. The preview runs the checks before Open Payments and writes nothing. A purchase runs `purchaseUnderMandate` and is idempotent by key. It runs only with `COMPAS_DEMO_PURCHASES=enabled` on the test network (`readDemoPurchasesMode`), otherwise `403 PURCHASES_DISABLED_FOR_DEMO`. See `contracts/purchases/README.md`.

Handled but not wired into `server.ts`:

- `POST /spending-records/:id/confirmation`: the payer's `MATCH` or `MISMATCH` on a paid purchase (`spending-confirmations.ts`). Not wired yet: it takes the payer id from the body, and it should take it from the session first. See `contracts/merchant-history/README.md`.

The frontend must call this process later. It must not import `backend/src`.

Likely future resources, not implemented:

- `POST /purchase-intents`: a charge the merchant creates, stored in `compas.purchase_intents`. It needs merchant authentication first.

A policy result is produced here. The browser does not decide `ALLOW`, `DENY`, or `REVIEW`.
