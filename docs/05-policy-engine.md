# Policy engine

The policy engine does not exist yet. This document is the order a later evaluator must follow. The step names are `POLICY_EVALUATION_ORDER` in `backend/src/policy/evaluation-order.ts`.

```text
payment intent
  -> mandate exists?
  -> mandate active?
  -> delegate eligible?
  -> within time restrictions?
  -> budget sufficient?
  -> merchant/category deterministic evidence?
  -> item/category deterministic evidence?
  -> if still ambiguous: AI classifier
  -> policy decision
  -> ONLY IF ALLOWED: Open Payments flow
```

## Deterministic rules first

The evaluator reads the purchase intent and the mandate. It stops with `DENY` when a hard rule fails, for example:

- no mandate, or a status other than `ACTIVE` (`MANDATE_INACTIVE`)
- outside `validFrom` / `expiresAt` (`MANDATE_EXPIRED`)
- the delegate on the intent is not the mandate's delegate
- the amount exceeds `remainingAuthorizedAmount` (`BUDGET_EXCEEDED`)
- merchant or line category is outside the purpose policy (`PURPOSE_MISMATCH` or `MERCHANT_NOT_ELIGIBLE`)

A merchant choosing "I sell medication" is a `SELF_DECLARED` claim. That claim is evidence with a low trust level, not proof. Higher trust levels are `PROVIDER_VERIFIED` and `EXTERNAL_VERIFIED`. Verification is not implemented.

Amount checks compare minor-unit strings for the same asset. They must not treat `remainingAuthorizedAmount` as a wallet balance. Cross-currency cost comes from an Open Payments quote later, not from a rate inside the policy engine.

## AI only when evidence is insufficient

If merchant and line data already determine the category, the classifier is not called. If the category is still ambiguous, `PurposeClassifier` may return a category, a confidence score, and a reason. The deterministic engine then maps that structured result to `ALLOW`, `DENY`, or `REVIEW`.

Low confidence fails closed. For the MVP, that means `REVIEW` or `DENY`, not a silent `ALLOW`. `CLASSIFICATION_UNCERTAIN` is the reason code for that case.

The classifier interface cannot return a policy outcome. See [06-ai-classification.md](06-ai-classification.md).

## The gate

`outgoingPaymentMayProceed` is true only for `ALLOW`. `createOutgoingPaymentIfAllowed` returns without calling the gateway for every other outcome. That function is the scaffold's enforcement of the core invariant:

No outgoing payment is initiated before COMPAS policy evaluation returns `ALLOW`.

`REVIEW` is not an approval. It does not start a payment.

## Not in this scaffold

There is no rule implementation, no split-tender calculation, and no partial approval of a mixed basket. Mixed-basket behavior is described in [02-domain-model.md](02-domain-model.md) and stays future work.
