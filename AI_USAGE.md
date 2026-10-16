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

### 2026-10-16 — Claude Code (Claude integration)

- Tool: Claude Code (Claude Opus 5.5)
- Role: wrote `CLAUDE.md` (imports `AGENTS.md`) and the wrapper skills `.claude/skills/compas-context/SKILL.md` and `.claude/skills/hackathon-ai-rules/SKILL.md`, which point to `.skills/`. `.skills/` was not changed.
- Prompt log: [prompts/002-agent-skills.md](prompts/002-agent-skills.md), prompts 11–12
- Human review: Pending team review.

## Entry template

### YYYY-MM-DD — Tool name

- Tool:
- Role:
- Prompt log:
- Human review:
- Notes:
