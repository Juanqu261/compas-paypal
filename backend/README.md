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
src/integrations/    Open Payments adapter (real); other adapters throw
src/audit/           Future audit writer
src/api/             HTTP boundary. GET /health, GET /open-payments/finish
scripts/op-smoke.ts  End-to-end Open Payments run on the test network
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

`npm run dev` and `npm start` listen on port 4000. They load `backend/.env` when it exists. `GET /health` returns `{ "status": "ok", "openPayments": "configured" | "not_configured" }`.

## Open Payments

The adapter in `src/integrations/open-payments/` wraps `@interledger/open-payments` 7.4.0. Port, flow and handoff: `docs/plans/open-payments-integration.md`.

To run a real payment on the Interledger test network:

1. Create three test wallet addresses: one for COMPAS as a client, Pedro's USD wallet (funded), and the merchant's wallet.
2. On the COMPAS wallet, generate a developer key. Save the private key as `backend/private.key`. It is gitignored.
3. Copy `.env.example` to `.env` and fill in `CLIENT_WALLET_ADDRESS`, `KEY_ID`, `PRIVATE_KEY_PATH=./private.key`, `DEMO_PAYER_WALLET_ADDRESS` and `DEMO_MERCHANT_WALLET_ADDRESS`.
4. `npm run op:smoke -- --budget 4000 --amount 1000`. `--budget` is in the payer's minor units and `--amount` is in the merchant's. Open the printed URL, accept as Pedro, then confirm at the prompt.

The smoke script checks the Open Payments leg only. It runs no COMPAS policy. Grants live in memory, so a backend restart means Pedro consents again.
