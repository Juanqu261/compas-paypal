# API

Implemented routes:

- `GET /health`
- `GET /paypal/orders/return` and `GET /paypal/orders/cancel` (`paypal-return.ts`): PayPal sends the payer's browser here after they approve or cancel an order, with the order id as `token`. The settlement reads the order from PayPal, checks the mandate and the order again, captures or closes it, then redirects to `PAYPAL_FRONTEND_RETURN_URL` with `paypalOrder=completed|pending|waiting|cancelled|failed|unconfirmed` and `mandateId`. See `contracts/purchases/README.md`.
- `POST /merchant-category-claims`: signed category evidence from push sources such as a wallet node. See `contracts/merchant-categories/README.md`.
- `GET /merchants/categories?paypalMerchantId=…`: a merchant's resolved COMPAS categories, trust levels and declared categories with their corroboration. A view, not a policy decision.
- `POST /demo/sessions`: a DEMO identity for Pedro, Andrea or Gladys (`demo-identity.ts`). Off with `NODE_ENV=production` or `COMPAS_DEMO_IDENTITY=disabled`.
- `GET /me`, `GET /demo/participants`, `GET /mandates?role=payer|delegate`, `GET /mandates/:id`, `POST /mandates`, `POST /mandates/:id/authorize`, `POST /mandates/:id/revoke`, `GET /mandates/:id/spending` (`mandates.ts`). The actor comes from the session token. Authorizing activates a mandate at once: nothing is asked of PayPal until a purchase. Reading the spending reconciles the mandate's open PayPal orders first. Mandates live in Postgres with `DATABASE_URL`, in memory without it. See `contracts/mandates/README.md`.

- `GET /demo/merchants`: demo/test data. The merchants a purchase may name, with their resolved categories, and whether any evidence source is registered. No PayPal account id. See `contracts/merchant-categories/README.md`.
- `POST /purchases/preview`, `POST /purchases` (`purchases.ts`): the delegate's purchase under a mandate. The preview runs every check before PayPal and writes nothing. A purchase runs `purchaseUnderMandate`, creates a PayPal order on `ALLOW`, and is idempotent by key. It runs only with `COMPAS_DEMO_PURCHASES=enabled` and `DEMO_MERCHANT_PAYPAL_ID` set (`readDemoPurchasesMode`), otherwise `403 PURCHASES_DISABLED_FOR_DEMO`. See `contracts/purchases/README.md`.

Handled but not wired into `server.ts`:

- `POST /spending-records/:id/confirmation`: the payer's `MATCH` or `MISMATCH` on a paid purchase (`spending-confirmations.ts`). Not wired yet: it takes the payer id from the body, and it should take it from the session first. See `contracts/merchant-history/README.md`.

The frontend calls this process through the `/compas-api/*` rewrite. It must not import `backend/src`.

Likely future resources, not implemented:

- `POST /purchase-intents`: a charge the merchant creates, stored in `compas.purchase_intents`. It needs merchant authentication first.
- PayPal webhooks (`PAYMENT.CAPTURE.COMPLETED`, `…DENIED`, `…REFUNDED`, `CUSTOMER.DISPUTE.CREATED`): a refund or dispute is not handled yet.

A policy result is produced here. The browser does not decide `ALLOW`, `DENY`, or `REVIEW`.
