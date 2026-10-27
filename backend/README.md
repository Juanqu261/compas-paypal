# Backend

The authoritative COMPAS runtime.

It owns the domain model, the policy gate, payment authorization orchestration, the PayPal gateway, the merchant registry port, the purpose classifier port, and audit events. Storage is Supabase Postgres with `DATABASE_URL`, and in memory without it.

The backend must never create a PayPal order unless the policy engine has returned `ALLOW`, and never capture one the payer did not approve at PayPal.

`DENY` and `REVIEW` do not call `createOrder`. That rule is tested in `backend/tests/policy/payment-gate.test.ts` and, on the real adapter, in `backend/tests/integration/denied-payment-never-reaches-paypal.test.ts`. Only `PayPalOrderSettlement` calls `captureOrder` (`backend/tests/application/settle-paypal-order.test.ts`).

## Layout

```text
src/domain/            Mandate, parties, money, decisions, spending records, audit events
src/application/       Purchase flow on top of PayPal, order gate, settlement, spending report, category ingestion
src/policy/            Evaluation order, budget and purpose checks, merchant category step, payment gate
src/ports/             PayPal gateway, repositories, classifier, merchant category service
src/integrations/      PayPal REST adapter (paypal/), merchant category service, Postgres adapters (postgres/), in-memory fallbacks
src/audit/             Future audit writer
src/api/               HTTP boundary: health, PayPal return and cancel, merchant category routes, demo sessions, mandates, purchases
scripts/paypal-smoke.ts  One real PayPal sandbox payment: order, approval, capture
scripts/compas-smoke.ts  COMPAS on top of real PayPal sandbox orders
scripts/fetch-rues-registry.ts, load-rues-registry.ts  Cámara de Comercio extract: fetch it, load it into Postgres
```

Future resources are listed in `src/api/README.md`. They are not implemented.

## Mandates

`MandateService` (`src/application/mandates.ts`) creates, authorizes, reads and revokes mandates for the ARQ and Nequi screens. Access depends on the actor's relation in each mandate. The actor comes from a DEMO session token (`src/api/demo-identity.ts`): COMPAS has no user authentication yet. Authorizing moves a `DRAFT` to `ACTIVE` at once: nothing is asked of PayPal, because Pedro approves each purchase's order at PayPal instead ([ADR 0008](../docs/adr/0008-paypal-rail-per-order-approval.md)). The confirmation is read from the mandate's audit events. Status changes never rewrite the remaining capacity. Reading a mandate's activity first reconciles its open PayPal orders. A budget must be in a currency PayPal takes in an order (`ASSET_NOT_SUPPORTED` otherwise, for example COP). Mandates are in Postgres with `DATABASE_URL` (`persistence: "POSTGRES"`) and in memory without it (`"IN_MEMORY_DEMO"`). Contract: `contracts/mandates/README.md`.

## Environment

Copy `.env.example` to `.env`. The PayPal names are `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, from the sandbox app in the PayPal developer dashboard. Do not commit them.

## Local development

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm start
```

`npm run dev` and `npm start` listen on port 4000. They load `backend/.env` when it exists. `GET /health` returns `{ "status": "ok", "paypal": "sandbox" | "not_configured", "storage": "postgres" | "memory", "identity": "demo" | "disabled", "persistence": "POSTGRES" | "IN_MEMORY_DEMO", "payerApproval": "PINNED" | "ANY_ACCOUNT", "purchases": "enabled" | "disabled_for_demo" | "not_configured" }`.

## Storage

- The server stores the trust log and the COMPAS mandates with their spending records and audit events there. `npm run compas:smoke` also stores the mandate, the spending log and the observation log, and reserves the mandate's capacity there. Its two category trust logs stay in memory, because one PayPal account plays both shops.
- `MERCHANT_SUBJECT_HMAC_KEY` is then required, and must never change once data is stored.
- The demo seeds are idempotent: a second start keeps the first start's entries, and completes a seed that stopped halfway. In Postgres, the demo tienda's history also writes the 12 food mandates and spending records behind it (`demo-food-mandate-N`, `demo-tienda-purchase-N`). The server seeds it at startup.
- `DATABASE_ADMIN_URL=… npm run registry:load` loads the 1,900 Cámara de Comercio shops into `compas.registry_*`.
- `TEST_DATABASE_URL` (a member of `compas_backend`, both migrations applied) runs the Postgres adapter tests in `npm test`. Without it they are skipped.

## PayPal

The adapter in `src/integrations/paypal/` calls the PayPal REST API over `fetch`, on the sandbox only (`https://api-m.sandbox.paypal.com`). No PayPal SDK. Port, flow and mapping: `docs/04-paypal-mapping.md`.

- **Order.** On `ALLOW`, one Orders v2 order for exactly the charge, `payee.merchant_id` = the merchant, `custom_id` = the decision id, `invoice_id` = the intent id, `reference_id` = the mandate id, lines named "Item 1", "Item 2". `PayPal-Request-Id` = the decision id, so a retry returns the same order.
- **Approval.** PayPal answers `PAYER_ACTION_REQUIRED` with a `payer-action` link. Only the payer's activity view carries it. Pedro approves at PayPal, logged in to his own account.
- **Capture.** PayPal sends the browser to `GET /paypal/orders/return`. `PayPalOrderSettlement` reads the order and captures it only if it is `APPROVED`, unchanged, under a mandate still `ACTIVE` and in its window, and, with `DEMO_PAYER_PAYPAL_ID` set, approved by that account. `GET /paypal/orders/cancel` closes it. Either way the browser goes to `PAYPAL_FRONTEND_RETURN_URL`.
- **No standing permission.** The sandbox app has no Vault permission (`403 NOT_AUTHORIZED` on `/v3/vault/setup-tokens`, checked on 2026-10-26), so COMPAS never charges a payer who is absent. See ADR 0008.

To run a real payment on the sandbox:

1. In the PayPal developer dashboard, use the REST app's sandbox credentials, and two sandbox accounts besides the app's own business account: a **business** account for the pharmacy and a **personal** account for Pedro.
2. Copy `.env.example` to `.env`. Fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `DEMO_MERCHANT_PAYPAL_ID` (the pharmacy's merchant id, under its account details). Optionally `DEMO_PAYER_PAYPAL_ID` (Pedro's payer id).
3. `npm run paypal:smoke -- --amount 1120`. Open the printed URL, log in as the personal account and approve. PayPal sends you to a one-off listener on `PAYPAL_SMOKE_PORT` (4123), and the script captures after you confirm.

The smoke script checks the PayPal leg only. It runs no COMPAS policy.

## Merchant categories

The merchant category service tells the policy engine what a merchant is and how well that is backed. It resolves a merchant's PayPal merchant id to COMPAS categories and trust levels. Design: `docs/adr/0005-merchant-category-attestations.md`. Payloads: `contracts/merchant-categories/README.md`.

- Evidence enters only through `ingestCategoryClaim` (`src/application/ingest-category-claim.ts`). Push sources sign the raw body with Ed25519.
- The trust log is in memory, or in `compas.trust_log_entries` with `DATABASE_URL`.
- At startup the backend generates a throwaway Ed25519 key, registers the two simulated Nequi Negocios sources from `data/seeds/category-sources/demo-sources.json` and seeds the demo merchants. Droguería Central (`DEMPHARMACY22`) resolves to `MEDICATION` at `PROVIDER_VERIFIED`. The liquor store (`DEMLAGERBAR22`) resolves to `ALCOHOL`/`TOBACCO`. Those demo ids name no PayPal account. When `DEMO_MERCHANT_PAYPAL_ID` is set, that sandbox account gets Droguería Central's evidence too. `MERCHANT_CATEGORY_DEMO_SEED=false` turns the seed off.
- PayPal signs no category attestations. On a real PayPal deployment `PROVIDER_VERIFIED` is empty, and `HIGH` needs a registry binding (ADR 0008).
- `MERCHANT_SUBJECT_HMAC_KEY` (32+ characters) keys the HMAC that replaces NITs. Without it and without a database, a random key is used for the process.
- The Cámara de Comercio registry has two lookups for `RegistryDbFeed`: `JsonBusinessRegistryLookup` over the seed file and `PostgresBusinessRegistryLookup` over `compas.registry_establishments`. Nothing calls `refreshRegistryEvidence` yet. The health-registry feed throws `NotImplementedError`.

### Trust matrix

Each category the merchant declared gets a confidence (`CONTESTED`, `LOW`, `MEDIUM`, `HIGH`) from corroboration × payment history, through `data/seeds/trust-matrix/trust-matrix.json`. The loader refuses a matrix that lets history alone reach `HIGH`. A mandate sets `purposePolicy.merchantConfidence.minimum`. Captured purchases and payer verdicts go to the observation log. The demo seeds Tienda Doña Gloria (`DEMTENDAGLRA2`): self-declared `FOOD` and 12 confirming payers, which gives `MEDIUM`. Design: `docs/adr/0007-merchant-confidence-matrix.md`.

```bash
curl "http://localhost:4000/merchants/categories?paypalMerchantId=DEMPHARMACY22"
```

## Purchases and the payer's tick

`purchaseUnderMandate` (`src/application/purchase-under-mandate.ts`) is COMPAS on top of PayPal for one purchase:

1. Mandate rules.
2. Merchant categories, history and the trust matrix, then the purpose check.
3. Budget against the charge, and the cap for a merchant below `HIGH` confidence.
4. One decision. `ALLOW` reserves the charge, and only `ALLOW` reaches `createPayPalOrderIfAllowed`.
5. The order waits for the payer. `PayPalOrderSettlement` (`src/application/settle-paypal-order.ts`) captures it after the payer approved, and only then does the purchase join the merchant's history.

`purposePolicy.enforcement` is the payer's tick. `ENFORCED` blocks a failed purpose check. `MONITORED` orders it and flags `PAYER_MONITORED_EXCEPTION`. Mandate rules and the budget apply in both modes, and the payer approves every order. Every attempt goes to the spending log, and `buildSpendingReport` builds the payer's view. See `docs/04-paypal-mapping.md` and `docs/adr/0006-monitored-budgets.md`.

## COMPAS smoke test

`npm run compas:smoke` runs the category layer and the purchase policy on top of real PayPal sandbox orders. Each allowed purchase prints a PayPal approval URL: approve it as the sandbox personal account, and the script settles it as the return route does. The terminal shows what each layer did:

1. The category layer resolves the merchant.
2. The purpose check runs.
3. The decision is made.
4. If allowed, the PayPal order is created and you approve it.
5. The settlement checks the mandate again and captures.
6. The run ends with the payer's spending report.

```bash
npm run compas:smoke -- --mode enforced     # pharmacy: ALLOW, approved, captured. liquor: DENY, no PayPal call
npm run compas:smoke -- --mode monitored    # pharmacy: ALLOW, captured. liquor: ALLOW + PAYER_MONITORED_EXCEPTION, captured
```

Options: `--scenario all|pharmacy|liquor`, `--budget` (minor units, default 4000), `--amount` (minor units, default 1120), `--yes` (skip the prompt before each order).

It needs only the `.env` that `paypal:smoke` uses. `DEMO_MERCHANT_PAYPAL_ID` plays both shops. Each role gets its own trust log: CIIU 4773 (pharmacy) in one and CIIU 4724 (liquor store) in the other. One log holding both would be contradictory evidence, which is `REVIEW` for every purchase. Each scenario prints PASS or FAIL against the expected result. Merchant evidence is the simulated Nequi Negocios seed (`demo/test data`).
