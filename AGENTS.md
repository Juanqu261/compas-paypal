# COMPAS

Read these before a significant change:

- `.AGENTS/product.md`
- `.AGENTS/architecture.md`
- `.AGENTS/development.md`
- `.AGENTS/open-payments.md`
- `.AGENTS/hackathon.md`

## Invariants

- COMPAS is non-custodial. It moves permission, not money.
- Permission is delegated. Money is not transferred to the delegate.
- Policy must return ALLOW before any outgoing payment.
- AI never authorizes payments.
- Purpose categories belong to COMPAS. `MEDICATION` is not an Open Payments scope.
- Open Payments must never be faked.
- ARQ, Nequi, and Nequi Negocios surfaces are simulations.
- New AI coding prompts are copied into `prompts/`, and `AI_USAGE.md` is updated when a tool's role changes.
- The frontend and the backend do not import each other's source. Shared contracts belong in `contracts/`.

## Skills

Agent-agnostic skills live in `.skills/`. Before a task that matches a skill's description, read its `SKILL.md`, and read its other files only when needed. This file and `docs/` take precedence over any skill.

- `.skills/compas-context/` covers product rationale, design decisions, the scope ladder, Colombian research and pitch guardrails. Read it before product, policy, merchant-trust, demo or pitch work.
- `.skills/hackathon-ai-rules/` covers the hackathon AI policy, prompt logging and the pre-submission check (`python .skills/hackathon-ai-rules/scripts/ai_rules.py check .`). Keep this repo's numbered `prompts/NNN-*.md` convention.
- `.skills/frontend-design/` (from `anthropics/skills`, Apache-2.0) covers aesthetic direction, typography and layout for distinctive UI. Read it before visual design work on COMPAS's own surfaces. The ARQ, Nequi and Nequi Negocios simulations follow their reference screenshots instead.
