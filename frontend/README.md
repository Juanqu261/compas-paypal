# Frontend

One Next.js application for the hackathon demo.

| Route | Surface |
| --- | --- |
| `/` | Story, purpose dial and links |
| `/demo` | The PayPal app, Nequi, and Nequi Negocios together |
| `/paypal` | Pedro, payer |
| `/nequi` | Andrea, delegate |
| `/nequi-negocios` | Pharmacy, merchant |

`PayPalExperience`, `NequiExperience`, and `NequiBusinessExperience` are the only implementations of those surfaces. `/demo` renders them inside `PhoneFrame` under one shared session.

## Responsibility

This app draws the wallet-like experiences and handles local demo interaction. It reads labeled fixtures from `data/fixtures/demo/` for the story on `/` and `/demo`.

The COMPAS screens inside the PayPal app (Pedro's budgets) and Nequi (Andrea's authorizations) call the backend. Their code is in `src/features/compas/`: a typed client and hooks in `api/`, Spanish labels and input helpers in `lib/`, shared components in `ui/`, and the payer and delegate modules. The browser calls `/compas-api/*`, which `next.config.ts` proxies to `COMPAS_BACKEND_URL` (default `http://localhost:4000`). Contract: `contracts/mandates/README.md`.

It does not decide policy, hold PayPal credentials, create or capture payments, store the audit log, or treat a browser result as authoritative. The payer's "Aprobar en PayPal" button opens only an https page on `paypal.com`, in a new tab. `ALLOW`, `DENY`, and `REVIEW` belong to the backend.

The PayPal app, Nequi, and Nequi Negocios are simulated embedding surfaces. They are not production integrations. The PayPal app home follows the layout of PayPal's current app store screenshots (heavy type, a balance card, black pill buttons, a floating bottom bar) and uses no PayPal logo. Only its screens are simulated: "Aprobar en PayPal" opens the real PayPal sandbox.

## Local development

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs `tests/**/*.test.ts` with Node's test runner: the COMPAS labels, amount input, dates and wizard checks. Domain and policy tests run from `backend/`.

For the COMPAS screens, run the backend too (`cd backend && npm run dev`). Open the app at `http://localhost:3000`, not `127.0.0.1`: `next dev` blocks its dev resources for other origins, and the page then never becomes interactive.
