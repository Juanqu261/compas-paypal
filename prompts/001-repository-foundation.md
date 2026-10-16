# COMPAS — Repository Foundation & Architecture Scaffold

You are working inside the existing GitHub repository:

ybedoyab/compas

This is a project for the Interledger Open Payments Hackathon 2026 in Medellín.

Before making changes, inspect the complete current repository.

IMPORTANT:
This task is ONLY the repository foundation, architectural scaffold and documentation.
Do NOT build the complete product yet.
Do NOT invent working payment behavior.
Do NOT fake an Open Payments integration.
Do NOT implement the AI classifier yet.
Do NOT implement a database yet.
Do NOT implement production integrations with ARQ, Nequi, Bre-B or any financial institution.

The objective of this task is to leave a clean, technically coherent foundation so subsequent prompts can implement the system incrementally.

============================================================
0. FIRST ACTION — AI DISCLOSURE / PROMPT LOG
============================================================

Interledger Hackathon AI rules require:

1. AI_USAGE.md at the repository root.
2. Exact prompts used for coding inside /prompts.

Therefore, BEFORE doing any implementation:

Create:

/prompts/001-repository-foundation.md

and copy THIS ENTIRE PROMPT into that file verbatim.

Do not summarize it.
Do not rewrite it.
Preserve the actual prompt.

Also create:

/AI_USAGE.md

The initial disclosure must state that Cursor was used for:

- repository architecture
- scaffolding
- documentation
- initial type/interface definitions
- README generation

Do not claim human-written files unless we explicitly verify that later.

AI_USAGE.md must be designed so future entries for ChatGPT, Claude, Cursor, Gemini, etc. can be appended easily.

============================================================
1. PRODUCT DEFINITION — READ CAREFULLY
============================================================

Project name:

COMPAS

Do NOT invent an acronym for COMPAS.

Core idea:

COMPAS is NOT:
- a bank
- a wallet
- a payment rail
- a standalone consumer application
- a dashboard product
- a stored-value account
- a custodian of funds
- a token
- a cryptocurrency
- a blockchain project

COMPAS is an embedded authorization and policy layer for programmable payments.

The central concept is:

"Money stays where it is. COMPAS moves permission, not money."

A payer does not transfer money to an intermediary first.

Instead, the payer creates a COMPAS mandate granting another person or context a limited capacity to cause future payments, subject to explicit purpose restrictions.

A useful conceptual distinction is:

"Purpose-Bound Money binds the money.
COMPAS binds the permission to spend it."

Do NOT claim that COMPAS invented the broader concept of restricted-purpose or programmable payments.

Relevant prior art includes:
- MAS Project Orchid / Purpose Bound Money
- IMF work discussing Purpose Bound Money
- ERC-7291
- digital vouchers
- conditional transfers
- programmable payments

COMPAS differentiates itself by exploring a non-custodial, interoperable policy/authorization layer over existing wallet accounts, using Open Payments.

============================================================
2. PRIMARY DEMO STORY
============================================================

The primary hackathon scenario is:

Pedro lives abroad and has money in a USD-denominated wallet.

For the demo, the payer-side wallet surface will be represented as ARQ.

Pedro wants to make up to USD 40 available for purchasing medication for his grandmother Gladys in Colombia.

Gladys does not manage a digital wallet herself.

Gladys lives with Andrea, Pedro's sister.

Andrea has a Nequi account.

Pedro does NOT want to transfer USD 40 directly to Andrea because he wants that spending capacity to be used only for Gladys's medications.

Pedro uses COMPAS inside his existing wallet experience.

He creates a mandate approximately equivalent to:

payer: Pedro
delegate: Andrea
beneficiary: Gladys
budget: USD 40
purpose: MEDICATION
status: ACTIVE
expiration: configurable

Andrea does NOT receive USD 40 into her account.

Instead she obtains delegated spending capacity under the COMPAS mandate.

Later Andrea visits a pharmacy.

The pharmacy uses a Nequi Negocios-like merchant surface.

The merchant participates in COMPAS and has merchant/category information.

Andrea initiates payment, for example through a QR interaction.

COMPAS evaluates whether the proposed purchase satisfies Pedro's mandate.

If the transaction is eligible:

COMPAS authorizes progression into the Open Payments payment flow.

The actual payment should ultimately be:

Pedro's wallet
    ->
Open Payments
    ->
merchant wallet

Andrea is the delegate, not the recipient of the USD 40.

If Andrea attempts to use the mandate at a liquor store or for alcohol:

the policy evaluation must reject the transaction BEFORE creating/executing the outgoing payment.

The product must also eventually support enterprise, NGO and government use cases using the SAME mandate primitive.

Example:

Treasury authorizes COP 1,000,000,000 for LABOR_CONTRACTS.

A delegated project manager may cause payments to eligible labor/service providers.

A payment whose classified purpose is MATERIALS should not be funded from that mandate.

However:

Do NOT implement the government scenario in the MVP frontend now.
Document it as an extension/use case.

Never claim COMPAS "solves corruption".

A defensible statement is:

"COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail."

============================================================
3. IMPORTANT OPEN PAYMENTS BOUNDARY
============================================================

Open Payments and COMPAS are NOT the same layer.

Document and enforce this distinction throughout the architecture.

OPEN PAYMENTS is responsible for concepts such as:

- wallet addresses
- authorization servers
- resource servers
- grants
- access actions
- grant limits
- incoming-payment
- quote
- outgoing-payment
- payment execution
- payment completion

COMPAS is responsible for:

- mandate
- payer
- delegate
- beneficiary
- purpose
- eligible merchant/category
- line-item/category policy
- merchant evidence
- policy evaluation
- AI fallback classification
- decision reason
- audit trail

Do NOT call MEDICATION an "Open Payments scope".

Open Payments uses grants/access rights/actions/limits.

MEDICATION is a COMPAS policy concept.

Open Payments supports monetary/time restrictions through grant limits.

COMPAS adds semantic purpose restrictions.

A key Open Payments capability relevant to COMPAS is that an outgoing-payment grant for future payments may be obtained before the final recipient is known.

That model is highly relevant because Pedro may authorize a spending budget before Andrea knows which eligible pharmacy she will use.

Document this carefully.

For cross-currency demo flows:

Pedro may use a USD wallet while the merchant wallet is represented as COP-denominated.

The quote should conceptually represent exchange/cost information.

Never hardcode an exchange rate and present it as real.

Use either:
- values returned by the actual Open Payments test environment later, or
- explicitly labeled demo fixtures.

Open Payments currently has ILP as its directly integrated payment method.

Therefore NEVER claim that the prototype has a real production integration with:
- Nequi
- ARQ
- Daviplata
- Bre-B
- ACH
unless such an integration is genuinely implemented and verified later.

ARQ, Nequi and Nequi Negocios are UX/provider simulations demonstrating how COMPAS could be embedded inside existing wallet ecosystems.

Add this disclaimer to documentation.

============================================================
4. REPOSITORY ARCHITECTURE DECISION
============================================================

Keep this repository deliberately simple.

DO NOT create a monorepo.

Use one TypeScript web application.

Preferred foundation:

- Next.js
- App Router
- TypeScript
- current stable supported versions
- simple CSS/Tailwind setup if appropriate
- ESLint

Do not add unnecessary dependencies.

The application must eventually be easy to deploy on Vercel, but deployment is NOT part of this task.

Architecture should keep the COMPAS domain independent from:
- Next.js UI
- Nequi UI
- ARQ UI
- Open Payments SDK
- AI provider
- storage provider

Use clear interfaces/ports between the core and integrations.

============================================================
5. DEMO EXPERIENCE
============================================================

The internal hackathon web application must expose these routes:

/demo
/arq
/nequi
/nequi-negocios

The audience should NOT need to navigate these manually during the pitch.

The main presentation surface is:

/demo

/demo must eventually display THREE smartphone frames side-by-side:

PHONE 1
ARQ
Pedro / payer

PHONE 2
Nequi
Andrea / delegate

PHONE 3
Nequi Negocios
merchant / pharmacy

IMPORTANT:

Do NOT use three independent applications.

Do NOT use three completely duplicated implementations.

The individual routes and /demo must reuse the SAME feature components.

For example:

<ArqExperience />
<NequiExperience />
<NequiBusinessExperience />

Then:

/arq
renders ArqExperience

/nequi
renders NequiExperience

/nequi-negocios
renders NequiBusinessExperience

/demo
renders all three inside PhoneFrame components under the SAME shared demo state.

Do not use iframes unless there is a compelling technical reason.

The three simulated phones must ultimately stay synchronized because they represent one payment lifecycle.

For this scaffolding task, create only the basic route shells and component boundaries.

No complete visual design is required yet.

============================================================
6. PROPOSED PROJECT STRUCTURE
============================================================

Create a structure approximately like this, adapting only where Next.js conventions clearly require it:

/
├── README.md
├── AI_USAGE.md
├── AGENTS.md
├── .env.example
├── .gitignore
├── package.json
├── prompts/
│   └── 001-repository-foundation.md
├── docs/
│   ├── 00-product-vision.md
│   ├── 01-demo-story.md
│   ├── 02-domain-model.md
│   ├── 03-architecture.md
│   ├── 04-open-payments-mapping.md
│   ├── 05-policy-engine.md
│   ├── 06-ai-classification.md
│   ├── 07-security-privacy-ethics.md
│   ├── 08-hackathon-compliance.md
│   ├── 09-research-and-prior-art.md
│   └── adr/
│       ├── 0001-non-custodial-design.md
│       ├── 0002-single-app-three-surfaces.md
│       └── 0003-ai-is-advisory.md
├── .cursor/
│   └── rules/
│       └── compas.mdc
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── demo/
│   │   │   └── page.tsx
│   │   ├── arq/
│   │   │   └── page.tsx
│   │   ├── nequi/
│   │   │   └── page.tsx
│   │   └── nequi-negocios/
│   │       └── page.tsx
│   ├── features/
│   │   ├── demo/
│   │   ├── arq/
│   │   ├── nequi/
│   │   └── nequi-business/
│   ├── compas/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── policy/
│   │   ├── audit/
│   │   └── ports/
│   ├── integrations/
│   │   ├── open-payments/
│   │   ├── merchant-registry/
│   │   └── ai-classifier/
│   ├── components/
│   │   └── phone/
│   ├── demo/
│   │   └── scenarios/
│   └── lib/
└── tests/
    ├── domain/
    ├── policy/
    └── integration/

Do not create empty complexity for its own sake.

If a folder would remain completely meaningless, add a minimal README or interface explaining its intended responsibility.

============================================================
7. DOMAIN MODEL
============================================================

Create minimal TypeScript domain types/interfaces, NOT full implementations.

The model should at minimum consider:

Mandate
PurposePolicy
Party
Payer
Delegate
Beneficiary
MerchantProfile
MerchantCategoryClaim
PurchaseIntent
PurchaseLineItem
PolicyDecision
PolicyReason
AuditEvent
MoneyAmount

Potential Mandate shape conceptually:

id
payer
delegate
beneficiary
budget
remainingAuthorizedAmount
purposePolicy
status
validFrom
expiresAt
createdAt

Do not treat remainingAuthorizedAmount as a wallet balance.

It is authorization capacity.

Define states such as:

DRAFT
PENDING_AUTHORIZATION
ACTIVE
EXHAUSTED
EXPIRED
REVOKED

PolicyDecision should make reasoning explicit.

For example:

ALLOW
DENY
REVIEW

with reasons such as:

MANDATE_INACTIVE
MANDATE_EXPIRED
BUDGET_EXCEEDED
PURPOSE_MISMATCH
MERCHANT_NOT_ELIGIBLE
CLASSIFICATION_UNCERTAIN

Do not over-engineer this enum set now.

============================================================
8. PORTS / INTEGRATION BOUNDARIES
============================================================

Create interface boundaries only.

At minimum consider:

OpenPaymentsGateway
MandateRepository
MerchantRegistry
PurposeClassifier
AuditRepository

OpenPaymentsGateway must shield the COMPAS domain from the Interledger SDK.

Later it should expose operations conceptually equivalent to:

- resolve wallet
- request/continue grants
- create incoming payment
- create quote
- create outgoing payment
- read payment status

But DO NOT implement actual Open Payments calls in this task.

Create clearly marked placeholders/interfaces instead.

============================================================
9. POLICY ENGINE ARCHITECTURE
============================================================

Document the planned evaluation order.

A future transaction should conceptually be evaluated as:

payment intent
    ->
mandate exists?
    ->
mandate active?
    ->
delegate eligible?
    ->
within time restrictions?
    ->
budget sufficient?
    ->
merchant/category deterministic evidence?
    ->
item/category deterministic evidence?
    ->
if still ambiguous: AI classifier
    ->
policy decision
    ->
ONLY IF ALLOWED:
Open Payments flow

Core invariant:

NO outgoing payment should be initiated before COMPAS policy evaluation returns ALLOW.

AI must never directly execute or authorize a payment.

============================================================
10. AI CLASSIFICATION
============================================================

AI is a fallback classifier, not the decision maker.

Document this principle.

Preferred model:

Structured merchant/item data
        ->
deterministic classification
        ->
if insufficient evidence
        ->
AI classification
        ->
structured output:
category
confidence
evidence/reason
        ->
COMPAS deterministic policy engine
        ->
ALLOW / DENY / REVIEW

Low-confidence AI results must fail safely.

For the hackathon MVP, default to fail-closed or REVIEW rather than silently allowing spending.

Do not select an AI vendor yet.

PurposeClassifier must be provider-agnostic.

============================================================
11. MERCHANT CLASSIFICATION
============================================================

Do not assume a merchant selecting:

"I sell medication"

is sufficient proof.

Merchant category data should support provenance/trust levels such as:

SELF_DECLARED
PROVIDER_VERIFIED
EXTERNAL_VERIFIED

Do not implement full verification now.

Document the model.

Future mixed-basket support should also be documented.

Example:

Acetaminophen    MEDICATION    eligible
Losartan         MEDICATION    eligible
Shampoo          PERSONAL_CARE not eligible

A future implementation could let COMPAS fund only the eligible subtotal while the user pays the rest separately.

Do not implement split tender now.

============================================================
12. AUDITABILITY
============================================================

Every important decision should eventually generate an AuditEvent.

The audit model should allow reconstructing:

- who created the mandate
- when authorization occurred
- mandate version/policy
- payment intent
- merchant/category evidence
- policy result
- reason
- associated Open Payments resource references
- final payment result

Do NOT put sensitive medical details in Open Payments metadata.

Open Payments supports metadata, but treat it carefully.

A future safe metadata mapping might contain opaque references such as:

compasMandateId
compasDecisionId
externalReference

Do not insert unnecessary PII or health information.

============================================================
13. RESEARCH / PRIOR ART DOCUMENT
============================================================

Create:

docs/09-research-and-prior-art.md

It should explain, in concise technical language, the relationship between COMPAS and:

1. MAS Project Orchid / Purpose Bound Money
   - Purpose Bound Money directs value toward a purpose.
   - It aims to preserve interoperability.
   - COMPAS is NOT implementing a PBM token/wrapper.
   - COMPAS instead applies purpose policy to payment authorization.

2. IMF work on digital asset platforms / PBM
   - PBM is recognized as an architectural concept for programmable digital assets/payments.

3. ERC-7291
   - Relevant technical prior art.
   - Blockchain/smart-contract implementation.
   - COMPAS deliberately does not require blockchain.

4. Cash vs restricted/in-kind transfers research
   - Transfer design can change spending behavior.
   - Purpose restrictions are economically meaningful.

5. Research on digital consumption coupons in China
   - Targeted digital restrictions can influence spending.
   - Poor policy design can disproportionately benefit larger merchants.
   - Merchant inclusion matters.

6. CGAP modern G2P architecture
   - interoperability and user choice are important.
   - avoid creating another closed-loop ecosystem.

7. Small merchant digital payment acceptance
   - merchant acceptance/onboarding remains an inclusion challenge.

Also add a "Risks and trade-offs" section covering:

- paternalism / loss of recipient autonomy
- miscoded merchants
- merchant/delegate collusion
- false invoices
- AI classification errors
- small-merchant exclusion
- privacy
- refunds
- split transactions
- purpose-policy abuse

Make it clear that COMPAS is a payment-control primitive, not a universal solution to fraud or corruption.

Do not fabricate academic references or URLs.

If you cannot verify a bibliographic field, mark it TODO rather than inventing it.

============================================================
14. DOCUMENTATION FILE CONTENTS
============================================================

docs/00-product-vision.md

Explain:
- problem
- COMPAS concept
- what COMPAS is
- what COMPAS is not
- "permission, not custody"
- individual / business / NGO / government extension

docs/01-demo-story.md

Document the exact:
Pedro -> Andrea -> Gladys -> pharmacy
approved medication scenario
rejected alcohol scenario

docs/02-domain-model.md

Document entities, terminology, lifecycle and invariants.

docs/03-architecture.md

Include Mermaid diagrams for:
- system context
- component architecture
- three-surface demo
- policy-to-payment sequence

docs/04-open-payments-mapping.md

Explicitly map:

COMPAS concept <-> Open Payments concept

and document:

Wallet Address
Grant
Incoming Payment
Quote
Outgoing Payment

Clearly state what Open Payments enforces and what COMPAS enforces.

docs/05-policy-engine.md

Explain deterministic rules, AI fallback and decision flow.

docs/06-ai-classification.md

Explain why AI is last resort and never authorizes money.

docs/07-security-privacy-ethics.md

Cover:
- least privilege
- sensitive metadata
- explicit payer consent
- delegate transparency
- auditability
- revocation
- misuse
- fairness
- inclusion
- health-data sensitivity

docs/08-hackathon-compliance.md

Document the Interledger hackathon requirements relevant to the repository:

- public GitHub repository for submission
- working POC
- actual Open Payments integration required for eligibility
- demo must visibly demonstrate:
  payment request
  authorization
  payment execution
  successful completion
- AI usage disclosure
- exact prompt logs
- all AI-generated work must be reviewed and understood by the team

Also include a submission checklist.

============================================================
15. README.md
============================================================

Replace the current minimal README with a serious project README.

It must be understandable by a technical judge in approximately 2 minutes.

Recommended order:

# COMPAS

Short one-sentence description.

Tagline:

"Money stays where it is. COMPAS moves permission, not money."

Then:

## The problem

Use Pedro / Andrea / Gladys in a compact form.

## The idea

Explain purpose-bound spending authorization.

## What COMPAS is not

Clarify:
not a wallet
not a bank
not custody
not another consumer app

## Demo surfaces

/arq
/nequi
/nequi-negocios
/demo

## Architecture

Short overview and link to docs/03-architecture.md.

## Open Payments

Explain why Open Payments matters.

## Repository structure

Short tree.

## Getting started

Valid commands only.

## Environment variables

Reference .env.example.

## AI usage

Link to AI_USAGE.md and /prompts.

## Research and prior art

Link to docs/09-research-and-prior-art.md.

## Disclaimer

State clearly:

This is a hackathon proof of concept.
ARQ, Nequi and Nequi Negocios are simulated integration surfaces.
The project is not affiliated with or endorsed by those companies.
No production banking integration is implied.

============================================================
16. CURSOR PROJECT RULES
============================================================

Create:

.cursor/rules/compas.mdc

The rule should force future Cursor work to respect these invariants:

- COMPAS is non-custodial.
- Do not model delegated capacity as money transferred to the delegate.
- Purpose restrictions belong to COMPAS, not Open Payments.
- Never fake a successful Open Payments call.
- Clearly distinguish demo fixtures from real API responses.
- AI can classify; AI cannot authorize a transaction.
- Policy evaluation happens before outgoing-payment execution.
- Do not introduce blockchain unless explicitly requested.
- Do not create separate products for person/business/government.
- Reuse the Mandate primitive.
- Keep Open Payments behind a gateway/adapter.
- Never include sensitive health data in Open Payments metadata.
- Any new AI coding prompt must be copied into /prompts.
- Update AI_USAGE.md when the role of AI changes materially.
- Prefer the simplest architecture capable of delivering the hackathon demo.
- Do not add libraries without a concrete need.
- Do not claim integrations that are only simulated.

Also create AGENTS.md with the core project invariants in a tool-agnostic form for other coding agents.

============================================================
17. DEMO PLACEHOLDER UI
============================================================

Create only enough UI to verify architecture.

The app should start successfully.

/
/demo
/arq
/nequi
/nequi-negocios

must all render.

For now:

/arq
should identify:
ARQ demo surface
Pedro
Payer

/nequi
should identify:
Nequi demo surface
Andrea
Delegate

/nequi-negocios
should identify:
Nequi Negocios demo surface
Pharmacy
Merchant

/demo
should show three simple PhoneFrame components side-by-side using those SAME experience components.

Do not spend time polishing colors or branding yet.

Do not download or copy official logos.

Use neutral prototype styling and text labels.

============================================================
18. DEMO SCENARIO FIXTURES
============================================================

Create a small scenario definition for future development, not business logic.

Example conceptual scenario:

Pedro
payer

Andrea
delegate

Gladys
beneficiary

Budget
USD 40

Purpose
MEDICATION

Merchant:
Droguería Central

Merchant surface:
Nequi Negocios simulation

Include another fixture for a rejected merchant/category:

Merchant:
example liquor store

Category:
ALCOHOL

Expected policy result:
DENY / PURPOSE_MISMATCH

Fixtures must be explicitly labeled demo/test data.

============================================================
19. TEST STRUCTURE
============================================================

Prepare test folders for:

domain invariants
policy engine
Open Payments gateway integration

Do not write a huge test suite yet.

At least add one trivial domain/policy test only if necessary to prove the scaffold works.

The important future invariant is:

A denied COMPAS transaction must never invoke OpenPaymentsGateway.createOutgoingPayment().

Document this as a critical test requirement.

============================================================
20. ENVIRONMENT VARIABLES
============================================================

Create .env.example.

Do not include real secrets.

Prepare logical placeholders for future Open Payments configuration, for example:

OPEN_PAYMENTS_CLIENT_WALLET_ADDRESS
OPEN_PAYMENTS_KEY_ID
OPEN_PAYMENTS_PRIVATE_KEY_PATH

Only use variable names consistent with how the actual Open Payments SDK will later be configured.

Do not fabricate credentials.

Do not add AI provider variables yet unless actually required.

============================================================
21. IMPORTANT HACKATHON PRODUCT SCOPE
============================================================

The MVP should eventually prove ONE scenario extremely well.

Primary scope:

Pedro creates MEDICATION mandate
        ->
Andrea attempts pharmacy purchase
        ->
COMPAS verifies it
        ->
Open Payments payment succeeds

And optionally:

Andrea attempts ALCOHOL purchase
        ->
COMPAS rejects it
        ->
NO outgoing payment is created

Everything else belongs to roadmap/documentation.

Do NOT allow enterprise/government future use cases to expand the MVP implementation right now.

============================================================
22. QUALITY REQUIREMENTS
============================================================

After scaffolding:

- install only necessary dependencies
- make sure the app builds
- make sure lint passes
- make sure TypeScript passes
- ensure all four routes render
- ensure docs reference actual repository paths
- ensure README commands are correct
- ensure AI_USAGE.md exists
- ensure /prompts/001-repository-foundation.md contains this actual prompt
- ensure there are no fake API responses presented as real
- ensure there are no secrets
- ensure no generated build artifacts are committed

============================================================
23. DO NOT DO IN THIS TASK
============================================================

Do NOT implement:

- real Open Payments payment flow
- GNAP continuation
- wallet onboarding
- merchant QR scanner
- QR generation
- database
- authentication
- Supabase
- AI APIs
- OCR
- merchant verification service
- government UI
- enterprise UI
- admin dashboard
- analytics dashboard
- blockchain
- smart contracts
- production Nequi integration
- production ARQ integration
- Bre-B integration

These belong to later prompts.

============================================================
24. FINAL RESPONSE
============================================================

When finished, DO NOT just say "done".

Give me:

1. Final repository tree.
2. Files created/modified.
3. Architectural decisions made.
4. Any deviations from this prompt and why.
5. Commands executed and their result.
6. Build/lint/typecheck status.
7. Anything that must be resolved before implementing the real Open Payments flow.
8. Confirmation that the exact prompt was saved in /prompts/001-repository-foundation.md.
9. Confirmation that AI_USAGE.md complies with the hackathon requirement.

Do not commit or push unless I explicitly ask you to.
