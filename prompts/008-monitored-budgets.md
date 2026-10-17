# 008 — Monitored budgets and the purchase flow on top of Open Payments

Tool: Claude Code (Claude Opus 5.5), 2026-10-16.

This is the verbatim user prompt, followed by the user's answers to the two clarifying questions.

## 1

```text
Now i want to expand the category definition and implementation, when i send a budget i may tick that the transaction may not be APPROVE totally but i still can see where it was spent and if the shop resolved to the categories; the way we resolve those categories will come from a confidence matrix (from RUE, people definitions etc...) that is what we build next, do not review it now. What i need now is that tick approval and how the layer of compas is on top of open payments (what we just did)
```

## Clarifying answers

- "When the payer ticks 'allow even if not fully approved' on a budget, which purchases should go through?": **Any merchant**. `REVIEW` and `DENY` purpose results both pay and are flagged. Only the Open Payments cap limits spending.
- "For 'how the COMPAS layer sits on top of Open Payments', what do you want from me?": **Wire it in code + doc**.
