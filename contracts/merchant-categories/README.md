# Merchant category contracts

Payloads of the merchant category service. Design and rules: `docs/plans/merchant-category-service.md` and `docs/adr/0005-merchant-category-attestations.md`.

A merchant's category belongs to its PayPal merchant id. It is never sent to PayPal, and a purchase intent never supplies it.

## Submit evidence

`POST /merchant-category-claims`

For push sources such as a wallet node. The body is one submission. Its shape is in [category-claim-submission.schema.json](category-claim-submission.schema.json). The `compas-signature` header carries an Ed25519 signature over the exact body bytes, encoded as base64url. The signature is the authentication. There is no session.

A submission has no `trustLevel` field, and one that includes it is refused. The source registry decides the trust level from `sourceId`.

```json
{
  "schemaVersion": "1",
  "sourceId": "wallet-kyb-sim/kyb",
  "submissionId": "demo-kyb-drogueria-central",
  "type": "CATEGORY_CLAIM",
  "subject": { "kind": "PAYPAL_MERCHANT", "paypalMerchantId": "DEMPHARMACY22" },
  "codes": [{ "system": "CIIU_REV4_AC", "code": "4773", "role": "PRIMARY" }],
  "observedAt": "2026-10-16T15:00:00Z",
  "evidenceRef": "demo-kyb-rut"
}
```

Entry types: `CATEGORY_CLAIM`, `LICENSE_CLAIM`, `IDENTITY_BINDING` (PayPal merchant to NIT), `REVOCATION` (one of the same source's own submissions) and `FLAG`.

| Status | Body | Meaning |
| --- | --- | --- |
| 202 | `{ "entryId": "…" }` | Recorded |
| 200 | `{ "entryId": "…", "duplicate": true }` | Same `sourceId` + `submissionId` and the same body was already recorded |
| 400 | `{ "error": "INVALID_SUBMISSION" \| "INVALID_CODE" \| "INVALID_IDENTIFIER", "message" }` | Shape, CIIU code or NIT is wrong |
| 401 | `{ "error": "UNKNOWN_SOURCE" \| "BAD_SIGNATURE", "message" }` | Not a registered push source, or the signature fails |
| 403 | `{ "error": "EVIDENCE_NOT_ALLOWED", "message" }` | The source may not assert this entry type, code system or license, or a non-merchant source self-declared |
| 409 | `{ "error": "SUBMISSION_ID_REUSED", "message" }` | Same `submissionId` with a different body |
| 413 | `{ "error": "BODY_TOO_LARGE" }` | Over 16 KiB |
| 422 | `{ "error": "REVOCATION_TARGET_NOT_FOUND", "message" }` | The source has no such submission to revoke |

## Read a merchant's categories

`GET /merchants/categories?paypalMerchantId=<PayPal merchant id>`

For the PayPal Business simulation and the demo screen. It returns COMPAS categories, trust levels and source ids. It never returns subject refs, NITs or trust-log entry ids. This is a view, not a policy decision.

```json
{
  "dataLabel": "demo/test data",
  "paypalMerchantId": "DEMPHARMACY22",
  "categories": [
    { "category": "MEDICATION", "trustLevel": "PROVIDER_VERIFIED", "sourceIds": ["wallet-kyb-sim/merchant", "wallet-kyb-sim/kyb"], "simulated": true },
    { "category": "PERSONAL_CARE", "trustLevel": "PROVIDER_VERIFIED", "sourceIds": ["wallet-kyb-sim/kyb"], "simulated": true }
  ],
  "declarations": [
    { "category": "MEDICATION", "corroboration": "PROVIDER_VERIFIED" }
  ],
  "conflicts": [],
  "flaggedCategories": [],
  "unmappedEvidence": [],
  "mappingVersion": "CIIU_REV4_AC@2026-10-16.1;LICENSE@2026-10-16.1",
  "resolvedAt": "2026-10-16T15:00:00.000Z"
}
```

`declarations` lists the categories the merchant declared itself and how independent evidence bears on each (`CONTRADICTED`, `UNCORROBORATED`, `REGISTRY_UNBOUND`, `PROVIDER_VERIFIED`, `EXTERNAL_VERIFIED`). Only a declared category can make a merchant eligible. The confidence also depends on purchase history, so it is computed at decision time and not shown here. See `docs/adr/0007-merchant-confidence-matrix.md`.

`dataLabel` appears when any evidence comes from a simulated source. `simulated: true` marks a category backed by a simulated source. The UI must label it "simulated wallet KYB attestation", never a PayPal or other real provider signal.

A missing or malformed `paypalMerchantId` returns `400 { "error": "INVALID_PAYPAL_MERCHANT_ID" }`. It is normalized first: trimmed and upper-cased.

## Demo merchants

`GET /demo/merchants`

demo/test data. The merchants a purchase may name (`contracts/purchases/README.md`), each with the same category view as above minus `paypalMerchantId`: the PayPal account stays on the server. No session is needed.

```json
{
  "dataLabel": "demo/test data",
  "categorySources": "REGISTERED",
  "merchants": [{ "id": "demo-merchant-drogueria-central", "displayName": "Droguería Central", "categories": [], "declarations": [], "conflicts": [], "flaggedCategories": [], "unmappedEvidence": [], "mappingVersion": "…", "resolvedAt": "…" }]
}
```

`categorySources: "NONE_REGISTERED"` means no evidence source that can support a category is registered, so every merchant has no category. That is the state with `MERCHANT_CATEGORY_DEMO_SEED=false`: the demo sources (`wallet-kyb-sim/*`, `camara-fixture`) are registered only with the seed on. COMPAS's own sources (`compas-analyst`, `compas-onboarding/merchant`) are always registered and can only flag or bind.

The demo merchants are Droguería Central, the liquor store and the lookalike Droguería Centrall (`DEMCENTRALL22`, self-declared `MEDICATION`, never a PayPal account).

The merchant is a PayPal sandbox business account when `DEMO_MERCHANT_PAYPAL_ID` (Droguería Central) or `DEMO_LIQUOR_PAYPAL_ID` (the liquor store) is set. Otherwise it is a demo id in PayPal's format that names no account (`DEMPHARMACY22`, `DEMLAGERBAR22`): COMPAS can evaluate a purchase there, but PayPal refuses the order.
