# AI usage disclosure

Interledger Open Payments Hackathon 2026 requires disclosure of AI assistance and a copy of the prompts used for coding.

This file is the running log. Append a new dated entry when a tool is used or when its role changes. Do not rewrite earlier entries. Tools can include Cursor, ChatGPT, Claude, Gemini, or another assistant.

This log does not claim that any file was written without AI assistance. The team must review and understand AI-generated work before submission.

## How to add an entry

Copy the template, fill it in, and link the prompt file under `prompts/`.

## Tools Used

- Cursor (repository foundation and monorepo restructure)
- Claude Code (Claude Opus 5.5) (agent skills, Claude integration, the Open Payments integration, the merchant category service and trust matrix, the Supabase schema and Postgres adapters, the ARQ, Nequi, and Nequi Negocios simulated surfaces, the site redesign with the third-party `frontend-design` skill, the COMPAS mandate experience, and its integration with `main`)

## Where and How We Used AI

The dated running log below is the detailed record: which tool, which files or components, and the review status of each session.

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

### 2026-10-16 — Claude Code — ARQ surface UI

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - ARQ UI recreation of the simulated payer wallet home (`frontend/src/features/arq/`)
  - frontend component implementation: `ArqExperience`, `ArqHome`, `ArqTopBar`, `ArqHero`, the home sections, `ArqBottomNav`, `ArqIcons`, `arq-demo-content.ts`
  - responsive mobile layout for `/arq` (`frontend/src/app/arq/page.tsx`) and an opt-in edge-to-edge mode in `frontend/src/components/phone/PhoneFrame.tsx` for `/demo`
  - visual adaptation from screenshots of the ARQ app provided by the team. The screenshots were not available to the assistant in this session, so the layout follows the written description in the prompt. No image or asset was copied or embedded.
  - COMPAS entry-point integration: one `COMPAS` row under `Otras formas de pago` that slides in a placeholder shell (`ArqCompasShell.tsx`). No mandate, policy, backend, or Open Payments logic.
  - restored this file, which merge commit `762d25a` deleted. The entries above are the union of both merge parents (`7904a12` and `397bef9`). The only change to them is the monorepo prompt link, which now points to `prompts/003-monorepo-restructure.md` after commit `397bef9` renamed it.
- Prompt log: [prompts/004-arq-ui.md](prompts/004-arq-ui.md)
- Human review: Pending team review. Compare the screens with the reference screenshots. Wallet amounts, card suffixes, transactions, and exchange-rate numbers are local `demo/test data`, not live values.

### 2026-10-16 — Claude Code — Nequi surface UI

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - Nequi UI recreation of the simulated delegate wallet (Andrea) in `frontend/src/features/nequi/`: `NequiExperience`, `NequiHome`, `NequiHero`, `NequiHomeSections`, `NequiBottomNav`, `NequiActionMenu`, `NequiScreen`, `NequiSendOptions`, `NequiCompasShell`, `NequiIcons`, `nequi-demo-content.ts`
  - visual adaptation from three screenshots of the Nequi app provided by the team (home, "$" action menu, "Opciones para enviar"). Icons and illustrations are hand-drawn SVG. No screenshot, logo or third-party asset was copied or embedded.
  - full-screen layout for `/nequi` (`frontend/src/app/nequi/page.tsx`, same wrapper as `/arq`). The Nequi phone in `/demo` now uses the edge-to-edge `PhoneFrame` mode (`frontend/src/features/demo/DemoStage.tsx`).
  - COMPAS entry point: a `Compas` tile under `Sugeridos Nequi` that slides in a placeholder shell. No mandate, policy, backend, or Open Payments logic.
  - focus fix in `frontend/src/features/arq/ArqCompasShell.tsx`: the shell now becomes visible as soon as it opens, so the back button gets focus and Escape closes it. Before the fix, focus stayed on the page body.
- Prompt log: [prompts/005-nequi-ui.md](prompts/005-nequi-ui.md)
- Human review: Pending team review. Compare the screens with the reference screenshots. The balance and promo copy are local `demo/test data`.

### 2026-10-16 — Claude Code — Nequi Negocios surface UI

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - Nequi Negocios UI recreation of the simulated merchant wallet (`frontend/src/features/nequi-business/`)
  - merchant frontend component implementation: `NequiBusinessExperience`, the home, sales-summary and link-payments screens, the NFC-fallback and QR bottom sheets, the bottom nav, icons, and `nequi-business-demo-content.ts`
  - responsive mobile layout for `/nequi-negocios` (`frontend/src/app/nequi-negocios/page.tsx`) and edge-to-edge Phone 3 in `frontend/src/features/demo/DemoStage.tsx`, reusing the existing generic `PhoneFrame` option
  - visual adaptation from four team-provided screenshots of the Nequi Negocios app. No screenshot, photo, logo, or other asset was copied or embedded. The UI is DOM, Tailwind, and inline SVG.
  - local demo interactions only: screen navigation and bottom sheets held in component state
  - the QR shown is a decorative pattern with no encoded payload. It is not a real payment QR.
  - no real Nequi, Nequi Negocios, Wompi, or Bre-B integration
  - no payment execution and no Open Payments implementation in this task
  - ran lint, typecheck and build with the Node runtime bundled with Cursor, because Node was not on PATH
- Prompt log: [prompts/006-nequi-negocios-ui.md](prompts/006-nequi-negocios-ui.md)
- Human review: Pending team review. Merchant name, sales amounts, dates, and the checkout link text are local `demo/test data`.

### 2026-10-16 — Claude Code — frontend design skill

- Tool: Claude Code (Claude Opus 5.5)
- Role: copied the third-party `frontend-design` skill from `anthropics/skills` (Apache-2.0, unchanged) into `.skills/frontend-design/`, wrote its wrapper `.claude/skills/frontend-design/SKILL.md` and listed it in `AGENTS.md`. No application code was changed.
- Prompt log: [prompts/007-frontend-design-skill.md](prompts/007-frontend-design-skill.md)
- Human review: Pending team review.

### 2026-10-16 — Claude Code — site redesign and transitions

- Tool: Claude Code (Claude Opus 5.5) with the `frontend-design` skill
- Role:
  - visual direction and implementation of the site around the phones: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/demo/page.tsx`, the `/arq`, `/nequi` and `/nequi-negocios` page wrappers, `components/phone/PhoneFrame.tsx`, `features/demo/DemoStage.tsx`, `features/site/` and `features/landing/`
  - React `<ViewTransition>` page slides along the story order, an anchored header, a moving nav marker, name morphs and readout crossfades
  - extended the display type in `demo/scenarios.ts` with line items, the merchant's category claims and the fixture's `expectedPolicyResult`. The landing page and `/demo` show that outcome labelled as the expected story outcome from demo/test data. The browser computes no policy decision.
  - the simulated apps inside the phones were not changed
- Prompt log: [prompts/008-site-redesign.md](prompts/008-site-redesign.md)
- Human review: Pending team review. Check the copy against the pitch guardrails in `.skills/compas-context/SKILL.md`.

### 2026-10-16 — Claude Code — merge main into open-payments

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - merged `origin/main` (`8da1554`) into `open-payments` and resolved two conflicts
  - `AI_USAGE.md`: kept the entries of both branches. Moved main's frontend-design and site-redesign entries above the template.
  - `frontend/src/demo/scenarios.ts`: kept this branch's `merchantDisplayName`, because the fixtures no longer carry category evidence, and kept main's `lineItems`, `amount` and `expectedPolicyResult`
  - `frontend/src/features/landing/PurposeDial.tsx`: reads `merchantDisplayName`, and reads the merchant's displayed category from the first line item, which matches the category the backend demo seed declares for that wallet
- Prompt log: [prompts/010-merge-main.md](prompts/010-merge-main.md)
- Human review: Pending team review. Prompt numbers 004, 006 and 008 now exist twice, once per branch.

### 2026-10-16 — Claude Code — merchant trust matrix

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - wrote the plan `docs/plans/trust-matrix.md`, then, after the team changed the framing, `docs/adr/0007-merchant-confidence-matrix.md` and the amendment note in ADR 0005
  - backend: declared-category corroboration and the NIT-bound-twice conflict in the resolver, the observation log, history grading, the trust matrix and its invariant checks, the revised merchant step and the per-purchase confidence cap, payer confirmations, and the Cámara de Comercio registry adapter against a provisional contract
  - replaced `acceptedTrustLevels` with `merchantConfidence` in the domain and the demo fixtures, added the demo tienda, and wrote the tests (122 → 173)
  - contracts `merchant-history/` and `merchant-registry/` (provisional), and updates to `docs/02`, `docs/05`, the READMEs and `.env.example`
- Prompt log: [prompts/011-trust-matrix.md](prompts/011-trust-matrix.md)
- Human review: Pending team review. The matrix cells and thresholds are untuned team choices. The registry contract is an assumption about another branch's database. The renewal deadline (31 March) is unverified. Payer confirmations have no authentication yet.

### 2026-10-16 — Claude Code — RUES merchant registry seed

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - web research: found the Confecámaras RUES open datasets on datos.gov.co (`nb3d-v3n7`, `c82u-588k`) and the open pharmacy-establishment lists of other departments
  - wrote `backend/scripts/fetch-rues-registry.ts` and the `registry:fetch` script in `backend/package.json`
  - generated `data/seeds/merchant-registry/rues-medellin.json` (1,900 establishments, CC BY-SA 4.0) and wrote its `README.md`
  - updated `data/seeds/README.md`, `.skills/compas-context/REFERENCE.md` and `docs/plans/merchant-category-service.md`, where the research note said no bulk RUES feed existed
  - after the trust-matrix merge (ADR 0007): wrote `backend/src/integrations/category-sources/json-business-registry-lookup.ts` and its test, added `MERCHANT_REGISTRY_FILE` to `data-paths.ts`, and answered the open questions in `contracts/merchant-registry/README.md`
- Prompt log: [prompts/012-rues-merchant-registry.md](prompts/012-rues-merchant-registry.md)
- Human review: Pending team review. The name-keyword figures in the seed README are a heuristic, not evidence. The CIIU titles in the mapping table are still unverified.

### 2026-10-16 — Claude Code — Supabase schema proposal

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - read the backend's ports and domain types, and listed the empty Supabase project's tables, migrations and extensions (read-only)
  - wrote the migration `data/migrations/20261017032839_compas_core.sql`, `data/schema/README.md` and `data/migrations/README.md`, and updated `data/README.md`
  - checked the migration on a throwaway Postgres 17 container with dummy rows
  - applied it to the team's Supabase project on the user's request (migration `20261017032839`), then checked RLS, grants and the security advisors
- Prompt log: [prompts/013-supabase-schema.md](prompts/013-supabase-schema.md)
- Human review: Pending team review. The schema is applied but empty. The backend has no database adapter yet.

### 2026-10-16 — Claude Code — Postgres adapters and budget reservation

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - added the `postgres` driver (3.4.9) and wrote the Postgres adapters in `backend/src/integrations/postgres/`
  - wired them into the server, the category and history factories, the Open Payments gateway factory and `scripts/compas-smoke.ts`
  - extended `MandateRepository` with `reserveCapacity`/`releaseCapacity`, added `InMemoryMandateRepository`, and made `purchaseUnderMandate` reserve the quoted debit before recording an `ALLOW`
  - made the HMAC key required with a database, made the demo seeds idempotent, and wrote `scripts/load-rues-registry.ts` (`npm run registry:load`)
  - fixed the `npm test` glob, which ran 18 of 27 test files. All 188 tests now run.
  - wrote `tests/integrations/postgres/postgres-adapters.test.ts` and reservation tests in `tests/application/purchase-under-mandate.test.ts`, and updated `backend/README.md`, `backend/.env.example` and `data/schema/README.md`
  - checked everything on a local Postgres 17 container. Nothing new was applied to Supabase.
  - fixed the database user in the local `backend/.env`, generated its HMAC key, loaded the Cámara de Comercio registry into Supabase, and wrote `contracts/data-model/README.md` for the frontend team
  - made the demo tienda's history seed also write its 12 food mandates and spending records in Postgres, made it resume after a partial start, seeded it at server startup, and ran it against Supabase
- Prompt log: [prompts/014-postgres-adapters.md](prompts/014-postgres-adapters.md)
- Human review: Pending team review. The server was started once against Supabase, and the registry was loaded there. The adapter tests ran only on the local container. Dropping the observation→spending foreign key is left to the team.

### 2026-10-16 — Claude Code — COMPAS experience: mandates and authorizations

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - created branch `feature/compas-experience` from `origin/open-payments` (`8a1aa24`) in a separate git worktree, so uncommitted work on another branch stayed untouched
  - backend: `MandateService` (`backend/src/application/mandates.ts`) for creating, authorizing, reading and revoking mandates, and `buildMandateActivity` (`backend/src/application/mandate-activity.ts`), which never counts a pending payment as paid
  - backend: HTTP routes in `backend/src/api/mandates.ts`, demo sessions in `backend/src/api/demo-identity.ts`, wiring in `backend/src/api/server.ts`, including the `onPayerGrantFinished` hook that activates a mandate after a verified consent
  - backend: ports `party-directory.ts` and `mandate-authorization-store.ts`, `listByPayer`/`listByDelegate` on `MandateRepository`, and in-memory adapters in `backend/src/integrations/mandates/`. No Postgres adapter: there was no `DATABASE_URL`
  - frontend: `frontend/src/features/compas/` (typed client and hooks, Spanish labels, amount and date input, wizard checks, shared components, payer and delegate modules, host themes), the ARQ and Nequi COMPAS shells, consent-return handling in `ArqExperience.tsx`, the `/compas-api` rewrite in `next.config.ts`, `allowImportingTsExtensions` in `tsconfig.json`, and an `npm test` script
  - tests: `backend/tests/application/mandates.test.ts`, `mandate-activity.test.ts`, `backend/tests/api/mandates.test.ts`, `frontend/tests/compas/lib.test.ts`
  - docs: `contracts/mandates/README.md`, `docs/plans/compas-experience.md`, and updates to `contracts/README.md`, `docs/03-architecture.md`, `backend/README.md`, `backend/src/api/README.md`, `backend/.env.example` and `frontend/README.md`
  - verification: drove ARQ, Nequi and `/demo` in headless Chrome. Active, revoked and activity screens were checked against a harness outside the repository that ran the real handlers with a fake provider and seeded spending records. That harness is not a payment test.
  - not changed: the Open Payments gateway, the policy engine, the trust matrix, the merchant registry and `frontend/src/features/nequi-business/`
- Prompt log: [prompts/015-compas-experience.md](prompts/015-compas-experience.md) (numbered 014 on the feature branch)
- Human review: Pending team review. No end-to-end run with a real wallet consent happened: no Open Payments credentials were available. Demo sessions let any caller act as any demo party, which is acceptable only on the test network.

### 2026-10-17 — Claude Code — integrating the COMPAS experience with main

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - committed the feature work on `feature/compas-experience` and merged it into a new branch, `integration/compas-experience`, from `origin/main` in a separate git worktree. Each conflict was resolved by hand. The log is in `docs/plans/compas-experience-integration.md`
  - backend: one `MandateRepository` with main's `reserveCapacity`/`releaseCapacity` plus `transitionStatus`, `listByPayer` and `listByDelegate`, on both the in-memory and the Postgres adapter. Status changes no longer rewrite the remaining capacity
  - backend: one grant store shared by the Open Payments gateway and `MandateService`. A mandate becomes ACTIVE only from a stored ACTIVE grant, and consent and cancellation state come from that store and the audit log. The feature's `MandateAuthorizationStore` and in-memory mandate store were removed
  - backend: `MandateService` uses the Postgres mandates, spending and audit adapters when `DATABASE_URL` is set. Demo sessions can't ask a wallet for a grant unless `COMPAS_DEMO_PAYER_GRANTS=enabled` on the test network, and never in production
  - frontend: the COMPAS contract types, a Spanish message for the new error code, and the demo note for Postgres storage
  - tests: `backend/tests/application/mandate-integration.test.ts` (concurrent reservations, status changes that keep a reservation, consent from the grant store, the demo grant policy), and updates to the mandate test kit and tests
  - renumbered the feature's prompt from 014 to 015, because main already had a prompt 014
  - then merged local `main` (`cb30773`, `72faff3`: the Nequi Negocios COMPAS settings) into the integration branch, kept its restructure of this file and its entry, and renumbered its prompt from 009 to 017, because `origin/main` already had a prompt 009
  - not changed: the Open Payments gateway, the policy engine, the Supabase schema and `frontend/src/features/nequi-business/`. No migration was run and no payment was made
- Prompt log: [prompts/016-compas-integration.md](prompts/016-compas-integration.md)
- Human review: Pending team review. The Postgres adapter tests skip without `TEST_DATABASE_URL`, and no end-to-end run with a real wallet consent happened.

### 2026-10-16 — Claude Code — Nequi Negocios COMPAS merchant configuration

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - merchant-side COMPAS UX inside the simulated Nequi Negocios app (`frontend/src/features/nequi-business/`)
  - Nequi Negocios `Conoce más` implementation: a services screen (`NequiBusinessMore.tsx`) reached from the bottom nav, which now shows the active tab (`NequiBusinessBottomNav.tsx`)
  - COMPAS merchant configuration UI (`NequiBusinessCompas.tsx`): an on/off switch, the establishment (Droguería Central), category checkboxes, a "how it works" section, and `Guardar configuración`
  - local frontend configuration state held in `NequiBusinessExperience.tsx`, with labels and defaults in `nequi-business-compas-demo.ts`. Saving updates component state only. It is not a backend enrollment, not a merchant-registry write, and not a real Nequi merchant verification.
  - no backend integration, no Open Payments integration, and no ALLOW/DENY/REVIEW decision in the browser
  - restructured this file under the section headings that `.skills/hackathon-ai-rules/scripts/ai_rules.py check` requires. Every earlier entry is kept word for word.
  - Claude Code also made commits `2f8635b` (the Nequi Negocios UI) and `c20646a` (the merge of `cf28a86`) at the team's request. It renumbered the Nequi Negocios prompt log to 006 and kept both new entries in this file. It later made `cb30773` (this entry's work) and the merge of `8da1554`: it renumbered this prompt log from 007 to 009 because 007 and 008 were taken, and moved the 007 and 008 entries, unchanged, from below the entry template into this log. Both requests were git instructions and are not in `prompts/`.
- Prompt log: [prompts/017-nequi-negocios-compas.md](prompts/017-nequi-negocios-compas.md) (numbered 009 on local `main`, renumbered 017 when it was merged with `origin/main`, which already had a prompt 009)
- Human review: Pending team review. The categories and the enabled state are local `demo/test data`.

### 2026-10-17 — Claude Code — frontend and backend integration

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - created branch `feature/compas-frontend-backend-integration` from `origin/main` (`09af6ec`) in the `compas-integration` worktree. No commit, push or merge
  - backend: `DelegatePurchaseService` (`backend/src/application/delegate-purchases.ts`) runs `purchaseUnderMandate` for an authenticated delegate. It reads the merchant's wallet from a server-side directory (`backend/src/ports/merchant-directory.ts`, `backend/src/integrations/merchants/demo-merchant-directory.ts`), checks the payer's grant, and keeps a retry with the same idempotency key from paying twice. A failure after the outgoing payment was requested is reported as unknown and not retried
  - backend: routes `POST /purchases/preview`, `POST /purchases` and `GET /demo/merchants` (`backend/src/api/purchases.ts`), wired in `server.ts` on the same mandates, grants and spending log as `MandateService`. `POST /purchases` is off for demo sessions unless `COMPAS_DEMO_PURCHASES=enabled` on the test network (`readDemoPurchasesMode`). `MandateService.forDelegatePurchase`, the `purchases` runtime fact, `merchantCategoryView` and the category service's `sourceCount`
  - diagnosed why `GET /merchants/categories` returned no category against Supabase: with `MERCHANT_CATEGORY_DEMO_SEED=false` no evidence source is registered, so the resolver ignores the trust-log entries. Read-only aggregate queries confirmed it. The setting was not changed
  - frontend: purchase contracts and client methods, a read timeout, hooks that never show data loaded for another key and report a failed refresh, Andrea's checkout (`delegate/DelegateCheckout.tsx`), a draft-only path in Pedro's wizard when the environment can't ask the wallet for a grant, currency warnings, Spanish texts for the new codes
  - frontend: Nequi Negocios merchant categories now use COMPAS categories (`HEALTH_WELLNESS` removed), and the COMPAS screen shows apart the local preferences, the declarations and corroborated categories COMPAS holds, and a simulated charge handed to Andrea's phone in the browser (`NequiBusinessCompasStatus.tsx`, `features/demo/demo-charge.ts`, `DemoSession.tsx`)
  - tests: `backend/tests/application/delegate-purchases.test.ts`, `backend/tests/api/purchases.test.ts`, `frontend/tests/compas/checkout.test.ts`. The concurrency test found a duplicate-payment race in the first version, fixed before delivery
  - docs: `contracts/purchases/README.md`, `contracts/mandates/README.md`, `contracts/merchant-categories/README.md`, `backend/src/api/README.md`, `backend/.env.example`, `docs/03-architecture.md`, `docs/05-policy-engine.md`; `.personal-docs/` added to `.gitignore`
  - verification: typecheck, tests, lint and build; an isolated backend on port 4100 with in-memory storage and no Open Payments client; the four routes loaded headless in Edge. Only read-only queries reached Supabase. No Open Payments call was made
  - not changed: the Open Payments gateway, the policy engine, `purchaseUnderMandate`, the Supabase schema, RLS, roles and every `.env` file
- Prompt log: [prompts/018-compas-frontend-backend-integration.md](prompts/018-compas-frontend-backend-integration.md)
- Human review: Pending team review. No purchase ran against a real wallet: the purchase flow was tested with in-memory repositories and a recording stand-in for Open Payments. The charge between Nequi Negocios and Nequi is a browser simulation, because merchants have no authentication yet.

## What We Did Ourselves

- The product idea, the design-session answers, and the scope decisions came from the team. See the verbatim prompts in `prompts/002-agent-skills.md` and later prompt files.
- The team supplied the reference screenshots for ARQ, Nequi, and Nequi Negocios. The assistants did not collect them.
- The team made the commits and merges recorded in git history, except where an entry above says an assistant did the work.
- Human review of AI-generated code is pending for every entry above. This file does not mark any file as written without AI.
- Open Payments is integrated behind `OpenPaymentsGateway` (`backend/src/ports/open-payments-gateway.ts`). The real adapter is `backend/src/integrations/open-payments/interledger-open-payments-gateway.ts`, written with Claude Code (see the Open Payments integration entry). `unimplemented-open-payments-gateway.ts` is the fallback when the client env is not set.

## Prompt Log

Verbatim prompts for each AI coding session are in `/prompts/`, numbered in order. Some numbers repeat because branches were numbered separately before they merged. A few entries above link prompt files that are not in the repository (see each entry):

- [prompts/001-repository-foundation.md](prompts/001-repository-foundation.md)
- [prompts/002-agent-skills.md](prompts/002-agent-skills.md)
- [prompts/003-monorepo-restructure.md](prompts/003-monorepo-restructure.md)
- [prompts/004-arq-ui.md](prompts/004-arq-ui.md)
- [prompts/004-open-payments-integration-plan.md](prompts/004-open-payments-integration-plan.md)
- [prompts/005-nequi-ui.md](prompts/005-nequi-ui.md)
- [prompts/006-merchant-category-service-plan.md](prompts/006-merchant-category-service-plan.md)
- [prompts/006-nequi-negocios-ui.md](prompts/006-nequi-negocios-ui.md)
- [prompts/007-frontend-design-skill.md](prompts/007-frontend-design-skill.md)
- [prompts/008-monitored-budgets.md](prompts/008-monitored-budgets.md)
- [prompts/008-site-redesign.md](prompts/008-site-redesign.md)
- [prompts/009-compas-smoke.md](prompts/009-compas-smoke.md)
- [prompts/011-trust-matrix.md](prompts/011-trust-matrix.md)
- [prompts/012-rues-merchant-registry.md](prompts/012-rues-merchant-registry.md)
- [prompts/013-supabase-schema.md](prompts/013-supabase-schema.md)
- [prompts/014-postgres-adapters.md](prompts/014-postgres-adapters.md)
- [prompts/015-compas-experience.md](prompts/015-compas-experience.md)
- [prompts/016-compas-integration.md](prompts/016-compas-integration.md)
- [prompts/017-nequi-negocios-compas.md](prompts/017-nequi-negocios-compas.md)
- [prompts/018-compas-frontend-backend-integration.md](prompts/018-compas-frontend-backend-integration.md)

## Entry template

### YYYY-MM-DD — Tool name

- Tool:
- Role:
- Prompt log:
- Human review:
- Notes:
