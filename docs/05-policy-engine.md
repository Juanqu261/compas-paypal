# Policy engine

The deterministic rules are implemented in `backend/src/policy/evaluate-purchase.ts`. `purchaseUnderMandate` in `backend/src/application/purchase-under-mandate.ts` runs them around the Open Payments calls. The AI classifier step is not wired: a line item without a category gives `REVIEW`. The step names are `POLICY_EVALUATION_ORDER` in `backend/src/policy/evaluation-order.ts`. The budget check runs after the quote, because only the quote knows the debit in the payer's asset.

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
- the delegate on the intent is not the mandate's delegate (`DELEGATE_NOT_AUTHORIZED`)
- the amount exceeds `remainingAuthorizedAmount` (`BUDGET_EXCEEDED`)
- merchant or line category is outside the purpose policy (`PURPOSE_MISMATCH` or `MERCHANT_NOT_ELIGIBLE`)

A merchant choosing "I sell medication" is a `SELF_DECLARED` claim. That claim is evidence with a low trust level, not proof. Higher trust levels are `PROVIDER_VERIFIED` and `EXTERNAL_VERIFIED`.

### Merchant category step

The merchant step is implemented as a pure function, `evaluateMerchantCategoryEvidence` in `backend/src/policy/merchant-category-evidence.ts`. The evaluator calls `MerchantRegistry.resolve(intent.merchantWalletAddressUrl)` at decision time, then passes the result and the mandate's purpose policy. Rows are checked top to bottom:

| Condition | Result |
| --- | --- |
| A conflict or flag touches an eligible category | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` |
| An eligible category at an accepted trust level | PASS: go on to line items |
| An eligible category, but only below `acceptedTrustLevels` | `REVIEW`, `MERCHANT_EVIDENCE_INSUFFICIENT` |
| No eligible category | `DENY`, `MERCHANT_NOT_ELIGIBLE` |

PASS is not `ALLOW`. Line items still decide. For the alcohol story the merchant step gives `MERCHANT_NOT_ELIGIBLE`, and the line items give `PURPOSE_MISMATCH`. A decision can carry both reasons.

Amount checks compare minor-unit strings for the same asset. They must not treat `remainingAuthorizedAmount` as a wallet balance. Cross-currency cost comes from an Open Payments quote later, not from a rate inside the policy engine.

### Enforcement mode

The rules above split into two groups:

- **Mandate rules** (status, validity window, delegate, budget) always `DENY`.
- **Purpose checks** (merchant category evidence and line items) decide the outcome only when `purposePolicy.enforcement` is `ENFORCED`.

In `MONITORED` mode, the payer's "allow even if not fully approved" tick, the purpose result is stored as `purposeCheck` with `enforced: false`. The outcome is then `ALLOW`, plus `PAYER_MONITORED_EXCEPTION` when the check failed. See [ADR 0006](adr/0006-monitored-budgets.md).

Line-item categories come from the merchant's point of sale, so they are weaker than merchant evidence. A line outside the purpose gives `PURPOSE_MISMATCH` (`DENY`).

## AI only when evidence is insufficient

If merchant and line data already determine the category, the classifier is not called. If the category is still ambiguous, `PurposeClassifier` may return a category, a confidence score, and a reason. The deterministic engine then maps that structured result to `ALLOW`, `DENY`, or `REVIEW`.

Low confidence fails closed. For the MVP, that means `REVIEW` or `DENY`, not a silent `ALLOW`. `CLASSIFICATION_UNCERTAIN` is the reason code for that case.

The classifier interface cannot return a policy outcome. See [06-ai-classification.md](06-ai-classification.md).

## The gate

`outgoingPaymentMayProceed` is true only for `ALLOW`. `createOutgoingPaymentIfAllowed` returns without calling the gateway for every other outcome. That function is the scaffold's enforcement of the core invariant:

No outgoing payment is initiated before COMPAS policy evaluation returns `ALLOW`.

`REVIEW` is not an approval. It does not start a payment.

## Not in this scaffold

The AI classifier step, remaining-capacity updates on the mandate (that needs the mandate repository) and HTTP routes for purchases.

There is no rule implementation, no split-tender calculation, and no partial approval of a mixed basket. Mixed-basket behavior is described in [02-domain-model.md](02-domain-model.md) and stays future work.
