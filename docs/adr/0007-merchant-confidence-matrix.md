# ADR 0007 — Merchant confidence from a declaration, the registry and history

## Status

Accepted, 2026-10-16. Amends [ADR 0005](0005-merchant-category-attestations.md).

## Context

ADR 0005 resolves a merchant's categories from attestations and lets a mandate accept trust levels. Two things were missing:

- **Most shops have no attester.** A *tienda de barrio* is often in no Cámara de Comercio registry, and no Colombian wallet runs Open Payments, so nobody gives a verified NIT binding. Under ADR 0005 such a shop could never be paid under an `ENFORCED` mandate.
- **Registered isn't the same as selling.** A Cámara record is registered activity. CIIU 4773 also covers cosmetics, and a 2008 Bogotá study found Cámara pharmacy lists that included shops not selling medicine. Once a shop is attested, nothing ever looks at what it actually sells.

A team is building a database of Cámara de Comercio records on another branch. COMPAS also sees every purchase it allows. ADR 0005 said *"Volume never raises trust, and behavior only lowers it."* That rule stops shops, or a shop and fake customers, from manufacturing eligibility. Any use of history has to keep that protection.

## Decision

- **The shop declares its own categories at registration.** That self-declaration is the claim. Only a declared category can make a shop eligible. Evidence for a category the shop never declared doesn't.
- **COMPAS assigns each declared category a confidence**: `CONTESTED`, `LOW`, `MEDIUM` or `HIGH`. The confidence comes from a versioned **trust matrix** over two axes:
  - **Corroboration** asks how independent evidence bears on the declaration: `CONTRADICTED`, `UNCORROBORATED`, `REGISTRY_UNBOUND` (a registry agrees through a NIT the shop typed itself), `PROVIDER_VERIFIED` or `EXTERNAL_VERIFIED`. The merchant's own codes don't count. The strongest contradiction has to outrank the strongest support to make the category `CONTRADICTED`.
  - **History** asks what paid purchases show: `CONTRADICTED`, `NONE`, `EMERGING` or `ESTABLISHED`. It counts **distinct payers who confirmed** a purchase, never transactions. The shop's own line labels can only contradict.
- **Trust level still comes only from who attests.** History is never written to the trust log and never becomes a claim. ADR 0005's ladder and binding cap are unchanged.
- **History alone never reaches `HIGH`.** A shop backed only by its own declaration, even with a registry match and long confirmed history, stays at `MEDIUM` or below. Only an independent attester reaches `HIGH`. Contradicting evidence or history is always `CONTESTED`. The loader enforces these rules in code, so a data file can't break them.
- **A mandate sets a minimum confidence** (`purposePolicy.merchantConfidence.minimum`). This replaces `acceptedTrustLevels`. It can also cap each purchase at a merchant below `HIGH` (`maxDebitBelowHigh`). That cap is compared with the quoted debit, and a different asset fails closed.
- **One NIT bound to two wallets** is a conflict for any wallet whose binding is not stronger than the other's.
- **The Cámara database is a pull source.** Its rows go through `ingestCategoryClaim` like any other evidence. Its contract is provisional and lives in one adapter.

Unchanged: AI never authorizes, rules are deterministic, Open Payments metadata stays opaque, and `MONITORED` relaxes only the purpose checks.

## Consequences

- With `minimum: "HIGH"` the demo story is unchanged. Droguería Central is `PROVIDER_VERIFIED` × `NONE` = `HIGH`, and the liquor store declared no eligible category, so it gets `DENY`.
- A *tienda* gets a bounded path: `MONITORED` budgets and payer confirmations, then mandates that accept `MEDIUM` or `LOW`, with an optional per-purchase cap.
- An attested shop whose payers report mismatches drops to `REVIEW`.
- Payer confirmations are now security-relevant, but the backend has **no payer authentication**. Anyone who knows a payer id can confirm. This must close before a real deployment.
- Distinct payers collapse to one for a state program that funds many beneficiaries. The history axis fits family payers. Programs rely on `PROGRAM_OPERATOR` evidence.
- Thresholds and cells are untuned team choices, versioned in `data/seeds/trust-matrix/trust-matrix.json`. Every decision records the matrix version and the history summary it used, so it can be replayed.
- The observation log is in memory, like the trust log and the spending log.
