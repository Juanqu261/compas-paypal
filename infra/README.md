# Infrastructure

The public demo runs on Render as two web services, described in [`../render.yaml`](../render.yaml) (a Render Blueprint). Supabase, Elastic Cloud, the Claude API and the PayPal sandbox are already hosted. Nothing here is needed to run the frontend or the backend locally.

Why the demo can be public, and what limits it: [ADR 0012](../docs/adr/0012-public-demo-workspaces.md).

## Before the first deploy

1. **Optional: Log in with PayPal.** Only the backend's merchant onboarding uses it (`/paypal/identity/start`), and no demo screen starts it. To use it, register the backend's `PAYPAL_IDENTITY_RETURN_URI` as a return URL under Log in with PayPal in the sandbox REST app you deploy (developer.paypal.com → Apps & Credentials). It is set per app, not per test account.

## Deploy

1. In Render: **New → Blueprint**, pick this repository. Render reads `render.yaml` and creates `compas-backend` and `compas-frontend`.
2. Render asks for every `sync: false` value while it creates the Blueprint. The URLs below depend on the services' addresses, which exist only after that. Enter the secrets now, and for the URLs use the expected addresses `https://compas-backend.onrender.com` and `https://compas-frontend.onrender.com`. Once both services exist, compare those with the addresses shown in each dashboard; Render adds a suffix when a name is taken. Fix any that differ under the service's Environment tab.

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
4. **The backend sets `NODE_ENV=demo`** (in `render.yaml`). Render sets `NODE_ENV=production` at runtime when a service doesn't set it, without showing it in the dashboard, and production turns off demo sessions, demo purchases and analyst jobs: `POST /demo/workspaces` answers 503 and `/health` says `"identity":"disabled"`. Any value but `production` keeps them on.

## After the deploy

- `GET https://<backend>/health` should show `"identity":"demo"`, `"purchases":"enabled"`, `"paypal":"sandbox"`, `"storage":"postgres"`.
- The backend log should say `Presenter accounts: only with the presenter link` and `Errand drafts: off`.
- The presenter link is `https://<frontend>/demo?presenter=<COMPAS_PRESENTER_KEY>`, the value Render generated (backend → Environment).
- Walk the demo once with your own sandbox accounts, and once with the presenter link.

## Plans and cost

Both services are on Render's Starter plan in `render.yaml`. On the free plan an idle service sleeps, the first visit waits for it to wake, and every restart empties all visitors' demos. The frontend could run on the free plan if a slow first visit is acceptable; keep the backend on Starter.

## Troubleshooting public URLs

Checked 2026-11-10 against the names in this doc:

| URL | Observed | Meaning |
| --- | --- | --- |
| `GET https://compas-backend.onrender.com/health` | HTTP **404** Nest-style body `{"message":"Cannot GET /health","error":"Not Found","statusCode":404}`; response also sets Helmet CSP headers and `access-control-allow-origin: https://compas-frontend-eta.vercel.app` | DNS resolves to Render, but the process is **not** this repo's COMPAS server (COMPAS returns `"status":"ok"` / `"identity":"demo"` and has no Helmet). The hostname is serving another Nest app tied to a Vercel frontend. |
| `GET https://compas-frontend.onrender.com/` and `/demo` | HTTP **503** with header `x-render-routing: suspend-by-user` | The frontend Render service is **suspended in the dashboard** (not a cold start). Resume it there, or point the public demo at a live host. |

Dashboard checks (names only — no secret values):

1. Service **compas-backend**: status, last successful deploy, deployed commit SHA, Build & Deploy logs, Runtime logs.
2. Confirm Blueprint/`render.yaml` fields: `rootDir: backend`, `buildCommand: npm ci`, `startCommand: npm start`, `healthCheckPath: /health`.
3. Env: `NODE_ENV` must be `demo` (not `production`), plus every `sync: false` key listed above.
4. Service **compas-frontend**: same deploy/commit/log checks; `COMPAS_BACKEND_URL` must be the live backend HTTPS URL (needed at **build** time).
5. After a correct redeploy, `/health` must include `"status":"ok"` and `"identity":"demo"`. If you still see `Cannot GET /health`, the hostname is still not this repo's backend.
