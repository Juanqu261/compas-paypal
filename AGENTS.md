# COMPAS

COMPAS is an embedded authorization and policy layer for purpose-restricted payments. Money stays where it is. COMPAS moves permission, not money.

This is the only agent context in the repository. Detail lives in `docs/`. If this file and `docs/` disagree, follow `docs/` for code and flag the conflict.

## This fork

This fork is COMPAS for PayPal. The PayPal sandbox replaces Open Payments entirely: the rail, the test accounts and the smoke tests. There is no Open Payments code left. [ADR 0008](docs/adr/0008-paypal-rail-per-order-approval.md) records the rail decision.

A delegate builds a cart at a merchant that accepts PayPal. COMPAS checks the cart against the mandate. Only on `ALLOW` does COMPAS create a PayPal order for that exact cart, payable to the merchant. The payer approves it at PayPal, logged in to their own account, and COMPAS captures it after checking the mandate again. The money goes from the payer's PayPal to the merchant's.

The cap decision is settled: **per-order approval**. The sandbox app has no Vault permission, so there is no payer-absent charge. The budget and the cap below `HIGH` are COMPAS rules, checked before PayPal and reserved atomically, and the payer approves every order. A payer-absent charge for all-green purchases waits until PayPal enables Vault for the app. Ask before building it.

Built in the backend: the AI analyst behind the trust matrix, INVIMA CUM mapping on Elastic, the Cámara binding through Log in with PayPal, errands, and the Compas MCP server for agents. See [ADR 0009](docs/adr/0009-ai-analyst-evidence.md), [ADR 0010](docs/adr/0010-errands.md) and [ADR 0011](docs/adr/0011-agents-mcp.md). The analyst has one screen: Act 1 of `/demo` runs it live on a pharmacy's catalog, and Act 2's "Why…?" panel reads its record for the charge's merchant. Act 3 of `/demo` shows an agent doing Andrea's part of Act 2 through that MCP server: one button sets up Pedro's budget and Andrea's errand if they are missing, then runs a scripted agent (its words are written, its calls are real) with a plain-language story, Andrea's consent card, and a technical view with the exact calls and the server's own log; `/agents/authorize` is the page a real MCP client's browser lands on. Not built, and only when asked: the frontend for merchant onboarding, appeals and errand screens beyond what Act 3 sets up.

## Product

A payer creates a mandate that gives a delegate limited capacity to cause a future payment for a stated purpose. The delegate does not receive the funds. `remainingAuthorizedAmount` is authorization capacity, not a PayPal balance and not custody.

COMPAS is not a wallet, a bank, a payment rail, a custody account, a token, a blockchain project, or a consumer dashboard.

Demo story: Pedro is the payer. He pays with his PayPal, in USD, and wants up to USD 40 available for medication for his grandmother Gladys. Gladys is the beneficiary and does not manage a wallet. Andrea is the delegate. She lives with Gladys and must not receive the USD 40 as unrestricted money. A pharmacy purchase for `MEDICATION` is the allowed story: it becomes a PayPal order that Pedro approves. An alcohol purchase against the same mandate is rejected before any PayPal order exists.

The PayPal app (Pedro), the PayPal app (Andrea) and the PayPal Business app (the pharmacy, an online business that takes PayPal) are simulated embedding surfaces, not production integrations. PayPal is the only wallet: Andrea has her own PayPal account, which is how she is identified as the delegate, and the USD 40 never reaches it. Only their screens are simulated: Pedro approves each order at the real PayPal sandbox, and the pharmacy is paid in its own PayPal sandbox business account. The pharmacy's screen shows that account's real COMPAS payments, each order read live from PayPal (`GET /demo/merchants/:id/payments`), and opens the sandbox site, where the merchant test account sees the money arrive. The PayPal accounts are sandbox test accounts: one personal account for the payer, one business account for the merchant.

The same mandate can later describe a business, NGO, or government allocation. The demo implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail. It does not solve corruption.

Terms:

- A purpose category such as `MEDICATION` is a COMPAS concept, never a PayPal concept.
- A merchant is named by its PayPal merchant id (`payee.merchant_id`), never by a URL the browser sends.
- A `PROVIDER_VERIFIED` claim is a wallet's signed attestation about its own merchant. PayPal signs none: in the demo, a simulated wallet KYB provider (`wallet-kyb-sim/*`, `demo/test data`) fills that tier. It is not PayPal and must never be presented as PayPal.
- An `EXTERNAL_VERIFIED` claim comes from a registry check, such as RUES at the Cámara de Comercio. On PayPal it needs the Cámara binding: the certificate's email equals the PayPal account's, proven by Log in with PayPal. In the demo the Cámara is a fixture (`camara-fixture`, `demo/test data`).
- **CUM** (INVIMA's medicine code) is the only product registry, because this MVP covers medicine only. Another category may need another registry with its own codes and verifier (ADR 0009). Don't generalize the code until a second category is asked for.
- A **pointer** from the AI analyst ("SKU x is CUM y") counts only once a deterministic verifier re-reads it from the source. A **judgment** can only flag. See ADR 0009.
- An **errand** is what the delegate confirmed may be bought, by CUM, with unit and amount caps. A cart that doesn't fit it is `REVIEW` `ERRAND_MISMATCH`, even under `MONITORED`. See ADR 0010.
- An **agent grant** is what a delegate allowed one MCP client to do: propose carts against the errands the delegate picked at consent, as a sub-delegate. The agent names SKUs and quantities; COMPAS sets prices and categories. See ADR 0011.

## Invariants

- COMPAS is non-custodial. It moves permission, not money. PayPal pays the merchant directly.
- Permission is delegated. Money is not transferred to the delegate.
- Policy must return `ALLOW` before any PayPal order. `DENY` and `REVIEW` never create one.
- No money moves until the payer approves the order at PayPal, and COMPAS captures only after checking the mandate and the order again.
- A payer may choose a `MONITORED` budget. Purpose checks are then recorded, not enforced. Mandate rules (status, validity, delegate, budget) always apply, and the payer still approves every order.
- AI never authorizes payments. The analyst and the errand drafter reach no PayPal port (a test walks their imports), a model's output is parsed before use and fails closed, and only a human withdraws an analyst flag.
- Errands are health data. They never reach PayPal, the analyst or the Elastic index. An agent sees only the errands its delegate gave it.
- An AI agent has no PayPal tool, no amount, no category and no way to confirm a purchase. It reaches PayPal only through `DelegatePurchaseService` (a test walks the imports), an agent token opens `/mcp` and no REST route, and nothing a merchant wrote reaches a tool result.
- Purpose categories belong to COMPAS.
- PayPal must never be faked. An unimplemented or unconfigured gateway throws.
- COMPAS talks to the PayPal sandbox only.
- The PayPal app (Pedro's and Andrea's) and PayPal Business surfaces are simulations. The order approval is not: it happens at the PayPal sandbox. The merchant's payments list is not either: it is read from the PayPal sandbox, and a failed read shows as unavailable, never as a guessed state.
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

- `frontend/` is one Next.js app. `/paypal` (Pedro), `/paypal-delegate` (Andrea), `/paypal-business`, and `/demo` are simulated wallet surfaces. `/demo` shows the three experiences in phone frames under one session. They are not separate apps.
- `backend/` owns the domain, policy gate, PayPal port, settlement, merchant registry, purpose classifier, audit, and the HTTP API. Ports live in `backend/src/ports/`, adapters in `backend/src/integrations/`.
- `data/` holds fixtures, seeds, and the Postgres schema and migrations.
- `contracts/` is where a shared API or event schema goes. There is no shared TypeScript package.
- `infra/` is reserved. Nothing is deployed from it yet.
- `docs/` is the product and research documentation.

The frontend must not import `backend/src`. The backend must not import `frontend/src`. A browser result is not an authoritative `ALLOW`, `DENY`, or `REVIEW`. A `?paypalOrder=…` hint in a URL is not a payment result.

Storage is in memory by default, and a restart loses it. With `DATABASE_URL` set, the backend uses Supabase Postgres through `backend/src/integrations/postgres/`. See `backend/.env.example`. The PayPal migration (`data/migrations/20261026120000_paypal_rail.sql`) was applied to the team's project on 2026-10-27. It empties the COMPAS runtime tables when it runs, so never run it again.

Secrets (`PAYPAL_CLIENT_SECRET`, `DATABASE_URL`, `ELASTICSEARCH_API_KEY`, `ANTHROPIC_API_KEY`, `COMPAS_OPERATOR_TOKEN`) stay in the backend environment. They must not be exposed as `NEXT_PUBLIC_*` variables.

Elastic does CUM search, behind a port, over `fetch` (`backend/src/integrations/elastic/`): an Elasticsearch index of INVIMA's CUM dataset finds candidates. The analyst's model is Claude (`claude-haiku-5-5`) through the official SDK (`backend/src/integrations/anthropic/`) when `ANTHROPIC_API_KEY` is set, else a `chat_completion` endpoint of Elastic's Inference API. Unconfigured, both throw. The index only proposes: mappings are verified against datos.gov.co (`SocrataCumRegistry`), or the committed subset with `CUM_REGISTRY=demo`. Catalogs, mappings, findings, merchant logins and errands are in memory; their tables are in `data/migrations/20261027170000_analyst_errands.sql`, applied on 2026-10-27 and empty until there are Postgres adapters. Analyst FLAGs and the Cámara's claims go to the trust log, which is Postgres when `DATABASE_URL` is set.

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
npm run cum:index     # build the Elastic CUM index from datos.gov.co (--demo: the committed subset)
npm run analyst:smoke # the analyst on the demo catalogs, live Elastic and Claude, in-memory trust log
```

There is no root `package.json`. Domain and policy tests live in `backend/tests`. The frontend's `npm test` checks its labels and demo-charge logic. With `TEST_DATABASE_URL`, `npm test` in `backend/` also runs the Postgres adapter tests.

`frontend/AGENTS.md` is the Next.js agent note. `next dev` writes it, so leave it in place.

The PayPal app and PayPal Business simulations imitate the real apps, without their logos. COMPAS's own screens have their own look.

Demo fixtures are labeled `demo/test data`. An unimplemented integration throws. It does not return a fake success. Do not claim a simulated provider integration is real.

## Scope ladder

- **Built (PayPal):** Pedro's medication mandate, authorized in COMPAS → Andrea's pharmacy purchase → `ALLOW` → PayPal order payable to the pharmacy → Pedro approves at PayPal → COMPAS re-checks and captures → completed. Alcohol → `PURPOSE_MISMATCH`, and no `createOrder` call. Cancel, expiry, revocation and a mismatched order close the purchase unpaid and give the capacity back.
- **Built (backend; the analyst also in Act 1 of `/demo`):** the AI analyst (Elastic CUM search, Claude as the model, the deterministic CUM verifier, appealable flags), Log in with PayPal for merchants, the Cámara binding against a fixture Cámara, errands with `ERRAND_MISMATCH`, and the MCP server for agents: errand-scoped OAuth 2.1 (PKCE, dynamic registration, rotating refresh), the four tools, `search_eligible_merchants` over vetted shops only, revocation by the delegate or the payer. Contract: `contracts/agents/`.
- **Next, only when asked:**
  - Payer exception approval: `REVIEW` → the payer approves a one-off PayPal order for the held cart.
  - Refunds and disputes, through PayPal webhooks. A refund must restore capacity.
  - A payer-absent charge for all-green purchases, once PayPal enables Vault for the app.
  - `PROVIDER_VERIFIED` claims from a simulated wallet node with signature checks.
  - An AI classifier for ambiguous lines at checkout.
  - Frontend for merchant onboarding, flag appeals, and errand screens beyond what Act 3 sets up. A live-model agent beside Act 3's scripted one, and an observer view of any real agent's calls.
  - An analyst job for a shop an agent names that COMPAS has never seen.
  - Postgres adapters for the analyst and errand stores (their tables exist), and for agent clients, grants and tokens (no tables yet).
  - A flag confirmed into `CONTESTED`, and AI contradiction of captured lines.
- **Roadmap (pitch only unless asked):**
  - State bonus mandates such as Medellín Cero Hambre, with split tender: the bonus paid first.
  - An NFC card + PIN for a beneficiary with no smartphone (Web NFC, Android Chrome only).
  - Merchant anomaly detection over time.
  - A real RUES adapter.

## Pitch guardrails

- Say plainly that purpose enforcement and the budget are COMPAS's job. PayPal enforces the payer's consent: Pedro approves every payment at PayPal.
- The PayPal and PayPal Business app screens are simulations, and the PayPal accounts are sandbox accounts. No production PayPal integration is implied.
- The demo is in USD. COMPAS does not convert, and PayPal takes no COP. Any COP figure is labeled `demo/test data`.
- Act 3's agent is a script. Say so: the calls to the MCP server are real, the reasoning is written. Its "planted prompt injections" are demo/test data, not an observed attack.
- Don't claim fraud that isn't documented, such as bonus resale. Do cite the documented problems in `docs/10-reference.md`.

## Docs

- `docs/00-product-vision.md` to `docs/07-security-privacy-ethics.md`: vision, demo story, domain model, architecture, PayPal mapping, policy engine, AI classification, security and privacy.
- `docs/09-research-and-prior-art.md`: purpose-bound money and other prior art.
- `docs/10-reference.md`: PayPal facts checked against the sandbox, CIIU categories, the Colombian research the design rests on, and sources.
- `docs/adr/`: architecture decisions. ADR 0008 is the PayPal rail, ADR 0009 the AI analyst's evidence, ADR 0010 errands, ADR 0011 agents over MCP.
