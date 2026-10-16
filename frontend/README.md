# Frontend

One Next.js application for the hackathon demo.

| Route | Surface |
| --- | --- |
| `/` | Story, purpose dial and links |
| `/demo` | ARQ, Nequi, and Nequi Negocios together |
| `/arq` | Pedro, payer |
| `/nequi` | Andrea, delegate |
| `/nequi-negocios` | Pharmacy, merchant |

`ArqExperience`, `NequiExperience`, and `NequiBusinessExperience` are the only implementations of those surfaces. `/demo` renders them inside `PhoneFrame` under one shared session.

## Responsibility

This app draws the wallet-like experiences, handles local demo interaction, and will later call the backend. It reads labeled fixtures from `data/fixtures/demo/` so the phones can show the story before that API exists.

It does not decide policy, hold Open Payments keys, execute payments, store the audit log, or treat a browser result as authoritative. `ALLOW`, `DENY`, and `REVIEW` belong to the backend.

ARQ, Nequi, and Nequi Negocios are simulated embedding surfaces. They are not production integrations.

## Local development

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

There is no frontend test script. Domain and policy tests run from `backend/`.
