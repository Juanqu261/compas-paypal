# COMPAS

COMPAS is an embedded authorization and policy layer for purpose-restricted payments. Money stays where it is. COMPAS moves permission, not money.

This is the only agent context in the repository. Detail lives in `docs/`. If this file and `docs/` disagree, follow `docs/` for code and flag the conflict.

## This fork

This fork is COMPAS for PayPal. The PayPal sandbox replaces Open Payments entirely: the rail, the test accounts and the smoke tests. There is no Open Payments code left. [ADR 0008](docs/adr/0008-paypal-rail-per-order-approval.md) records the rail decision.

A delegate builds a cart at a merchant that accepts PayPal. COMPAS checks the cart against the mandate. Only on `ALLOW` does COMPAS create a PayPal order for that exact cart, payable to the merchant. The payer approves it at PayPal, logged in to their own account, and COMPAS captures it after checking the mandate again. The money goes from the payer's PayPal to the merchant's.

The cap decision is settled: **per-order approval**. The sandbox app has no Vault permission, so there is no payer-absent charge. The budget and the cap below `HIGH` are COMPAS rules, checked before PayPal and reserved atomically, and the payer approves every order. A payer-absent charge for all-green purchases waits until PayPal enables Vault for the app. Ask before building it.

Not built, and only when asked: the AI analyst behind the trust matrix, the Cámara binding through Log in with PayPal, INVIMA CUM mapping, errands, and the Compas MCP server for agents.

## Product

A payer creates a mandate that gives a delegate limited capacity to cause a future payment for a stated purpose. The delegate does not receive the funds. `remainingAuthorizedAmount` is authorization capacity, not a PayPal balance and not custody.

COMPAS is not a wallet, a bank, a payment rail, a custody account, a token, a blockchain project, or a consumer dashboard.

Demo story: Pedro is the payer. He pays with his PayPal, in USD, and wants up to USD 40 available for medication for his grandmother Gladys. Gladys is the beneficiary and does not manage a wallet. Andrea is the delegate. She lives with Gladys and must not receive the USD 40 as unrestricted money. A pharmacy purchase for `MEDICATION` is the allowed story: it becomes a PayPal order that Pedro approves. An alcohol purchase against the same mandate is rejected before any PayPal order exists.

The PayPal app (Pedro), Nequi (Andrea) and Nequi Negocios (the pharmacy) are simulated embedding surfaces, not production integrations. Only the PayPal app's screens are simulated: Pedro approves each order at the real PayPal sandbox. The PayPal accounts are sandbox accounts.

The same mandate can later describe a business, NGO, or government allocation. The demo implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail. It does not solve corruption.

Terms:

- A purpose category such as `MEDICATION` is a COMPAS concept, never a PayPal concept.
- A merchant is named by its PayPal merchant id (`payee.merchant_id`), never by a URL the browser sends.
- A `PROVIDER_VERIFIED` claim is a wallet's signed attestation about its own merchant. PayPal signs none: in the demo, the simulated Nequi Negocios source fills that tier.
- An `EXTERNAL_VERIFIED` claim comes from a registry check, such as RUES at the Cámara de Comercio.

## Invariants

- COMPAS is non-custodial. It moves permission, not money. PayPal pays the merchant directly.
- Permission is delegated. Money is not transferred to the delegate.
- Policy must return `ALLOW` before any PayPal order. `DENY` and `REVIEW` never create one.
- No money moves until the payer approves the order at PayPal, and COMPAS captures only after checking the mandate and the order again.
- A payer may choose a `MONITORED` budget. Purpose checks are then recorded, not enforced. Mandate rules (status, validity, delegate, budget) always apply, and the payer still approves every order.
- AI never authorizes payments.
- Purpose categories belong to COMPAS.
- PayPal must never be faked. An unimplemented or unconfigured gateway throws.
- COMPAS talks to the PayPal sandbox only.
- The PayPal app, Nequi, and Nequi Negocios surfaces are simulations. The order approval is not: it happens at the PayPal sandbox.
- The frontend and the backend do not import each other's source. Shared contracts belong in `contracts/`.

## Design decisions (do not re-litigate)

1. **The delegate pulls at the point of sale.** There is no push to the delegate and no escrow. COMPAS holds no funds and no money ledger.
2. **Deterministic rules decide; AI only classifies.** Low confidence fails closed (`REVIEW`/`DENY`). AI can also *flag* a merchant whose behavior contradicts its claims. It never authorizes.
3. **Purpose is checked per merchant plus line items.** Rich purchase detail stays in the COMPAS audit trail. A PayPal order carries **only** `compasMandateId` (`reference_id`), `compasDecisionId` (`custom_id`) and `externalReference` (`invoice_id`), with lines named "Item 1", "Item 2".
4. **Every spend needs the delegate's action.** Otherwise any eligible merchant could drain a budget. On PayPal, every spend also needs the payer's approval.
5. **Federated trust, one central registry.** Each wallet is the authority on its own merchants and signs attestations (Ed25519). The registry is an append-only trust log of claims, checks, AI flags and disputes. There is no blockchain.
6. **One Mandate primitive** for a family, a business, an NGO or a government allocation.
7. **Monitored budgets.** A payer can tick "allow even if not fully approved" (`enforcement: MONITORED`). Purpose checks still run and are shown in the spending report. They don't block. Mandate rules and the budget always do. See `docs/adr/0006-monitored-budgets.md`.
8. **Merchant confidence.** A shop declares its categories at registration. The trust matrix gives each declared category a confidence (`CONTESTED`/`LOW`/`MEDIUM`/`HIGH`) from corroboration (Cámara de Comercio, wallet KYB) × history (distinct payers who confirmed a purchase). History never changes a trust level and never reaches `HIGH` alone. Mandates set a minimum confidence. See `docs/adr/0007-merchant-confidence-matrix.md`.
9. **Business model:** programs and payers pay; merchants join free (state bonus money is their reason to register); wallets gain users and remittance flows.
10. **PayPal, approved per order.** Authorizing a budget asks nothing of PayPal. Each `ALLOW` is one PayPal order the payer approves; there is no vault and no standing permission. See `docs/adr/0008-paypal-rail-per-order-approval.md`.

## Architecture

The repository is a product monorepo. The root is documentation and agent context. It is not an application and it has no workspace orchestrator.

- `frontend/` is one Next.js app. `/paypal`, `/nequi`, `/nequi-negocios`, and `/demo` are simulated wallet surfaces. `/demo` shows the three experiences in phone frames under one session. They are not separate apps.
- `backend/` owns the domain, policy gate, PayPal port, settlement, merchant registry, purpose classifier, audit, and the HTTP API. Ports live in `backend/src/ports/`, adapters in `backend/src/integrations/`.
- `data/` holds fixtures, seeds, and the Postgres schema and migrations.
- `contracts/` is where a shared API or event schema goes. There is no shared TypeScript package.
- `infra/` is reserved. Nothing is deployed from it yet.
- `docs/` is the product and research documentation.

The frontend must not import `backend/src`. The backend must not import `frontend/src`. A browser result is not an authoritative `ALLOW`, `DENY`, or `REVIEW`. A `?paypalOrder=…` hint in a URL is not a payment result.

Storage is in memory by default, and a restart loses it. With `DATABASE_URL` set, the backend uses Supabase Postgres through `backend/src/integrations/postgres/`. See `backend/.env.example`. The PayPal migration (`data/migrations/20261026120000_paypal_rail.sql`) was applied to the team's project on 2026-10-27. It empties the COMPAS runtime tables when it runs, so never run it again.

Secrets (`PAYPAL_CLIENT_SECRET`, `DATABASE_URL`) stay in the backend environment. They must not be exposed as `NEXT_PUBLIC_*` variables.

## PayPal

PayPal moves money from the payer's PayPal to the merchant's, and the payer approves each payment there. COMPAS decides whether a delegate may cause a payment for a purpose, within a budget.

Keep PayPal behind `PayPalGateway` in `backend/src/ports/paypal-gateway.ts`. Only `backend/src/integrations/paypal/` talks to PayPal, over `fetch`; there is no PayPal SDK. When `PAYPAL_CLIENT_ID` or `PAYPAL_CLIENT_SECRET` is missing, the backend uses `UnimplementedPayPalGateway`, which throws. Do not replace that throw, or any gateway error, with a fabricated order, approval or capture.

The client secret and access tokens stay inside the adapter. They never cross the port, reach HTTP responses, logs, errors or `data/`. `PAYPAL_ENVIRONMENT` accepts only `sandbox`.

Call `createOrder` only through `createPayPalOrderIfAllowed`, after policy returns `ALLOW`. Call `captureOrder` only through `PayPalOrderSettlement`, which captures an order only if PayPal reports it `APPROVED`, its payee, amount and `custom_id` match the record, the mandate is still `ACTIVE` and in its window, and, with `DEMO_PAYER_PAYPAL_ID` set, that account approved it. Every state change on the spending record is one conditional transition, so a double return never captures, releases or records twice.

The order pays the merchant directly: `payee.merchant_id`. Do not set `brand_name`: PayPal must show the payer the merchant's own name. The approval link reaches the payer's view only, and the frontend opens only an https page on `paypal.com`.

COMPAS does not convert currencies. The order is in the charge's currency, which must be the budget's, and the budget must be in a currency PayPal takes. Do not hardcode an exchange rate and present it as live.

Do not put health data or other sensitive personal data in a PayPal order. Opaque references and neutral line names only.

Configuration is in `backend/.env.example`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_RETURN_URI`, `PAYPAL_CANCEL_URI`, `PAYPAL_FRONTEND_RETURN_URL`, and the demo's sandbox accounts `DEMO_MERCHANT_PAYPAL_ID`, `DEMO_LIQUOR_PAYPAL_ID`, `DEMO_PAYER_PAYPAL_ID`. The flow mapping is in `docs/04-paypal-mapping.md`.

The PayPal MCP tools failed server-side in an earlier session. Probe the sandbox through the REST API.

## Development

Prefer the smallest change that keeps the demo buildable. Do not add a library or a workspace tool without a concrete need.

Run commands from the project directory:

```text
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm test
```

```text
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm run paypal:smoke  # one real PayPal sandbox payment: order, approval in the browser, capture; needs backend/.env
npm run compas:smoke  # the policy layer on top of real PayPal sandbox orders; see backend/README.md
```

There is no root `package.json`. Domain and policy tests live in `backend/tests`. The frontend's `npm test` checks its labels and demo-charge logic. With `TEST_DATABASE_URL`, `npm test` in `backend/` also runs the Postgres adapter tests.

`frontend/AGENTS.md` is the Next.js agent note. `next dev` writes it, so leave it in place.

The PayPal app, Nequi and Nequi Negocios simulations imitate the real apps, without their logos. COMPAS's own screens have their own look.

Demo fixtures are labeled `demo/test data`. An unimplemented integration throws. It does not return a fake success. Do not claim a simulated provider integration is real.

## Scope ladder

- **Built (PayPal):** Pedro's medication mandate, authorized in COMPAS → Andrea's pharmacy purchase → `ALLOW` → PayPal order payable to the pharmacy → Pedro approves at PayPal → COMPAS re-checks and captures → completed. Alcohol → `PURPOSE_MISMATCH`, and no `createOrder` call. Cancel, expiry, revocation and a mismatched order close the purchase unpaid and give the capacity back.
- **Next, only when asked:**
  - Payer exception approval: `REVIEW` → the payer approves a one-off PayPal order for the held cart.
  - Refunds and disputes, through PayPal webhooks. A refund must restore capacity.
  - A payer-absent charge for all-green purchases, once PayPal enables Vault for the app.
  - `PROVIDER_VERIFIED` claims from a simulated wallet node with signature checks.
  - An AI classifier for ambiguous lines.
  - The idea doc's AI analyst, Cámara binding (Log in with PayPal), CUM mapping, errands and MCP server.
- **Roadmap (pitch only unless asked):**
  - State bonus mandates such as Medellín Cero Hambre, with split tender: the bonus paid first.
  - An NFC card + PIN for a beneficiary with no smartphone (Web NFC, Android Chrome only).
  - Merchant anomaly detection over time.
  - Real RUES/Nequi adapters.

## Pitch guardrails

- Say plainly that purpose enforcement and the budget are COMPAS's job. PayPal enforces the payer's consent: Pedro approves every payment at PayPal.
- The PayPal app screens, Nequi and Nequi Negocios are simulations, and the PayPal accounts are sandbox accounts. No production PayPal integration is implied.
- The demo is in USD. COMPAS does not convert, and PayPal takes no COP. Any COP figure is labeled `demo/test data`.
- Don't claim fraud that isn't documented, such as bonus resale. Do cite the documented problems in `docs/10-reference.md`.

## Docs

- `docs/00-product-vision.md` to `docs/07-security-privacy-ethics.md`: vision, demo story, domain model, architecture, PayPal mapping, policy engine, AI classification, security and privacy.
- `docs/09-research-and-prior-art.md`: purpose-bound money and other prior art.
- `docs/10-reference.md`: PayPal facts checked against the sandbox, CIIU categories, the Colombian research the design rests on, and sources.
- `docs/adr/`: architecture decisions. ADR 0008 is the PayPal rail.
