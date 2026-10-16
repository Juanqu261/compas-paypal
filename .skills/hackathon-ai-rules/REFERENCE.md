# Reference: Hackathon AI Policy (full detail)

Source: "Proceso de entrega y revisión", Part 02 "Política de IA para hackatones", plus Survival Guide FAQ. Original docs are in Spanish; this is a faithful English summary.

## 1. AI tools are allowed
Participants may use AI tools (ChatGPT, Claude, GitHub Copilot, Cursor, Gemini, etc.) throughout the hackathon: frontend/backend coding, debugging, research, design, drafting documents - **provided the hackathon's disclosure requirements are met**.

## 2. Disclosure: `AI_USAGE.md` (mandatory, repo root)
Must state:
- Which AI tool(s) were used.
- What they were used for.
- Where in the project: specific files, functions or components - or "the whole project" if no file was written without AI.
- Files where little or no AI was used (e.g. the Open Payments service file).

Reference structure (from the official example): `Tools Used` / `Where and How We Used AI` (numbered by area, with file paths, and what humans reviewed/rewrote) / `What We Did Ourselves` / `Prompt Log` (pointer to `/prompts/...`). See [templates/AI_USAGE.md](templates/AI_USAGE.md).

## 3. Prompt log (mandatory)
- Folder `/prompts` (e.g. `/prompts/backend-payments.md`), or appended to `AI_USAGE.md` if short.
- Must contain the **actual prompt text** sent to the AI, not a summary.
- Every AI tool should be able to export its prompt history - use that.

## 4. Recommendations (not enforced mechanically, but judged)
- "Work with AI, don't make it work in your place." Don't delegate the entire project; value is in understanding what you built.
- "Trust but verify": review, test and understand all AI output before publishing. Typical failure modes: subtle bugs, insecure code, outdated APIs, code that isn't the Interledger Open Payments API. The team is responsible for the repo regardless of author.

## 5. Mandatory preparation
Before the hackathon (or before submitting), complete ONE of:
- Platzi course "Open Payments con Interledger" (Spanish only; pass the final exam, retry after 6h if failed), or
- Read the Hackathon Survival Guide (EN/ES).

## 6. Related submission rules
| Item | Rule |
|---|---|
| Open Payments | Mandatory API integration, else not eligible for evaluation/prizes |
| Repo | Public GitHub (private not considered unless approved by organizers) |
| Code deadline | Sat 17 Oct 2026, 11:00 - no code changes afterwards |
| Content | All code written during the hackathon; all branches pushed to `main`; nothing left on local machines |
| Submission | Repo link via Google Form shared in the hackathon Slack |
| Demo + slides | Upload to the public repo or Google Drive (link in Slack) by 12:00; one laptop per room |
| Demo must show | Payment request -> authorization (consent) -> execution -> successful completion |
| Presentation covers | Challenge, user, solution, how Open Payments was used, key learnings |
| Review | 11:00-12:00: technical mentors review code; Spanish-speaking reviewers check demo videos and slides |

## 7. Pre-submit checklist
- [ ] `AI_USAGE.md` at root, no placeholder text, files/functions named
- [ ] `/prompts` has real prompt text for each AI-assisted area
- [ ] Humans reviewed/tested AI code; team can explain it
- [ ] Open Payments API actually used end-to-end (not mocked)
- [ ] Repo public; all branches merged/pushed to `main`; before 11:00 Sat
- [ ] Repo link submitted via Slack form; demo + slides uploaded before 12:00
- [ ] Prep (Platzi course or Survival Guide) completed
- [ ] No secrets/private keys committed (wallet keys, `.env`)
