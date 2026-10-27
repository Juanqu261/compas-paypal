# Policy engine

The deterministic rules are implemented in `backend/src/policy/evaluate-purchase.ts`. `purchaseUnderMandate` in `backend/src/application/purchase-under-mandate.ts` runs them before the PayPal order. The AI classifier step is not wired: a line item without a category gives `REVIEW`. The step names are `POLICY_EVALUATION_ORDER` in `backend/src/policy/evaluation-order.ts`. The budget check reads the charge itself: the PayPal order is for exactly that amount, in that asset.

```text
payment intent
  -> mandate exists?
  -> mandate active?
  -> delegate eligible?
  -> within time restrictions?
  -> budget sufficient?
  -> merchant/category deterministic evidence?
  -> item/category deterministic evidence? (a SKU's verified CUM counts)
  -> under an errand: does every line fit it?
  -> if still ambiguous: AI classifier (not wired: REVIEW)
  -> policy decision
  -> ONLY IF ALLOWED: one PayPal order, which the payer approves at PayPal
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

The merchant step is implemented as a pure function, `evaluateMerchantCategoryEvidence` in `backend/src/policy/merchant-category-evidence.ts`. At decision time the evaluator calls `MerchantRegistry.resolve(intent.paypalMerchantId)`, loads a history summary for each eligible category the merchant declared, and passes both with the mandate's purpose policy. The trust matrix gives each declared category a confidence ([ADR 0007](adr/0007-merchant-confidence-matrix.md)). Rows are checked top to bottom:

| Condition | Result |
| --- | --- |
| A conflict or flag touches an eligible category | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` |
| The merchant declared no eligible category | `DENY`, `MERCHANT_NOT_ELIGIBLE` |
| The best declared category is `CONTESTED` | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` (independent evidence contradicts it) or `MERCHANT_HISTORY_CONTRADICTS` (payers or the shop's own lines do) |
| Confidence at or above `merchantConfidence.minimum` | PASS: go on to line items |
| Otherwise | `REVIEW`, `MERCHANT_EVIDENCE_INSUFFICIENT` |

A merchant that passed below `HIGH` must also fit the mandate's optional `maxDebitBelowHigh`, checked against the charge. Over it, or in another asset, gives `REVIEW` with `MERCHANT_CONFIDENCE_LIMIT_EXCEEDED`. The purpose check stores the confidence record (corroboration, history grade, matrix version and history summary), so a decision can be replayed.

PASS is not `ALLOW`. Line items still decide. For the alcohol story the merchant step gives `MERCHANT_NOT_ELIGIBLE`, and the line items give `PURPOSE_MISMATCH`. A decision can carry both reasons.

Amount checks compare minor-unit strings for the same asset. They must not treat `remainingAuthorizedAmount` as a PayPal balance. A charge in another asset than the budget fails closed: COMPAS does not convert.

### Enforcement mode

The rules above split into two groups:

- **Mandate rules** (status, validity window, delegate, budget) always `DENY`.
- **Purpose checks** (merchant category evidence, the confidence cap and line items) decide the outcome only when `purposePolicy.enforcement` is `ENFORCED`.

In `MONITORED` mode, the payer's "allow even if not fully approved" tick, the purpose result is stored as `purposeCheck` with `enforced: false`. The outcome is then `ALLOW`, plus `PAYER_MONITORED_EXCEPTION` when the check failed. See [ADR 0006](adr/0006-monitored-budgets.md).

Line-item categories come from the merchant's point of sale, so they are weaker than merchant evidence. A line outside the purpose gives `PURPOSE_MISMATCH` (`DENY`).

### Lines named by SKU: the CUM step

A cart line may name the merchant's SKU (`catalogItemId`). The backend reads the SKU's CUM from the merchant's catalog mapping, and only a `VERIFIED` mapping whose SKU text is unchanged counts (`backend/src/application/catalog-mappings.ts`). A line with no category whose SKU has such a mapping is `MEDICATION`: that is the deterministic first step of classification, with no model at checkout. A category the merchant gave is kept, so its own label can still contradict. See [ADR 0009](adr/0009-ai-analyst-evidence.md).

### Errands

A purchase may name an errand the delegate confirmed (`errandId`). `checkErrand` in `backend/src/policy/errand-check.ts` is pure:

| Condition | Result |
| --- | --- |
| The errand belongs to another mandate or delegate | `DENY`, `DELEGATE_NOT_AUTHORIZED` |
| The errand is cancelled or expired | `REVIEW`, `ERRAND_MISMATCH` |
| A line has no verified CUM, or its CUM is on no errand item | `REVIEW`, `ERRAND_MISMATCH` |
| An item's units, plus what earlier purchases still hold, exceed `maxUnits` | `REVIEW`, `ERRAND_MISMATCH` |
| The amount, plus what earlier purchases still hold, exceeds `maxAmount` | `REVIEW`, `ERRAND_MISMATCH` |

`ERRAND_MISMATCH` is a **hold**: it turns an `ALLOW` into `REVIEW` even under `MONITORED`, because the errand is the delegate's own confirmed action and not a purpose rule. An `ALLOW` reserves the cart's units after the capacity, atomically; they are given back wherever the capacity is. See [ADR 0010](adr/0010-errands.md).

## AI only when evidence is insufficient

If merchant and line data already determine the category, the classifier is not called. If the category is still ambiguous, `PurposeClassifier` may return a category, a confidence score, and a reason. The deterministic engine then maps that structured result to `ALLOW`, `DENY`, or `REVIEW`.

Low confidence fails closed. For the MVP, that means `REVIEW` or `DENY`, not a silent `ALLOW`. `CLASSIFICATION_UNCERTAIN` is the reason code for that case.

The classifier interface cannot return a policy outcome. See [06-ai-classification.md](06-ai-classification.md).

## The gate

`paymentMayProceed` is true only for `ALLOW`. `createPayPalOrderIfAllowed` returns without calling the gateway for every other outcome. That function is the enforcement of the core invariant:

No PayPal order is created before COMPAS policy evaluation returns `ALLOW`.

`REVIEW` is not an approval. It does not create an order. An order itself moves no money: the payer approves it at PayPal, and `PayPalOrderSettlement` captures it only after checking the mandate and the order again.

## Not in this scaffold

The AI classifier step. `POST /purchases` runs `purchaseUnderMandate` with the mandate repository, so an `ALLOW` reserves capacity. `POST /purchases/preview` runs every check before PayPal, reserves nothing and is not a decision (`contracts/purchases/README.md`).

There is no rule implementation, no split-tender calculation, and no partial approval of a mixed basket. Mixed-basket behavior is described in [02-domain-model.md](02-domain-model.md) and stays future work.
