# AI classification

AI is a fallback classifier. It is not the decision maker, and it never authorizes money.

The checkout classifier is still not wired. `PurposeClassifier` in `backend/src/ports/purpose-classifier.ts` is provider-agnostic, and `UnimplementedPurposeClassifier` rejects every call. It does not return a pretend category. A line whose SKU has a verified CUM is classified without any model (see "The AI analyst" below).

## The AI analyst

The analyst researches merchants ahead of time and never runs inside a checkout. [ADR 0009](adr/0009-ai-analyst-evidence.md) is the decision. In short:

- **Vendor:** Elastic. CUM candidates come from an Elasticsearch index of INVIMA's public CUM dataset. The model is Claude (`claude-haiku-5-5`) through the Claude API when `ANTHROPIC_API_KEY` is set, else a `chat_completion` endpoint of Elastic's Inference API, behind the `AnalystModel` port (`backend/src/ports/analyst-model.ts`). Unconfigured, both throw.
- **Pointers** ("SKU x is CUM y", a certificate's verification code) count only once a deterministic verifier re-reads them from the source: INVIMA's dataset, or the Cámara de Comercio.
- **Judgments** ("most of this catalog is gift cards") can only become a `FLAG`, which gives `REVIEW`. A human reviewer withdraws flags; the analyst never does.
- **Medicine only.** CUM is the registry for this MVP's one category, medicine. Another category, such as food, may need another registry with its own validation codes (ADR 0009).
- **What the analyst sees:** merchant catalogs and uploaded certificates, inside delimited data blocks. Never an errand, a payer, a delegate, a mandate or a purchase.

The errand drafter uses the same model port with its own prompt. It sees the delegate's words, with their consent, and only drafts: the delegate confirms every field ([ADR 0010](adr/0010-errands.md)).

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

The classifier must not call `PayPalGateway`, create an order, or choose a policy outcome. A prompt that tells a model to "approve the payment" does not belong in this architecture.

## What the model should see

A future checkout classifier request should carry the merchant categories and trust levels resolved by `MerchantRegistry`, and the line descriptions on the purchase intent. It should not receive a medical history. The medication purpose can be evaluated from item and merchant categories without sending Gladys's diagnosis to a model or to PayPal.

Human review of AI-generated code, and of any future model output used in the demo, stays with the team.
