# AI usage disclosure

Interledger Open Payments Hackathon 2026 requires disclosure of AI assistance and a copy of the prompts used for coding.

This file is the running log. Append a new dated entry when a tool is used or when its role changes. Do not rewrite earlier entries. Tools can include Cursor, ChatGPT, Claude, Gemini, or another assistant.

This log does not claim that any file was written without AI assistance. The team must review and understand AI-generated work before submission.

## How to add an entry

Copy the template, fill it in, and link the prompt file under `prompts/`.

## Tools Used

- Cursor (repository foundation and monorepo restructure)
- Claude Code (Claude Opus 5.5) (agent skills, Claude integration, and the ARQ, Nequi, and Nequi Negocios simulated surfaces)

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

### 2026-10-16 — Claude Code — Nequi Negocios COMPAS merchant configuration

- Tool: Claude Code (Claude Opus 5.5)
- Role:
  - merchant-side COMPAS UX inside the simulated Nequi Negocios app (`frontend/src/features/nequi-business/`)
  - Nequi Negocios `Conoce más` implementation: a services screen (`NequiBusinessMore.tsx`) reached from the bottom nav, which now shows the active tab (`NequiBusinessBottomNav.tsx`)
  - COMPAS merchant configuration UI (`NequiBusinessCompas.tsx`): an on/off switch, the establishment (Droguería Central), category checkboxes, a "how it works" section, and `Guardar configuración`
  - local frontend configuration state held in `NequiBusinessExperience.tsx`, with labels and defaults in `nequi-business-compas-demo.ts`. Saving updates component state only. It is not a backend enrollment, not a merchant-registry write, and not a real Nequi merchant verification.
  - no backend integration, no Open Payments integration, and no ALLOW/DENY/REVIEW decision in the browser
  - restructured this file under the section headings that `.skills/hackathon-ai-rules/scripts/ai_rules.py check` requires. Every earlier entry is kept word for word.
  - Claude Code also made commits `2f8635b` (the Nequi Negocios UI) and `c20646a` (the merge of `cf28a86`) at the team's request. It renumbered the Nequi Negocios prompt log to 006 and kept both new entries in this file. That request was a git instruction and is not in `prompts/`.
- Prompt log: [prompts/009-nequi-negocios-compas.md](prompts/009-nequi-negocios-compas.md)
- Human review: Pending team review. The categories and the enabled state are local `demo/test data`.

## What We Did Ourselves

- The product idea, the design-session answers, and the scope decisions came from the team. See the verbatim prompts in `prompts/002-agent-skills.md` and later prompt files.
- The team supplied the reference screenshots for ARQ, Nequi, and Nequi Negocios. The assistants did not collect them.
- The team made the commits and merges recorded in git history, except where an entry above says an assistant did the work.
- Human review of AI-generated code is pending for every entry above. This file does not mark any file as written without AI.
- Open Payments is not integrated yet. The integration belongs behind `OpenPaymentsGateway` in `backend/src/ports/open-payments-gateway.ts`. The current adapter, `backend/src/integrations/open-payments/unimplemented-open-payments-gateway.ts`, throws. Record who writes the real adapter, and how, when it lands.

## Prompt Log

Verbatim prompts for each AI coding session are in `/prompts/`, numbered in order:

- [prompts/001-repository-foundation.md](prompts/001-repository-foundation.md)
- [prompts/002-agent-skills.md](prompts/002-agent-skills.md)
- [prompts/003-monorepo-restructure.md](prompts/003-monorepo-restructure.md)
- [prompts/004-arq-ui.md](prompts/004-arq-ui.md)
- [prompts/005-nequi-ui.md](prompts/005-nequi-ui.md)
- [prompts/006-nequi-negocios-ui.md](prompts/006-nequi-negocios-ui.md)
- [prompts/009-nequi-negocios-compas.md](prompts/009-nequi-negocios-compas.md)

## Entry template

### YYYY-MM-DD — Tool name

- Tool:
- Role:
- Prompt log:
- Human review:
- Notes:
