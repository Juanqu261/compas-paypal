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

## Entry template

### YYYY-MM-DD — Tool name

- Tool:
- Role:
- Prompt log:
- Human review:
- Notes:
