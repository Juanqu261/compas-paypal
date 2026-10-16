@AGENTS.md

## Claude Code

- Skills are exposed to Claude Code through thin wrappers in `.claude/skills/`. Each wrapper points to its agent-agnostic source in `.skills/`. Edit skill content only in `.skills/`. Touch a wrapper only when a skill's name or description changes.
- Load `compas-context` before product, policy, merchant-trust, demo or pitch work. Load `hackathon-ai-rules` before you log prompts, update `AI_USAGE.md` or prepare the submission.
