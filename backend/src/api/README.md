# API

Implemented routes:

- `GET /health`
- `GET /open-payments/finish`: Pedro's wallet redirects here after consent. The route checks the finish hash, finishes the grant and redirects to `OPEN_PAYMENTS_RETURN_URL` with `payerAuthorization=granted|rejected|failed`. See `contracts/open-payments/README.md`.
- `POST /merchant-category-claims`: signed category evidence from push sources such as a wallet node. See `contracts/merchant-categories/README.md`.
- `GET /merchants/categories?walletAddress=…`: a merchant's resolved COMPAS categories, trust levels and declared categories with their corroboration. A view, not a policy decision.

Handled but not wired into `server.ts`:

- `POST /spending-records/:id/confirmation`: the payer's `MATCH` or `MISMATCH` on a paid purchase (`spending-confirmations.ts`). It is wired together with the purchase routes, because until then the observation log is empty. See `contracts/merchant-history/README.md`.

The frontend must call this process later. It must not import `backend/src`.

Likely future resources, not implemented:

- `POST /mandates` and `GET /mandates/:id`
- `POST /purchase-intents`
- `POST /policy-evaluations`
- `POST /payments`
- `GET /demo/session`

A policy result is produced here. The browser does not decide `ALLOW`, `DENY`, or `REVIEW`.
