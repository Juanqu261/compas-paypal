# AI classification

AI is a fallback classifier. It is not the decision maker, and it never authorizes money.

No vendor is selected. `PurposeClassifier` in `backend/src/ports/purpose-classifier.ts` is provider-agnostic. `UnimplementedPurposeClassifier` rejects every call. It does not return a pretend category.

## Order

```text
structured merchant and item data
  -> deterministic classification
  -> if evidence is insufficient
  -> AI classification
  -> structured output: category, confidence, evidence
  -> COMPAS policy engine
  -> ALLOW, DENY, or REVIEW
```

The model output is an input to the policy engine. The engine applies the mandate. A confident classification of `ALCOHOL` against a `MEDICATION` mandate is a `DENY`. A weak classification does not become spending permission.

## Fail closed

Low-confidence results must not silently allow spending. The MVP default is `REVIEW` or `DENY`, with reason `CLASSIFICATION_UNCERTAIN`.

The classifier must not call `OpenPaymentsGateway`, create a grant, or choose a policy outcome. A prompt that tells a model to "approve the payment" does not belong in this architecture.

## What the model should see

A future request should carry the merchant categories and trust levels resolved by `MerchantRegistry`, and the line descriptions on the purchase intent. It should not receive a medical history. The medication purpose can be evaluated from item and merchant categories without sending Gladys's diagnosis to a model or to Open Payments.

Human review of AI-generated code, and of any future model output used in the demo, stays with the team. See [08-hackathon-compliance.md](08-hackathon-compliance.md).
