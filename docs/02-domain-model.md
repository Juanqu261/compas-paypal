# Domain model

Types live in `backend/src/domain/`. They describe the model. They do not persist it or move money.

## Terms

| Term | Meaning |
| --- | --- |
| Mandate | A payer's grant of limited capacity for a delegate to cause future payments under a purpose policy. |
| Payer | The party whose wallet will eventually pay. |
| Delegate | The party who may initiate a payment under the mandate. Not the payee. |
| Beneficiary | The person or purpose the spending is for. Not necessarily a wallet holder. |
| Budget | The maximum amount the mandate may authorize, as a `MoneyAmount`. |
| Remaining authorized amount | Unused authorization capacity. Not a wallet balance. |
| Purpose policy | Allowed purposes, eligible categories, the merchant trust levels the mandate accepts, and `enforcement` (`ENFORCED` or `MONITORED`). A COMPAS concept, not an Open Payments scope. |
| Merchant profile | A wallet address plus the categories resolved for it, each with a trust level. Built by COMPAS, never supplied by an intent. |
| Purchase intent | A proposed purchase a delegate wants the mandate to fund. It names the merchant by its Open Payments wallet address. |
| Spending record | One purchase attempt as the payer sees it: merchant wallet, resolved categories, purpose check, decision, monitored exception and Open Payments references. No line-item descriptions. |
| Trust log | Append-only record of merchant category evidence: claims, licenses, identity bindings, revocations and flags. |
| Policy decision | `ALLOW`, `DENY`, or `REVIEW`, with reasons. |
| Audit event | A reconstructable record of a material action or decision. |

`MoneyAmount.value` is an integer amount in minor units, stored as a decimal string. `assetScale` says where the decimal point goes. USD 40 is `{ value: "4000", assetCode: "USD", assetScale: 2 }`.

## Mandate

A mandate has:

- `id`
- `payer`, `delegate`, `beneficiary`
- `budget`
- `remainingAuthorizedAmount`
- `purposePolicy`
- `status`
- `validFrom`, `expiresAt`, `createdAt`

Statuses:

`DRAFT`, `PENDING_AUTHORIZATION`, `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED`

`ACTIVE` means the payer's authorization is in force and capacity remains. `EXHAUSTED` means the authorized capacity is used up. Neither state means COMPAS is holding funds.

## Merchant evidence

Merchant categories are evidence attached to the payee's wallet address, recorded in the trust log. See [ADR 0005](adr/0005-merchant-category-attestations.md) and `docs/plans/merchant-category-service.md`.

The registered source sets the trust level, never the claim itself:

- `SELF_DECLARED` — the merchant said so, relayed by its wallet. Insufficient on its own.
- `PROVIDER_VERIFIED` — the wallet provider attested it after KYB, for example the CIIU code on the merchant's RUT.
- `EXTERNAL_VERIFIED` — an independent issuer attested it: RUES, a territorial health authority's pharmacy registry, or a program operator.

External evidence is a CIIU Rev. 4 A.C. code or a license type such as `CO_PHARMACY_ESTABLISHMENT`. Versioned tables in `data/seeds/category-mappings/` map it to COMPAS categories (`MEDICATION`, `FOOD`, `PERSONAL_CARE`, `ALCOHOL`, `TOBACCO`). Evidence keyed by NIT joins a wallet only through an identity binding, capped at the binding's level. A NIT is stored only as an HMAC.

Volume never raises trust. Contradicting verified claims and flags lead to `REVIEW`.

### Declared categories and confidence

The merchant declares its categories at registration. Only a declared category can make it eligible. COMPAS gives each declared category a **confidence**: `CONTESTED`, `LOW`, `MEDIUM` or `HIGH`. A versioned trust matrix over two axes produces it. See [ADR 0007](adr/0007-merchant-confidence-matrix.md) and `docs/plans/trust-matrix.md`.

- **Corroboration**: how independent evidence bears on the declaration. `CONTRADICTED`, `UNCORROBORATED`, `REGISTRY_UNBOUND` (the Cámara agrees through a NIT the merchant typed), `PROVIDER_VERIFIED` or `EXTERNAL_VERIFIED`.
- **History**: distinct payers who confirmed a paid purchase, or contradicted it. `CONTRADICTED`, `NONE`, `EMERGING` or `ESTABLISHED`. The merchant's own line labels can only contradict.

History never changes a trust level, and it never lifts a category to `HIGH` on its own. A mandate sets `purposePolicy.merchantConfidence.minimum`, plus an optional per-purchase cap for merchants below `HIGH`.

Observations of paid purchases and payer verdicts live in their own append-only log. They hold categories and HMAC refs only, never line descriptions, product names, amounts or party ids.

Every source in the MVP is simulated. The backend seeds a Nequi Negocios simulation for the demo wallets in `data/fixtures/demo/`, labeled `demo/test data`, plus a *tienda* with fabricated confirmed history. The Cámara de Comercio registry lookup and the health-registry feed throw.

A later mixed basket can mark lines independently. Acetaminophen and losartan can be `MEDICATION` while shampoo is `PERSONAL_CARE`. A future rule could fund only the eligible subtotal. Split tender is not implemented.

## Policy decision

Outcomes: `ALLOW`, `DENY`, `REVIEW`.

Reason codes in this scaffold:

- `MANDATE_INACTIVE`
- `MANDATE_EXPIRED`
- `BUDGET_EXCEEDED`
- `PURPOSE_MISMATCH`
- `MERCHANT_NOT_ELIGIBLE`
- `CLASSIFICATION_UNCERTAIN`
- `MERCHANT_EVIDENCE_INSUFFICIENT` — an eligible category exists, but only below the mandate's accepted trust levels
- `MERCHANT_EVIDENCE_CONFLICT` — verified claims contradict each other, or a flag touches an eligible category
- `DELEGATE_NOT_AUTHORIZED` — someone other than the mandate's delegate tried to spend
- `PAYER_MONITORED_EXCEPTION` — on an `ALLOW`: the purpose check failed, but the payer chose `MONITORED`

A decision that reached the purpose checks carries `purposeCheck`. It records what the purpose checks alone concluded, the matched categories, and whether the result was enforced.

The set is intentionally small.

## Audit event

An event can point at a mandate, a decision, an actor, and Open Payments resource URLs. The payload is a map of strings so later code does not drop a medical record into it. Safe Open Payments metadata is limited to opaque references: `compasMandateId`, `compasDecisionId`, `externalReference`.

## Invariants

- Delegated capacity is permission. It is not a transfer to the delegate.
- COMPAS does not custody funds.
- No outgoing payment starts unless the policy outcome is `ALLOW`. In `MONITORED` mode the purpose checks don't block, but mandate rules and the Open Payments grant cap still do.
- AI may classify. AI does not choose `ALLOW`, `DENY`, or `REVIEW`.
- Purpose restrictions belong to COMPAS. Grant limits belong to Open Payments.
- Demo fixtures are not Open Payments responses.
- One mandate type serves a person, a business, an NGO, or a government allocation. The MVP implements only the family medication story.
