# COMPAS

COMPAS is an embedded authorization and policy layer for purpose-restricted payments. Money stays where it is. COMPAS moves permission, not money.

This is the only agent context in the repository. Detail lives in `docs/`. If this file and `docs/` disagree, follow `docs/` for code and flag the conflict.

## This fork

The target concept is Compas Refill. A delegate, or an AI shopping agent working for them, builds a cart at an online merchant that accepts PayPal. COMPAS checks the cart against the mandate. Only on `ALLOW` does COMPAS create a PayPal order that pays the merchant directly from the payer's saved PayPal account. The agent has no PayPal tools. Its only tools are COMPAS calls.

No PayPal code exists yet. Everything below describes the Open Payments build, and that build stays: PayPal becomes a second payment-rail adapter behind a port, not a replacement.

Open decision: PayPal has no wallet-enforced cap like the Open Payments grant's `debitAmount`. Who enforces the cap on the PayPal rail is not settled. The options are a human-present PayPal approval for every order, a COMPAS-only cap on the saved payment method, or a hybrid with a per-order ceiling. Ask before building something that depends on it.

## Product

A payer creates a mandate that gives a delegate limited capacity to cause a future payment for a stated purpose. The delegate does not receive the funds. `remainingAuthorizedAmount` is authorization capacity, not a wallet balance and not custody.

COMPAS is not a wallet, a bank, a payment rail, a custody account, a token, a blockchain project, or a consumer dashboard.

Demo story: Pedro is the payer. He holds a USD wallet and wants up to USD 40 available for medication for his grandmother Gladys. Gladys is the beneficiary and does not manage a wallet. Andrea is the delegate. She lives with Gladys and must not receive the USD 40 as unrestricted money. A pharmacy purchase for `MEDICATION` is the allowed story. An alcohol purchase against the same mandate is rejected before any outgoing payment.

ARQ (Pedro), Nequi (Andrea) and Nequi Negocios (the pharmacy) are simulated embedding surfaces, not production integrations.

The same mandate can later describe a business, NGO, or government allocation. The demo implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail. It does not solve corruption.

Terms:

- A purpose category such as `MEDICATION` is a COMPAS concept, never an Open Payments scope.
- A `PROVIDER_VERIFIED` claim is a wallet's signed attestation about its own merchant.
- An `EXTERNAL_VERIFIED` claim comes from a registry check, such as RUES at the Cámara de Comercio.

## Invariants

- COMPAS is non-custodial. It moves permission, not money.
- Permission is delegated. Money is not transferred to the delegate.
- Policy must return ALLOW before any outgoing payment. `DENY` and `REVIEW` never pay.
- A payer may choose a `MONITORED` budget. Purpose checks are then recorded, not enforced. Mandate rules (status, validity, delegate, budget) and the Open Payments grant cap always apply.
- AI never authorizes payments.
- Purpose categories belong to COMPAS. `MEDICATION` is not an Open Payments scope.
- Open Payments must never be faked.
- ARQ, Nequi, and Nequi Negocios surfaces are simulations.
- The frontend and the backend do not import each other's source. Shared contracts belong in `contracts/`.

## Design decisions (do not re-litigate)

1. **The delegate pulls at the point of sale.** There is no push to the delegate and no escrow. COMPAS holds no funds and no money ledger.
2. **Deterministic rules decide; AI only classifies.** Low confidence fails closed (`REVIEW`/`DENY`). AI can also *flag* a merchant whose behavior contradicts its claims. It never authorizes.
3. **Purpose is checked per merchant plus line items.** Rich purchase detail stays in the COMPAS audit trail. Open Payments metadata carries **only** `compasMandateId`, `compasDecisionId` and `externalReference`.
4. **Every spend needs the delegate's action.** Otherwise any eligible merchant could drain a grant.
5. **Federated trust, one central registry.** Each wallet is the authority on its own merchants and signs attestations (Ed25519, the same key type Open Payments clients use). The registry is an append-only trust log of claims, checks, AI flags and disputes. There is no blockchain.
6. **One Mandate primitive** for a family, a business, an NGO or a government allocation.
7. **Monitored budgets.** A payer can tick "allow even if not fully approved" (`enforcement: MONITORED`). Purpose checks still run and are shown in the spending report. They don't block. Mandate rules and the grant cap always do. See `docs/adr/0006-monitored-budgets.md`.
8. **Merchant confidence.** A shop declares its categories at registration. The trust matrix gives each declared category a confidence (`CONTESTED`/`LOW`/`MEDIUM`/`HIGH`) from corroboration (Cámara de Comercio, wallet KYB) × history (distinct payers who confirmed a purchase). History never changes a trust level and never reaches `HIGH` alone. Mandates set a minimum confidence. See `docs/adr/0007-merchant-confidence-matrix.md`.
9. **Business model:** programs and payers pay; merchants join free (state bonus money is their reason to register); wallets gain users and remittance flows.

## Architecture

The repository is a product monorepo. The root is documentation and agent context. It is not an application and it has no workspace orchestrator.

- `frontend/` is one Next.js app. `/arq`, `/nequi`, `/nequi-negocios`, and `/demo` are simulated wallet surfaces. `/demo` shows the three experiences in phone frames under one session. They are not separate apps.
- `backend/` owns the domain, policy gate, Open Payments port, merchant registry, purpose classifier, audit, and the HTTP API. Ports live in `backend/src/ports/`, adapters in `backend/src/integrations/`.
- `data/` holds fixtures, seeds, and the Postgres schema and migrations.
- `contracts/` is where a shared API or event schema goes. There is no shared TypeScript package.
- `infra/` is reserved. Nothing is deployed from it yet.
- `docs/` is the product and research documentation.

The frontend must not import `backend/src`. The backend must not import `frontend/src`. A browser result is not an authoritative `ALLOW`, `DENY`, or `REVIEW`.

Storage is in memory by default, and a restart loses it. With `DATABASE_URL` set, the backend uses Supabase Postgres through `backend/src/integrations/postgres/`. See `backend/.env.example`.

Secrets (Open Payments private keys, `DATABASE_URL`) stay in the backend environment. They must not be exposed as `NEXT_PUBLIC_*` variables.

## Open Payments

Open Payments moves value between wallet addresses. COMPAS decides whether a delegate may cause a payment for a purpose.

Purpose restrictions belong to COMPAS. Grants, access actions, and limits belong to Open Payments. Grant limits are only `debitAmount` or `receiveAmount`, `interval` and `receiver`.

Keep the Interledger SDK behind `OpenPaymentsGateway` in `backend/src/ports/open-payments-gateway.ts`. Only `backend/src/integrations/open-payments/` imports `@interledger/open-payments`. When the client env is missing, the backend uses `UnimplementedOpenPaymentsGateway`, which throws. Do not replace that throw, or any gateway error, with a fabricated wallet, grant, quote, or payment.

Access tokens, continuation tokens and nonces stay inside the adapter and the `GrantStore`. They never cross the port, reach HTTP responses, logs or `data/`. Keep the SDK `logLevel` at `warn` or above, because its debug logs print token-bearing bodies.

An outgoing-payment grant can be obtained before the final recipient is known. That is how Pedro can authorize a budget before Andrea chooses a pharmacy. The recipient is the merchant, not the delegate.

Call `createOutgoingPayment` only after policy returns `ALLOW`. `DENY` and `REVIEW` must not call it.

Do not hardcode an exchange rate and present it as a live quote. Cross-currency cost comes from a quote or from a fixture labeled `demo/test data`.

Do not put health data or other sensitive personal data in Open Payments metadata. Opaque references only: `compasMandateId`, `compasDecisionId`, `externalReference`.

Client configuration uses `CLIENT_WALLET_ADDRESS`, `KEY_ID`, and `PRIVATE_KEY_PATH` in `backend/.env.example`. The flow mapping is in `docs/04-open-payments-mapping.md`, and the integration plan in `docs/plans/open-payments-integration.md`.

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
```

```text
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm run op:smoke      # one real Open Payments payment on the test network; needs backend/.env
npm run compas:smoke  # the policy layer on top of real Open Payments; see backend/README.md
```

There is no root `package.json` and no frontend test script. Domain and policy tests live in `backend/tests`.

`frontend/AGENTS.md` is the Next.js agent note. `next dev` writes it, so leave it in place.

The ARQ, Nequi and Nequi Negocios simulations imitate the real apps. COMPAS's own screens have their own look.

Demo fixtures are labeled `demo/test data`. An unimplemented integration throws. It does not return a fake success. Do not claim a simulated provider integration is real.

## Scope ladder

- **Built (Open Payments):** Pedro's medication mandate with interactive consent → Andrea's pharmacy purchase → `ALLOW` → quote → outgoing payment → completed. Alcohol → `PURPOSE_MISMATCH`, and no `createOutgoingPayment` call.
- **Next, only when asked:**
  - Payer exception approval: `REVIEW` → the payer approves a one-off grant pinned to that incoming payment (`limits.receiver`).
  - `PROVIDER_VERIFIED` claims from a simulated wallet node with signature checks.
  - An AI classifier for ambiguous lines.
- **Roadmap (pitch only unless asked):**
  - State bonus mandates such as Medellín Cero Hambre, with split tender: several outgoing payments into one incoming payment, the bonus paid first.
  - An NFC card + PIN for a beneficiary with no smartphone (Web NFC, Android Chrome only).
  - Merchant anomaly detection over time.
  - Real RUES/Nequi adapters.

## Pitch guardrails

- Say plainly that purpose enforcement is COMPAS's job. The payment rail enforces consent and, on Open Payments, the cap.
- No Colombian Open Payments provider is live: "If Nequi or Puntored ran Rafiki, these surfaces plug in unchanged." ARQ, Nequi and Nequi Negocios are simulations.
- The test wallet is USD/EUR. Any COP figure comes from a quote or is labeled `demo/test data`.
- Don't claim fraud that isn't documented, such as bonus resale. Do cite the documented problems in `docs/10-reference.md`.

## Docs

- `docs/00-product-vision.md` to `docs/07-security-privacy-ethics.md`: vision, demo story, domain model, architecture, Open Payments mapping, policy engine, AI classification, security and privacy.
- `docs/09-research-and-prior-art.md`: purpose-bound money and other prior art.
- `docs/10-reference.md`: verified Open Payments facts, CIIU categories, the Colombian research the design rests on, and sources.
- `docs/adr/`: architecture decisions. `docs/plans/`: feature plans and their handoff notes.
