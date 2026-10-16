# Domain model

Types live in `src/compas/domain/`. They describe the model. They do not persist it or move money.

## Terms

| Term | Meaning |
| --- | --- |
| Mandate | A payer's grant of limited capacity for a delegate to cause future payments under a purpose policy. |
| Payer | The party whose wallet will eventually pay. |
| Delegate | The party who may initiate a payment under the mandate. Not the payee. |
| Beneficiary | The person or purpose the spending is for. Not necessarily a wallet holder. |
| Budget | The maximum amount the mandate may authorize, as a `MoneyAmount`. |
| Remaining authorized amount | Unused authorization capacity. Not a wallet balance. |
| Purpose policy | Allowed purposes and eligible categories. A COMPAS concept, not an Open Payments scope. |
| Merchant profile | Identity plus category claims and their trust level. |
| Purchase intent | A proposed purchase a delegate wants the mandate to fund. |
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

A category claim has a trust level:

- `SELF_DECLARED` — the merchant said so. Insufficient on its own.
- `PROVIDER_VERIFIED` — the wallet provider or acquiring surface attested the category.
- `EXTERNAL_VERIFIED` — an independent source attested it.

No verifier is implemented. Demo merchants in `src/demo/scenarios/` are `SELF_DECLARED` and labeled `demo/test data`.

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

The set is intentionally small.

## Audit event

An event can point at a mandate, a decision, an actor, and Open Payments resource URLs. The payload is a map of strings so later code does not drop a medical record into it. Safe Open Payments metadata is limited to opaque references: `compasMandateId`, `compasDecisionId`, `externalReference`.

## Invariants

- Delegated capacity is permission. It is not a transfer to the delegate.
- COMPAS does not custody funds.
- No outgoing payment starts unless the policy outcome is `ALLOW`.
- AI may classify. AI does not choose `ALLOW`, `DENY`, or `REVIEW`.
- Purpose restrictions belong to COMPAS. Grant limits belong to Open Payments.
- Demo fixtures are not Open Payments responses.
- One mandate type serves a person, a business, an NGO, or a government allocation. The MVP implements only the family medication story.
