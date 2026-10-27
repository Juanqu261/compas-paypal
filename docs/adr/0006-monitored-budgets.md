# ADR 0006 — Monitored budgets

## Status

Accepted, 2026-10-16.

The rail changed on 2026-10-26: [ADR 0008](0008-paypal-rail-per-order-approval.md) replaces Open Payments with PayPal. Without a grant cap, the budget is checked against the charge before PayPal is called and reserved on `ALLOW`. A monitored exception is still a PayPal order the payer must approve, so "up to the grant cap" below now reads "up to the budget, with the payer's approval of each order".

## Context

A payer may not want COMPAS to block every purchase that fails the purpose checks. Merchant evidence is often weak: most small shops will start as `SELF_DECLARED`. Some payers prefer "let it through and show me where it went" to a card that fails at the counter.

The core invariant still has to hold: no outgoing payment unless policy returns `ALLOW`, and AI never authorizes.

## Decision

- When the payer creates a budget, they choose the purpose policy's `enforcement`: `ENFORCED` (the default) or `MONITORED` (the "allow even if not fully approved" tick).
- **The tick relaxes only the purpose checks**, meaning merchant category evidence and line items. In `MONITORED` mode those checks still run. Their result is stored on the decision as `purposeCheck` with `enforced: false`, and the outcome is `ALLOW`. When the purpose check failed, the decision also carries `PAYER_MONITORED_EXCEPTION`.
- **Mandate rules deny in both modes:** status, validity window, delegate and budget against the quoted debit. The payer's Open Payments grant (`limits.debitAmount`) caps the spend no matter what COMPAS decides.
- Every attempt, paid or not, is written to a spending log. The payer's spending report shows, per purchase:
  - the merchant wallet
  - the merchant's resolved categories and their trust levels
  - whether the purpose check matched
  - whether the payment was a monitored exception
  - the Open Payments payment reference
- The policy is still the only thing that returns `ALLOW`. The payer chose the rule in advance, and the rule is deterministic. No AI is involved.

## Consequences

- In `MONITORED` mode a liquor store can be paid from a medication budget, up to the grant cap. The payer sees it afterwards as a monitored exception.
- `ENFORCED` keeps the demo story: alcohol is `DENY` and never reaches Open Payments.
- Open Payments metadata doesn't change. It never says whether a payment matched its purpose.
- The spending log is in memory, like the grant store and the trust log. Remaining capacity on the mandate isn't updated yet. That needs the mandate repository.
