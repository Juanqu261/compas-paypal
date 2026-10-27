# ADR 0005 — Merchant categories are attestations about the payee

## Status

Accepted, 2026-10-16. Amended by [ADR 0007](0007-merchant-confidence-matrix.md): a merchant's declared categories get a confidence from the trust matrix, history counts only through distinct confirming payers, and history alone never reaches `HIGH`. Trust levels below are unchanged.

The rail changed on 2026-10-26: [ADR 0008](0008-paypal-rail-per-order-approval.md) replaces Open Payments with PayPal. The subject is the payee's PayPal merchant id where it was an Open Payments wallet address, and the purchase intent carries `paypalMerchantId`. PayPal signs no category attestations, so on a real PayPal deployment `PROVIDER_VERIFIED` is empty; the demo's simulated Nequi Negocios source still fills it.

## Context

COMPAS allows a payment only at a merchant eligible for the mandate's purpose. Open Payments has no merchant category. Grant limits are only `debitAmount` or `receiveAmount`, `interval` and `receiver`. COMPAS has to know what a merchant is and how well that is backed.

Several approaches look tempting:

- **A category in Open Payments metadata.** The merchant creates the incoming payment, so the category would be self-declared and spoofable. Every hop would also see health-adjacent data.
- **Category claims on the purchase intent.** Whoever builds the intent would supply the evidence.
- **Card-network MCCs.** COMPAS runs on digital wallets and has no link to Visa, Mastercard or an acquirer. It can neither obtain nor check an MCC.

## Decision

- A merchant's category is evidence attached to its **Open Payments wallet address**. Signed claims record it in an append-only trust log.
- The **trust level comes from the source registry**, never from the claim. The order is `SELF_DECLARED` (the merchant), then `PROVIDER_VERIFIED` (the wallet's KYB), then `EXTERNAL_VERIFIED` (RUES, a health authority, a program operator).
- External evidence (CIIU Rev. 4 A.C. codes, sector licenses) is translated to COMPAS categories through versioned mapping tables. Unmapped evidence gives no category.
- Registry evidence keyed by NIT joins a wallet only through an identity binding. A self-declared binding caps it at `SELF_DECLARED`.
- **Volume never raises trust, and behavior only lowers it.** Flags and contradictions lead to `REVIEW`. (Amended by ADR 0007: confirmed history from distinct payers can raise a declared category's *confidence*, never its trust level, and never to `HIGH`.)
- The policy engine resolves categories at decision time and calls `evaluateMerchantCategoryEvidence`. That function returns PASS, `REVIEW` or `DENY`. It never returns `ALLOW`.
- Open Payments metadata stays limited to `compasMandateId`, `compasDecisionId` and `externalReference`. The purchase intent carries only `merchantWalletAddressUrl`.

## Consequences

- The wallet provider is the key partner. Without its attestation, registry evidence can't rise above `SELF_DECLARED`.
- A CIIU code is registered activity, not proof of what's sold. CIIU 4773 also covers cosmetics, so for `MEDICATION` the pharmacy license is the purpose-specific evidence.
- Every MVP source is simulated, and the trust log is in memory. Persistence, disputes and real feeds (RUES, health registries, wallet providers) are later work behind the existing ports.
- A NIT is stored only as an HMAC, because a sole proprietor's NIT is their cédula.
