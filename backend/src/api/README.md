# API

Routes served by `server.ts`. Contracts are in `contracts/`. The browser never decides `ALLOW`, `DENY` or `REVIEW`.

| Route | File | Contract |
| --- | --- | --- |
| `GET /health` | `server.ts` | |
| `GET /paypal/orders/return`, `/cancel` | `paypal-return.ts` | `purchases/` |
| `POST /merchant-category-claims`, `GET /merchants/categories` | `merchant-categories.ts` | `merchant-categories/` |
| `POST /demo/sessions`, `GET /me`, `/mandates…` | `demo-identity.ts`, `mandates.ts` | `mandates/` |
| `GET /demo/merchants`, `POST /purchases`, `/purchases/preview` | `purchases.ts` | `purchases/` |
| `GET /demo/merchants/:id/payments` | `merchant-payments.ts` | `purchases/` |
| `POST /errands/drafts`, `POST /errands`, `GET /errands`, `POST /errands/:id/cancel` | `errands.ts` | `errands/` |
| `/.well-known/oauth-*`, `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke` | `oauth.ts` | `agents/` |
| `GET /agents/requests/:id`, `POST …/approve`, `POST …/deny`, `GET /agents/grants`, `POST /agents/grants/:id/revoke` | `oauth.ts` | `agents/` |
| `POST /mcp` (the four agent tools) | `mcp.ts` | `agents/` |
| `GET /paypal/identity/start`, `/return`, `POST /demo/merchant-sessions`, `POST /merchant-onboarding/certificate` | `merchant-onboarding.ts` | `merchant-onboarding/` |
| `POST /analyst/jobs`, `GET /analyst/findings`, `POST /analyst/findings/:id/response`, `POST /operator/findings/:id/withdraw` | `merchant-onboarding.ts` | `merchant-onboarding/` |

Not wired:

- `POST /spending-records/:id/confirmation` (`spending-confirmations.ts`). It should take the payer from the session.
- PayPal webhooks, for refunds and disputes.

The frontend reaches this process through the `/compas-api/*` rewrite.
