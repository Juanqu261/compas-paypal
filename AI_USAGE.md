# AI usage disclosure

Interledger Open Payments Hackathon 2026 requires disclosure of AI assistance and a copy of the prompts used for coding.

This file is the running log. Append a new dated entry when a tool is used or when its role changes. Do not rewrite earlier entries. Tools can include Cursor, ChatGPT, Claude, Gemini, or another assistant.

This log does not claim that any file was written without AI assistance. The team must review and understand AI-generated work before submission.

## How to add an entry

Copy the template, fill it in, and link the prompt file under `prompts/`.

## Entries

### 2026-10-16 — Cursor

- Tool: Cursor
- Role:
  - repository architecture
  - scaffolding
  - documentation
  - initial type and interface definitions
  - README generation
- Prompt log: [prompts/001-repository-foundation.md](prompts/001-repository-foundation.md)
- Human review: Pending team review. This entry does not mark any file as human-written.

### 2026-10-16 — Claude Code

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - design interview (`/grill-me`) and web research on Colombian merchant registries, wallet merchant data and food-bonus programs
  - wrote `.skills/compas-context/SKILL.md` and `.skills/compas-context/REFERENCE.md`
  - copied `.skills/hackathon-ai-rules/`, which an AI assistant wrote in an earlier session
  - added the `Skills` section to `AGENTS.md` and a pointer line to `.cursor/rules/compas.mdc`
- Prompt log: [prompts/002-agent-skills.md](prompts/002-agent-skills.md)
- Human review: Pending team review. The CIIU codes in `.skills/compas-context/REFERENCE.md` are unverified and marked as such.

### 2026-10-16 — Cursor — monorepo restructure

- Tool: Cursor
- Role:
  - repository restructuring
  - monorepo architecture
  - separation of frontend, backend, and data
  - migration of existing code
  - documentation path updates
  - agent-instruction restructuring
- Prompt log: [prompts/003-monorepo-restructure.md](prompts/003-monorepo-restructure.md)
- Human review: Pending team review. This entry does not mark any file as human-written.

### 2026-10-16 — Claude Code (Claude integration)

- Tool: Claude Code (Claude Opus 5.5)
- Role: wrote `CLAUDE.md` (imports `AGENTS.md`) and the wrapper skills `.claude/skills/compas-context/SKILL.md` and `.claude/skills/hackathon-ai-rules/SKILL.md`, which point to `.skills/`. `.skills/` was not changed.
- Prompt log: [prompts/002-agent-skills.md](prompts/002-agent-skills.md), prompts 11–12
- Human review: Pending team review.

### 2026-10-16 — Claude Code — Open Payments integration plan

- Tool: Claude Code (Claude Opus 5.5)
- Role: read the scaffold and the `@interledger/open-payments` 7.4.0 type definitions, then wrote `docs/plans/open-payments-integration.md`. No application code.
- Prompt log: [prompts/004-open-payments-integration-plan.md](prompts/004-open-payments-integration-plan.md)
- Human review: Pending team review.

### 2026-10-16 — Claude Code — Open Payments integration

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - revised `backend/src/ports/open-payments-gateway.ts` and added `backend/src/ports/grant-store.ts`
  - wrote the real adapter and its helpers in `backend/src/integrations/open-payments/` (`interledger-open-payments-gateway.ts`, `sdk-client.ts`, `config.ts`, `errors.ts`, `mappers.ts`, `interaction-hash.ts`, `in-memory-grant-store.ts`, `create-open-payments-gateway.ts`)
  - added the consent callback `backend/src/api/open-payments-finish.ts` and wired it into `backend/src/api/server.ts`
  - wrote the smoke script `backend/scripts/op-smoke.ts`
  - wrote the tests in `backend/tests/integrations/open-payments/`, `backend/tests/api/` and `backend/tests/integration/`
  - updated `backend/.env.example`, `backend/package.json`, `contracts/open-payments/README.md` and the Open Payments docs
  - restored this file. Merge commit `762d25a` had deleted it.
- Prompt log: [prompts/005-open-payments-integration.md](prompts/005-open-payments-integration.md)
- Human review: Pending team review. The adapter was tested against an SDK test double and an offline wiring check only. It has not yet run against the Interledger test network. `npm run op:smoke` is the first real run.

### 2026-10-16 — Claude Code — Merchant category service plan

- Tool: Claude Code (Claude Opus 5.5)
- Role: design discussion on where merchant categories belong relative to Open Payments, then wrote `docs/plans/merchant-category-service.md`. No application code.
- Prompt log: [prompts/006-merchant-category-service-plan.md](prompts/006-merchant-category-service-plan.md)
- Human review: Pending team review. The MCC and CIIU mappings in the plan are from memory and marked unverified. Access to card-network merchant-lookup APIs is unverified.

### 2026-10-16 — Claude Code — Merchant category service

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - revised the plan `docs/plans/merchant-category-service.md` after a design discussion: card-network MCCs dropped; wallet KYB, RUES, health-authority registration and self-declaration became the evidence sources
  - wrote the domain types `backend/src/domain/merchant-category.ts` and `merchant-identifiers.ts`, and changed `merchant.ts`, `mandate.ts`, `purchase.ts`, `policy-decision.ts` and `index.ts`
  - wrote the ports `merchant-trust-log.ts`, `category-source-registry.ts`, `category-mapping-repository.ts` and `category-evidence-feed.ts`, and revised `merchant-registry.ts`
  - wrote `backend/src/application/category-claim-submission.ts`, `ingest-category-claim.ts` and `resolve-merchant-categories.ts`, plus `backend/src/policy/merchant-category-evidence.ts`
  - wrote the adapters in `backend/src/integrations/merchant-registry/` (in-memory trust log, source registry, mapping loader, Ed25519 check, NIT HMAC, demo seed, service wiring) and the throwing RUES and health-registry feeds in `backend/src/integrations/category-sources/`
  - added `backend/src/api/merchant-categories.ts` and wired it into `server.ts`
  - wrote the seeds in `data/seeds/category-mappings/` and `data/seeds/category-sources/`, and updated both demo fixtures
  - wrote `contracts/merchant-categories/` and `docs/adr/0005-merchant-category-attestations.md`, and updated the domain, architecture, policy and AI-classification docs and the backend READMEs and `.env.example`
  - changed the frontend demo card to read `merchantDisplayName` (`frontend/src/demo/scenarios.ts`, `frontend/src/features/shared/ExperienceCard.tsx`)
  - wrote the tests under `backend/tests/` (domain, application, policy, api, integration, contracts, integrations/merchant-registry)
- Prompt log: [prompts/007-merchant-category-service.md](prompts/007-merchant-category-service.md)
- Human review: Pending team review. Backend typecheck and all 107 tests pass. The frontend change was not typechecked, because the frontend dependencies were not installed. The CIIU 4773 title was checked against secondary sources only; the other CIIU rows and the pharmacy-registration rules are unverified and marked so in the seed files. Every evidence source is simulated.

### 2026-10-16 — Claude Code — Monitored budgets and the purchase flow

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - added the payer's tick, `purposePolicy.enforcement` (`ENFORCED` | `MONITORED`), plus `PurposeCheck` and the reason codes `DELEGATE_NOT_AUTHORIZED` and `PAYER_MONITORED_EXCEPTION`, in `backend/src/domain/`
  - wrote the deterministic purchase policy `backend/src/policy/evaluate-purchase.ts`
  - wrote `backend/src/application/purchase-under-mandate.ts` (COMPAS on top of Open Payments: mandate rules, merchant categories, incoming payment and quote, budget, decision, gated outgoing payment) and `spending-report.ts`
  - added the `SpendingLog` port, the `SpendingRecord` type and `backend/src/integrations/spending/in-memory-spending-log.ts`
  - wrote the tests `backend/tests/policy/evaluate-purchase.test.ts` and `backend/tests/application/purchase-under-mandate.test.ts`, including a real-adapter check against the SDK test double
  - wrote `docs/adr/0006-monitored-budgets.md` and `contracts/purchases/README.md`; added the layering section and diagram to `docs/04-open-payments-mapping.md`; updated `docs/02-domain-model.md`, `docs/05-policy-engine.md`, `backend/README.md`, `AGENTS.md` (one invariant line), `.skills/compas-context/SKILL.md` (one decision) and both demo fixtures
- Prompt log: [prompts/008-monitored-budgets.md](prompts/008-monitored-budgets.md)
- Human review: Pending team review. Backend typecheck and all 121 tests pass. The purchase flow is not exposed over HTTP and has not run against the test network. The mandate's remaining capacity is not updated after a payment.

### 2026-10-16 — Claude Code — COMPAS smoke test

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - wrote `backend/scripts/compas-smoke.ts` and the `compas:smoke` npm script: payer consent on the test network, then `purchaseUnderMandate` per scenario, with logging wrappers on the merchant registry and the gateway, then the spending report
  - moved the terminal and consent helpers from `backend/scripts/op-smoke.ts` into `backend/scripts/lib/smoke-io.ts`, with no behavior change
  - added the optional `DEMO_LIQUOR_WALLET_ADDRESS` to the demo category seed and `backend/.env.example`, with a test
  - documented the run in `backend/README.md` and `docs/04-open-payments-mapping.md`
- Prompt log: [prompts/009-compas-smoke.md](prompts/009-compas-smoke.md)
- Human review: Pending team review. Typecheck and all 122 tests pass. The script was only checked for loading and argument errors. It has not run against the test network; that needs the payer's consent in a browser.

### 2026-10-16 — Claude Code — COMPAS smoke test, one merchant wallet

- Tool: Claude Code (Claude Opus 5.5)
- Role: changed `backend/scripts/compas-smoke.ts` so `DEMO_MERCHANT_WALLET_ADDRESS` plays both the pharmacy and the liquor store, each in its own in-memory category service. Removed `DEMO_LIQUOR_WALLET_ADDRESS` from `backend/.env.example` and `backend/README.md`.
- Prompt log: [prompts/009-compas-smoke.md](prompts/009-compas-smoke.md), prompt 2
- Human review: Pending team review. Typecheck and all 122 tests pass. An offline check confirmed that each role resolves without a conflict. The script has not run against the test network.

## Entry template

### YYYY-MM-DD — Tool name

- Tool:
- Role:
- Prompt log:
- Human review:
- Notes:
