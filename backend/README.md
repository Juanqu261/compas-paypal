# Backend

The authoritative COMPAS runtime.

It owns the domain model, the policy gate, payment authorization orchestration, the Open Payments gateway, the merchant registry port, the purpose classifier port, and audit events. Persistence is not selected yet. Demo scenario state for the pitch still renders from `data/fixtures/demo/` in the frontend; authoritative session state will live here when the API exists.

The backend must never initiate an outgoing payment unless the policy engine has returned ALLOW.

`DENY` and `REVIEW` do not call `createOutgoingPayment`. That rule is tested in `backend/tests/policy/outgoing-payment-gate.test.ts`.

## Layout

```text
src/domain/          Mandate, parties, money, decisions, audit events
src/application/     Allow-gate before an outgoing payment
src/policy/          Evaluation order
src/ports/           Gateway, repositories, classifier
src/integrations/    Throwing adapters
src/audit/           Future audit writer
src/api/             HTTP boundary. GET /health only
```

Future resources are listed in `src/api/README.md`. They are not implemented.

## Environment

Copy `.env.example` when configuring Open Payments. The names are `CLIENT_WALLET_ADDRESS`, `KEY_ID`, and `PRIVATE_KEY_PATH`. Leave them empty. Do not commit a private key.

## Local development

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm start
```

`npm run dev` and `npm start` listen on port 4000. `GET /health` returns `{ "status": "ok" }`.
