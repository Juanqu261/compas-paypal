# ADR 0003 — AI is advisory

## Status

Accepted

## Context

Merchant and item categories will sometimes be ambiguous. A model can suggest a category. It must not be able to approve spending, because a prompt or a hallucinated label would then move money.

## Decision

`PurposeClassifier` returns a category, a confidence score, and evidence. The deterministic policy engine maps that output to `ALLOW`, `DENY`, or `REVIEW`. Low confidence fails closed. No AI vendor is chosen in this scaffold. The Open Payments gateway is unreachable from the classifier.

## Consequences

A future provider is an adapter behind the port. Changing models does not change the mandate or the payment flow. The engine must treat `REVIEW` as "do not pay."
