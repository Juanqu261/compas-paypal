# Infrastructure

The public demo runs on Render as two web services, described in [`../render.yaml`](../render.yaml) (a Render Blueprint). Supabase, Elastic Cloud, the Claude API and the PayPal sandbox are already hosted. Nothing here is needed to run the frontend or the backend locally.

Why the demo can be public, and what limits it: [ADR 0012](../docs/adr/0012-public-demo-workspaces.md).

## Before the first deploy

1. **Optional: Log in with PayPal.** Only the backend's merchant onboarding uses it (`/paypal/identity/start`), and no demo screen starts it. To use it, register the backend's `PAYPAL_IDENTITY_RETURN_URI` as a return URL under Log in with PayPal in the sandbox REST app you deploy (developer.paypal.com → Apps & Credentials). It is set per app, not per test account.

## Deploy

1. In Render: **New → Blueprint**, pick this repository. Render reads `render.yaml` and creates `compas-backend` and `compas-frontend`.
2. Enter the `sync: false` values. Each service gets an address like `https://compas-backend.onrender.com`, shown in its dashboard; use the real ones.

   | Service | Variable | Value |
   | --- | --- | --- |
   | backend | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The sandbox app's credentials |
   | backend | `DATABASE_URL`, `MERCHANT_SUBJECT_HMAC_KEY` | As in your local `backend/.env`. The HMAC key must never change |
   | backend | `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`, `ANTHROPIC_API_KEY` | Elastic Cloud and the deploy's own Claude key |
   | backend | `DEMO_MERCHANT_PAYPAL_ID`, `DEMO_MERCHANT_PAYPAL_EMAIL`, `DEMO_LIQUOR_PAYPAL_ID`, `DEMO_PAYER_PAYPAL_ID` | As locally: the presenter's sandbox accounts |
   | backend | `COMPAS_PUBLIC_URL` | `https://<backend>` |
   | backend | `PAYPAL_RETURN_URI` / `PAYPAL_CANCEL_URI` | `https://<backend>/paypal/orders/return` and `/cancel` |
   | backend | `PAYPAL_FRONTEND_RETURN_URL` | `https://<frontend>/demo` |
   | backend | `PAYPAL_IDENTITY_RETURN_URI` | `https://<backend>/paypal/identity/return` |
   | backend | `PAYPAL_IDENTITY_FRONTEND_RETURN_URL` | `https://<frontend>/paypal-business` |
   | backend | `COMPAS_AGENT_CONSENT_URL` | `https://<frontend>/agents/authorize` |
   | frontend | `COMPAS_BACKEND_URL` | `https://<backend>` |
   | frontend | `NEXT_PUBLIC_DEMO_KIBANA_URL`, `NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF` | Optional: Act 1's evidence links |

3. The frontend needs `COMPAS_BACKEND_URL` and the `NEXT_PUBLIC_*` values at build time. If you set them after the first build, redeploy the frontend.
4. **Never set `NODE_ENV=production` on the backend**: it turns off demo sessions and demo purchases.

## After the deploy

- `GET https://<backend>/health` should show `"identity":"demo"`, `"purchases":"enabled"`, `"paypal":"sandbox"`, `"storage":"postgres"`.
- The backend log should say `Presenter accounts: only with the presenter link` and `Errand drafts: off`.
- The presenter link is `https://<frontend>/demo?presenter=<COMPAS_PRESENTER_KEY>`, the value Render generated (backend → Environment).
- Walk the demo once with your own sandbox accounts, and once with the presenter link.

## Plans and cost

Both services are on Render's Starter plan in `render.yaml`. On the free plan an idle service sleeps, the first visit waits for it to wake, and every restart empties all visitors' demos. The frontend could run on the free plan if a slow first visit is acceptable; keep the backend on Starter.
