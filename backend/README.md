# Backend

The authoritative COMPAS runtime.

It owns the domain model, the policy gate, payment authorization orchestration, the Open Payments gateway, the merchant registry port, the purpose classifier port, and audit events. Persistence is not selected yet. Demo scenario state for the pitch still renders from `data/fixtures/demo/` in the frontend; authoritative session state will live here when the API exists.

The backend must never initiate an outgoing payment unless the policy engine has returned ALLOW.

`DENY` and `REVIEW` do not call `createOutgoingPayment`. That rule is tested in `backend/tests/policy/outgoing-payment-gate.test.ts`.

## Layout

```text
src/domain/          Mandate, parties, money, decisions, audit events
src/application/     Purchase flow on top of Open Payments, allow-gate, spending report, category ingestion
src/policy/          Evaluation order, merchant category step
src/ports/           Gateway, repositories, classifier, merchant category service
src/integrations/    Open Payments adapter (real), merchant category service (in memory); other adapters throw
src/audit/           Future audit writer
src/api/             HTTP boundary. GET /health, GET /open-payments/finish, merchant category routes
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

## Merchant categories

The merchant category service tells the policy engine what a merchant is and how well that is backed. It resolves a merchant's Open Payments wallet address to COMPAS categories and trust levels. Design: `docs/plans/merchant-category-service.md` and `docs/adr/0005-merchant-category-attestations.md`. Payloads: `contracts/merchant-categories/README.md`.

- Evidence enters only through `ingestCategoryClaim` (`src/application/ingest-category-claim.ts`). Push sources sign the raw body with Ed25519.
- The trust log is in memory. A restart loses it.
- At startup the backend generates a throwaway Ed25519 key, registers the two simulated Nequi Negocios sources from `data/seeds/category-sources/demo-sources.json` and seeds the demo merchants. Droguería Central resolves to `MEDICATION` at `PROVIDER_VERIFIED`. The liquor store resolves to `ALCOHOL`/`TOBACCO`. When `DEMO_MERCHANT_WALLET_ADDRESS` is set, that test-network wallet gets Droguería Central's evidence too. `MERCHANT_CATEGORY_DEMO_SEED=false` turns the seed off.
- `MERCHANT_SUBJECT_HMAC_KEY` (32+ characters) keys the HMAC that replaces NITs. Without it a random key is used for the process.
- The RUES and health-registry feeds throw `NotImplementedError`.

```bash
curl "http://localhost:4000/merchants/categories?walletAddress=https://wallet.example/demo-drogueria-central"
```

## Purchases and the payer's tick

`purchaseUnderMandate` (`src/application/purchase-under-mandate.ts`) is COMPAS on top of Open Payments for one purchase:

1. Mandate rules.
2. Merchant categories and the purpose check.
3. Incoming payment and quote.
4. Budget against the quoted debit.
5. One decision. Only `ALLOW` reaches `createOutgoingPaymentIfAllowed`.

`purposePolicy.enforcement` is the payer's tick. `ENFORCED` blocks a failed purpose check. `MONITORED` pays it and flags `PAYER_MONITORED_EXCEPTION`. Mandate rules and the grant cap apply in both modes. Every attempt goes to the spending log, and `buildSpendingReport` builds the payer's view. No HTTP route calls it yet, because mandates have no repository. See `docs/04-open-payments-mapping.md` and `docs/adr/0006-monitored-budgets.md`.

## COMPAS smoke test

`npm run compas:smoke` runs the category layer and the purchase policy on top of real Open Payments on the test network. You consent once as Pedro. Then each purchase goes through `purchaseUnderMandate`, and the terminal shows what each layer did:

1. The category layer resolves the merchant.
2. The purpose check runs.
3. The incoming payment and quote are created.
4. The decision is made.
5. If allowed, the outgoing payment is created and polled until it completes.
6. The run ends with the payer's spending report.

```bash
npm run compas:smoke -- --mode enforced     # pharmacy: ALLOW, paid. liquor: DENY, no Open Payments call
npm run compas:smoke -- --mode monitored    # pharmacy: ALLOW, paid. liquor: ALLOW + PAYER_MONITORED_EXCEPTION, paid
```

Options: `--scenario all|pharmacy|liquor`, `--budget` (payer minor units, default 4000), `--amount` (merchant minor units, default 1000), `--yes` (skip the prompt before each outgoing payment), `--keep-grant`.

It needs only the `.env` that `op:smoke` uses. `DEMO_MERCHANT_WALLET_ADDRESS` plays both shops. Each role gets its own trust log: CIIU 4773 (pharmacy) in one and CIIU 4724 (liquor store) in the other. One log holding both would be contradictory evidence, which is `REVIEW` for every purchase. Each scenario prints PASS or FAIL against the expected result. Merchant evidence is the simulated Nequi Negocios seed (`demo/test data`).

