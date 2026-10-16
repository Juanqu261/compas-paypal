# Security, privacy, and ethics

This scaffold has no authentication, no database, and no live payment credentials. The rules below still bind later implementation.

## Least privilege

A mandate names one delegate, a budget, a purpose, and a time window. The delegate can cause a checked payment. The delegate cannot take the budget, change the purpose, or bypass the policy engine. Open Payments grants, when they exist, should request only the actions that step needs.

## Consent and transparency

The payer explicitly creates and authorizes the mandate. The delegate should be able to see the purpose, the remaining capacity, and the reason a payment was denied. The beneficiary is not assumed to operate a wallet. Gladys's lack of a wallet must not be solved by giving Andrea unrestricted money.

Revocation moves a mandate to `REVOKED`. Later purchase intents against it fail before any outgoing payment.

## Sensitive data

Medication is a purpose category, not a medical record. Do not put diagnoses, prescriptions, or national identifiers into:

- Open Payments metadata
- audit payloads that might be copied outward
- AI prompts
- logs

Safe outward references are `compasMandateId`, `compasDecisionId`, and `externalReference`.

## Audit and misuse

Every material decision should become an `AuditEvent`: who created the mandate, when it was authorized, which policy version applied, the intent, the evidence used, the decision and reason, Open Payments resource URLs, and the final payment result.

An audit trail does not stop collusion, a false invoice, or a miscoded merchant. It makes those events easier to reconstruct. COMPAS can reduce unauthorized use of allocated funds. It does not solve corruption.

## Fairness and inclusion

Purpose limits reduce the recipient's freedom to spend. That is a deliberate trade for the payer's restriction, and it can become paternalistic if the policy is broader than the payer understands. Delegates and beneficiaries should see the restriction in plain language.

Merchant eligibility can exclude small pharmacies if evidence is available only for large chains. `SELF_DECLARED` is weak, but requiring a heavy verification process before any small merchant can be paid is also an inclusion failure. Trust levels exist so the product can distinguish a claim from a verification without pretending every merchant is either fully trusted or invisible.

A mixed basket should not force an ineligible item to block an eligible one forever. Split tender is future work; until it exists, the safe behavior is to deny the whole intent rather than pay the ineligible part.

## Demo surfaces

The hackathon UI imitates wallet experiences. It must not collect real credentials, copy official logos, or imply that ARQ, Nequi, or Nequi Negocios have integrated with COMPAS.
