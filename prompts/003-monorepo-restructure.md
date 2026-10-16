# COMPAS — Restructure Repository into a General Product Monorepo

Repository:

ybedoyab/compas

You are modifying an EXISTING repository.

Before changing anything, inspect the entire current repository recursively.

This task is a STRUCTURAL REFACTOR of the repository foundation.

Do NOT rebuild COMPAS from scratch.
Do NOT discard the existing domain model, documentation, demo routes, tests or product decisions.
Preserve working code whenever possible and move/refactor it into the new architecture.

The previous repository foundation assumed:

"One Next.js application. No monorepo."

That decision is now explicitly REVOKED.

COMPAS must now be organized as a general monorepo containing:

- frontend
- backend
- data
- documentation
- infrastructure
- shared contracts
- AI/prompt compliance

The repository root must NOT be a Next.js project and must NOT contain application-specific package.json, tsconfig.json, next.config.ts, eslint.config.mjs, package-lock.json, source code or framework configuration.

============================================================
0. FIRST ACTION — SAVE THIS PROMPT
============================================================

BEFORE modifying the repository, save THIS ENTIRE PROMPT verbatim as:

prompts/002-monorepo-restructure.md

Do not summarize it.
Do not rewrite it.
Do not omit sections.

The existing:

prompts/001-repository-foundation.md

must remain untouched as historical evidence of the previous AI interaction.

Update:

AI_USAGE.md

by APPENDING a new entry for this restructuring task.

Do not rewrite the existing 2026-10-16 Cursor entry.

The new entry should state that Cursor was used for:

- repository restructuring
- monorepo architecture
- separation of frontend/backend/data
- migration of existing code
- documentation path updates
- agent-instruction restructuring

Link it to:

prompts/002-monorepo-restructure.md

============================================================
1. TARGET REPOSITORY PHILOSOPHY
============================================================

COMPAS is a PRODUCT repository, not a single frontend repository.

The top-level structure must clearly communicate:

frontend/
    User-facing demo and wallet embedding simulations.

backend/
    COMPAS core runtime, API, policy engine, Open Payments integration,
    authorization workflow and audit logic.

data/
    Data-related assets such as demo fixtures, future schemas,
    migrations and seed data.

contracts/
    Interface contracts between frontend/backend and potentially
    future integrations.

infra/
    Deployment/infrastructure material when needed.

docs/
    Product, technical, research and hackathon documentation.

prompts/
    Exact AI coding prompts required by hackathon AI disclosure.

.AGENTS/
    Tool-independent shared instructions/context for AI coding agents.

The repository root is an orchestration/documentation layer.

It must NOT itself be an npm/Next.js application.

============================================================
2. REQUIRED ROOT STRUCTURE
============================================================

Restructure the repository approximately as follows:

/
├── README.md
├── AI_USAGE.md
├── AGENTS.md
├── .gitignore
│
├── .AGENTS/
│   ├── README.md
│   ├── product.md
│   ├── architecture.md
│   ├── development.md
│   ├── open-payments.md
│   └── hackathon.md
│
├── frontend/
│   ├── README.md
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   ├── .env.example
│   ├── src/
│   └── tests/
│
├── backend/
│   ├── README.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── policy/
│   │   ├── ports/
│   │   ├── integrations/
│   │   │   ├── open-payments/
│   │   │   ├── merchant-registry/
│   │   │   └── ai-classifier/
│   │   └── audit/
│   └── tests/
│
├── data/
│   ├── README.md
│   ├── fixtures/
│   │   └── demo/
│   ├── schema/
│   ├── migrations/
│   └── seeds/
│
├── contracts/
│   └── README.md
│
├── infra/
│   └── README.md
│
├── docs/
│   └── [existing documentation]
│
└── prompts/
    ├── 001-repository-foundation.md
    └── 002-monorepo-restructure.md

Use judgment where necessary, but preserve this separation of responsibilities.

Do NOT create unnecessary frameworks or infrastructure simply to populate empty folders.

A README explaining future responsibility is enough for folders that are not implemented yet.

============================================================
3. REMOVE APPLICATION TOOLING FROM THE ROOT
============================================================

The following currently exist at repository root and must NOT remain there:

package.json
package-lock.json
tsconfig.json
next.config.ts
eslint.config.mjs
src/
tests/

Move or migrate them into the correct project.

The root must NOT have:

package.json
package-lock.json
pnpm-workspace.yaml
yarn workspace configuration
turbo.json
nx.json

We deliberately do NOT want a Node workspace orchestrator at this stage.

Each runtime project should manage its own dependencies independently.

Commands should be run explicitly from:

frontend/

or:

backend/

This keeps the repo technology-agnostic at root and allows frontend/backend to evolve independently.

============================================================
4. FRONTEND MIGRATION
============================================================

The current Next.js application becomes:

frontend/

Move the relevant current files:

package.json
package-lock.json
tsconfig.json
next.config.ts
eslint.config.mjs

into:

frontend/

Adapt paths/configuration as required.

Move current UI code into:

frontend/src/

Specifically preserve the current routes:

/
 /demo
 /arq
 /nequi
 /nequi-negocios

The frontend remains ONE Next.js application.

This architecture is still valid:

ArqExperience
NequiExperience
NequiBusinessExperience

Individual routes render the corresponding experience.

The /demo route renders the three experiences simultaneously in PhoneFrame components.

Do NOT turn ARQ, Nequi and Nequi Negocios into separate applications.

They are three simulated embedding surfaces inside one frontend.

The frontend is responsible for:

- wallet-like demo experiences
- user interactions
- three-phone hackathon presentation
- rendering state received from backend
- initiating COMPAS operations through backend APIs

The frontend must NOT own:

- COMPAS policy decisions
- grant authorization logic
- Open Payments credentials
- Open Payments private keys
- payment execution
- authoritative audit state
- AI authorization decisions

============================================================
5. BACKEND CREATION AND MIGRATION
============================================================

Create:

backend/

The backend will eventually be the authoritative COMPAS runtime.

Use Node.js + TypeScript.

Prefer a lightweight API architecture.

Fastify is acceptable if an HTTP framework is needed, but DO NOT overbuild the HTTP layer during this task.

The backend should own:

- COMPAS domain model
- Mandates
- policy evaluation
- payment authorization orchestration
- Open Payments gateway
- merchant registry integration
- purpose classifier integration
- audit events
- authoritative demo session state
- future persistence

Move the current COMPAS core code from:

src/compas/

into the appropriate backend structure.

Map approximately:

src/compas/domain/*
    ->
backend/src/domain/*

src/compas/application/*
    ->
backend/src/application/*

src/compas/policy/*
    ->
backend/src/policy/*

src/compas/ports/*
    ->
backend/src/ports/*

src/compas/audit/*
    ->
backend/src/audit/*

Move integrations:

src/integrations/open-payments/*
    ->
backend/src/integrations/open-payments/*

src/integrations/merchant-registry/*
    ->
backend/src/integrations/merchant-registry/*

src/integrations/ai-classifier/*
    ->
backend/src/integrations/ai-classifier/*

Move domain/policy/integration tests appropriately into:

backend/tests/

Preserve the existing critical invariant:

A COMPAS policy decision must return ALLOW before any outgoing payment is initiated.

DENY and REVIEW must never invoke createOutgoingPayment().

Do not weaken existing tests.

============================================================
6. BACKEND API BOUNDARY
============================================================

Prepare:

backend/src/api/

The goal is that the frontend never imports COMPAS backend implementation files directly.

Frontend and backend communicate through explicit API contracts.

For this restructuring task, a minimal backend health endpoint is sufficient if needed to prove that the backend starts.

Do NOT implement the full COMPAS API yet.

However, document likely future resource boundaries such as:

/mandates
/mandates/:id
/purchase-intents
/policy-evaluations
/payments
/demo/session

Do not invent production API behavior yet.

============================================================
7. CONTRACTS
============================================================

Create:

contracts/

This folder represents contracts crossing runtime boundaries.

Create:

contracts/README.md

Explain that it will contain things such as:

- OpenAPI specifications
- JSON schemas
- event schemas
- shared request/response contracts

Do NOT create a shared TypeScript package yet.

Do NOT couple frontend and backend by importing source files from each other.

The frontend should not reach into:

backend/src/

The backend should not reach into:

frontend/src/

If a contract must later be shared, define it explicitly under contracts/.

============================================================
8. DATA LAYER
============================================================

Create:

data/

with:

data/README.md
data/fixtures/
data/fixtures/demo/
data/schema/
data/migrations/
data/seeds/

IMPORTANT:

This does NOT mean implementing a production database now.

The data directory is the repository-level home for:

- database schemas
- migrations
- seed data
- test/demo datasets
- merchant/category reference fixtures
- future data-model documentation

Do NOT introduce Supabase, PostgreSQL, Prisma, Drizzle or another database in this task.

That will be decided separately.

Where practical, move the current demo scenario data from:

src/demo/scenarios/

into structured demo fixtures under:

data/fixtures/demo/

Prefer portable JSON fixture data when it does not compromise type safety.

The scenarios should still represent:

1. Medication purchase allowed.
2. Alcohol purchase rejected.

The frontend or backend may consume those fixtures later.

If moving them now would unnecessarily break build-time behavior, preserve working code and document the migration as TODO instead of forcing an artificial conversion.

============================================================
9. ENVIRONMENT VARIABLES
============================================================

The current root:

.env.example

contains Open Payments server credentials.

These credentials DO NOT belong to the frontend.

Move the Open Payments environment template to:

backend/.env.example

Preserve:

CLIENT_WALLET_ADDRESS
KEY_ID
PRIVATE_KEY_PATH

Do not expose them through NEXT_PUBLIC_* variables.

Create:

frontend/.env.example

only if the frontend requires public configuration.

For example, a future API base URL may eventually live there.

Do not add unnecessary variables.

No secrets may exist in git.

============================================================
10. AGENT INSTRUCTIONS — REMOVE TOOL LOCK-IN
============================================================

DELETE the committed:

.cursor/

directory completely.

There must be NO committed Cursor-specific rules.

Do NOT create a committed:

.claude/

directory either.

The repository should remain tool-agnostic.

Instead, create a shared tracked directory:

.AGENTS/

IMPORTANT:
Use exactly the directory name:

.AGENTS

The purpose of .AGENTS is to hold shared project context that can be used by Cursor, Claude Code, Codex or another coding agent.

Create:

.AGENTS/README.md
.AGENTS/product.md
.AGENTS/architecture.md
.AGENTS/development.md
.AGENTS/open-payments.md
.AGENTS/hackathon.md

Contents:

.AGENTS/product.md
- COMPAS product definition
- non-custodial invariant
- permission, not custody
- Mandate concept
- Pedro / Andrea / Gladys scenario
- what COMPAS is NOT

.AGENTS/architecture.md
- monorepo boundaries
- frontend responsibility
- backend responsibility
- data responsibility
- contracts responsibility
- no cross-imports between runtime projects

.AGENTS/development.md
- code quality expectations
- tests
- minimal dependencies
- no fake integrations
- fixture labeling
- how to run frontend/backend

.AGENTS/open-payments.md
- purpose restrictions belong to COMPAS
- Open Payments grants/actions/limits are separate
- MEDICATION is NOT an Open Payments scope
- OpenPaymentsGateway boundary
- no fake successful calls
- no sensitive data in metadata
- future payment grant relevance

.AGENTS/hackathon.md
- AI disclosure requirements
- prompt logging
- working POC expectations
- actual Open Payments integration requirement
- demo sequence requirements
- repository/public submission awareness

============================================================
11. ROOT AGENTS.md
============================================================

KEEP:

AGENTS.md

at repository root.

However, REWRITE it.

The current AGENTS.md contains assumptions that are now obsolete:

"One Next.js application. No monorepo."

That statement must disappear.

It also contains a Next.js-generated agent section that is specific to the old root Next.js application.

The root AGENTS.md must become tool-independent.

It should be short and act as the universal entry point for AI coding agents.

It should instruct agents to read:

.AGENTS/product.md
.AGENTS/architecture.md
.AGENTS/development.md
.AGENTS/open-payments.md
.AGENTS/hackathon.md

before significant changes.

Keep the most critical invariants directly in AGENTS.md:

- COMPAS is non-custodial.
- Permission is delegated; money is not transferred to the delegate.
- Policy must ALLOW before outgoing payment.
- AI never authorizes payments.
- Purpose categories belong to COMPAS.
- Open Payments must never be faked.
- ARQ/Nequi surfaces are simulations.
- prompts must be logged.
- frontend/backend boundaries must be respected.

Do NOT include Cursor-specific syntax.

Do NOT include Claude-specific syntax.

============================================================
12. LOCAL AI TOOL CONFIGURATION
============================================================

Update root .gitignore so contributors may use local agent-specific tooling without committing it.

Ignore:

.cursor/
.claude/

Also consider ignoring other purely local AI tool directories only when appropriate.

DO NOT ignore:

.AGENTS/
AGENTS.md
AI_USAGE.md
prompts/

Those are mandatory shared/versioned project resources.

This allows, for example:

Developer A:
.cursor/

Developer B:
.claude/

Developer C:
another local tool

while all agents share the same canonical project rules through:

AGENTS.md
.AGENTS/

============================================================
13. DOCS UPDATE
============================================================

Preserve all current documentation under:

docs/

Do NOT delete research or product documentation.

Review all docs for architecture/path references that are now obsolete.

Especially update:

docs/03-architecture.md

It must show the new system architecture:

Frontend
    |
    | HTTP/API
    v
Backend
    |
    +-- COMPAS Domain
    +-- Policy Engine
    +-- Open Payments Gateway
    +-- Merchant Registry
    +-- AI Classifier
    +-- Audit
    |
    v
Data/Persistence

The three wallet surfaces remain inside Frontend:

ARQ
Nequi
Nequi Negocios

Update diagrams accordingly.

Review:

docs/04-open-payments-mapping.md
docs/05-policy-engine.md
docs/06-ai-classification.md
docs/08-hackathon-compliance.md

and correct repository paths where necessary.

============================================================
14. ARCHITECTURE DECISION RECORD
============================================================

Do NOT delete historical ADRs.

The current:

docs/adr/0002-single-app-three-surfaces.md

is still conceptually valid because the three demo surfaces remain inside one frontend application.

Create a new ADR:

docs/adr/0004-general-monorepo-architecture.md

Record the new decision:

- repository is now a general product monorepo
- frontend/backend/data are separated
- root is not an application workspace
- one frontend still owns the three wallet simulations
- backend owns COMPAS business/payment logic
- tool-specific AI configuration is local
- .AGENTS contains shared AI-agent context

Mention that this supersedes ONLY the "No monorepo" repository constraint from the original foundation.

============================================================
15. ROOT README
============================================================

Update the root README so it describes COMPAS as a complete system repository.

The README must show a concise repository structure like:

frontend/
backend/
data/
contracts/
infra/
docs/
prompts/
.AGENTS/

Add a Development section.

Because there is no root package.json, do NOT document commands such as:

npm install
npm run dev

from repository root.

Instead document explicit project commands.

Example:

Frontend:

cd frontend
npm install
npm run dev

Backend:

cd backend
npm install
npm run dev

Only document backend commands that actually exist after this task.

Do not invent commands.

============================================================
16. FRONTEND README
============================================================

Create:

frontend/README.md

Explain:

- Next.js demo application
- /arq
- /nequi
- /nequi-negocios
- /demo
- UI-only responsibilities
- API boundary with backend
- simulated financial-provider surfaces
- local development commands

============================================================
17. BACKEND README
============================================================

Create:

backend/README.md

Explain:

- authoritative COMPAS runtime
- domain model
- policy engine
- Open Payments gateway
- future API
- merchant registry
- classifier
- audit
- environment variables
- development commands

Explicitly state:

The backend must never initiate an outgoing payment unless the policy engine has returned ALLOW.

============================================================
18. DATA README
============================================================

Create:

data/README.md

Explain that data/ is for:

- schemas
- migrations
- seed/reference data
- merchant taxonomy
- test/demo fixtures

It is NOT itself a database.

No persistence technology has been selected yet.

============================================================
19. CURRENT PRODUCT INVARIANTS MUST SURVIVE
============================================================

Preserve all of these:

COMPAS is not:
- a wallet
- a bank
- a payment rail
- a custody account
- a token
- a blockchain project
- a consumer dashboard

COMPAS is:

an embedded authorization and policy layer for programmable payments.

Core statement:

"Money stays where it is. COMPAS moves permission, not money."

Pedro:
payer

Andrea:
delegate

Gladys:
beneficiary

Medication:
allowed purpose

Pharmacy:
eligible merchant scenario

Alcohol:
rejected purpose scenario

ARQ / Nequi / Nequi Negocios:
simulated embedding surfaces only.

Do not claim production integrations.

============================================================
20. IMPORTANT FRONTEND/BACKEND SECURITY BOUNDARY
============================================================

After restructuring:

NO Open Payments private key may be available to frontend code.

NO payment execution should be implemented in the browser.

NO policy result coming from the frontend may be trusted as authoritative.

The frontend may REQUEST:

"evaluate this purchase"

but the backend determines the result.

The backend owns:

ALLOW
DENY
REVIEW

The backend owns the future OpenPaymentsGateway implementation.

============================================================
21. DO NOT OVERENGINEER
============================================================

This is still a hackathon.

Do NOT introduce:

- Kubernetes
- Docker Compose unless genuinely needed
- message brokers
- Redis
- microservices
- event sourcing frameworks
- Nx
- Turborepo
- pnpm workspaces
- GraphQL
- Prisma
- Supabase
- PostgreSQL
- cloud infrastructure
- authentication platforms
- blockchain

during this task.

The repository may be a monorepo without becoming a complex workspace.

We want clean boundaries, not infrastructure ceremony.

============================================================
22. BUILD / VALIDATION
============================================================

After moving files:

FRONTEND

From frontend/ verify:

npm install
npm run typecheck
npm run lint
npm run build
npm test

Use only scripts that actually exist.

Ensure:

/
/demo
/arq
/nequi
/nequi-negocios

still compile.

BACKEND

Ensure the backend TypeScript project compiles independently.

If you add a minimal HTTP server, verify it starts.

Run backend tests independently.

Do not require the frontend to import backend source files for compilation.

============================================================
23. CLEANUP
============================================================

At the end, confirm the repository root does NOT contain:

package.json
package-lock.json
tsconfig.json
next.config.ts
eslint.config.mjs
src/
tests/
.cursor/

Confirm that root DOES contain:

README.md
AI_USAGE.md
AGENTS.md
.AGENTS/
frontend/
backend/
data/
contracts/
infra/
docs/
prompts/

No duplicate obsolete copies should remain.

============================================================
24. GIT HISTORY / FILE MOVEMENT
============================================================

Whenever possible, MOVE existing files instead of recreating equivalent content from scratch.

Preserve existing code and documentation.

Do not delete a working implementation merely because the directory changed.

Do not commit or push automatically.

I will review changes first.

============================================================
25. FINAL RESPONSE
============================================================

When finished, provide:

1. Final complete repository tree.
2. Files moved.
3. Files created.
4. Files deleted.
5. Files modified.
6. Current frontend architecture.
7. Current backend architecture.
8. Current data architecture.
9. How frontend and backend are now separated.
10. Confirmation that no root package.json remains.
11. Confirmation that .cursor/ was removed.
12. Confirmation that .cursor/ and .claude/ are gitignored.
13. Confirmation that .AGENTS/ is tracked.
14. Confirmation that AGENTS.md is tool-agnostic.
15. Confirmation that prompts/001-repository-foundation.md was preserved.
16. Confirmation that THIS exact prompt exists in prompts/002-monorepo-restructure.md.
17. Build/lint/typecheck/test results for frontend.
18. Build/typecheck/test results for backend.
19. Any unresolved migration issue.
20. Any recommendation before implementing the real Open Payments flow.

Do not commit.
Do not push.
