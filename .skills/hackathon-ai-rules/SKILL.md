---
name: hackathon-ai-rules
description: Explains, applies and audits the AI usage policy of the Open Payments Hackathon (Medellín, 16-17 Oct 2026) - mandatory AI_USAGE.md, prompt log in /prompts, verification duty, submission deadlines. Use when an agent or user is working in a hackathon repo, asks "can I use AI", what to disclose, how to log prompts, or before submitting/pushing the final code.
---

# Hackathon AI Rules (Open Payments Hackathon 2026)

Agent-agnostic: plain Markdown + one stdlib-only Python script (`python3`, or `python` on Windows, no installs). Source docs: `.pdf_md/Hackathon_Submission_Review_Process.md` (Part 02) and `.pdf_md/Hackathon_Survival_Guide.md` (FAQ).

## The rules in 30 seconds

1. **AI is allowed** (ChatGPT, Claude, Copilot, Cursor, Gemini...) for code, debugging, research, design, docs.
2. **Disclosure is mandatory**: `AI_USAGE.md` at the repo root.
3. **Prompt log is mandatory**: real prompt text (not summaries) in `/prompts/` (or inside `AI_USAGE.md` if short).
4. **Verify everything**: AI code may be buggy, insecure, outdated, or not the real Open Payments API. The team owns the repo.
5. **Don't delegate the whole project**: teams must understand what they built.
6. **Prep required**: Platzi Open Payments course OR the Survival Guide.
7. Open Payments API integration is required for eligibility; repo must be **public**; code deadline **Sat 17 Oct 2026, 11:00 (Medellín, UTC-5)**; demo/slides uploads close 12:00.

Details, exact wording and pitfalls: [REFERENCE.md](REFERENCE.md).

## Instructions for the AI agent (any agent)

When you are working in a hackathon repo, you are bound by these rules:

- Keep a running record: after each meaningful generation task, append the **verbatim user prompt** to `prompts/<area>.md` (`python3 scripts/ai_rules.py log <area> "<prompt>"`).
- Update `AI_USAGE.md` whenever you create/modify files: which tool, which file/function/component, and what the humans reviewed or rewrote.
- Never claim a file is human-written if you generated it. Never fabricate prompts or disclosure.
- Use the real Open Payments API (docs: openpayments.dev) and its SDKs; do not invent endpoints. Flow: wallet address -> incoming-payment grant -> incoming payment -> quote grant -> quote -> interactive outgoing-payment grant (GNAP) -> outgoing payment -> monitor.
- Prompt the human to test and understand AI output; flag anything you could not verify.

## Workflows

**Setup** (start of project): `python3 scripts/ai_rules.py init [repo_path]` - creates `AI_USAGE.md` and `prompts/` from [templates/](templates/) without overwriting existing files.

**During hacking**: `log` prompts as above; edit `AI_USAGE.md` sections.

**Before submitting** (before 11:00 Saturday):
```
python3 scripts/ai_rules.py check [repo_path]
```
Exit code 0 = compliant; non-zero lists problems (missing file, empty sections, no prompt log, placeholder text left, no Open Payments reference). Then manually confirm the checklist in REFERENCE.md (public repo, all branches pushed to main, form link submitted).

**Answering questions**: quote the rule from REFERENCE.md; if unsure, say so and point to hackathon mentors/Slack rather than guessing.
