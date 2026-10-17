# Plan — Merchant trust matrix

Status: implemented on branch `trust-matrix`, 2026-10-16, except the items left open below. Decision record: [ADR 0007](../adr/0007-merchant-confidence-matrix.md). Interactive explainer: [docs/trust-matrix.html](../trust-matrix.html). Owner: backend.

A shop **declares its own categories** when it registers. COMPAS gives each declared category a **confidence**: `CONTESTED`, `LOW`, `MEDIUM` or `HIGH`. A deterministic **trust matrix** produces it from two inputs: what the Cámara de Comercio and other independent sources say, and what the shop's payment history shows. A mandate sets the minimum confidence it accepts.

The Cámara de Comercio registry database is being built on another branch and is out of scope here. This plan assumes a provisional contract for it and keeps that contract in a single adapter. When the real contract lands, only the adapter and its test fixtures change.

Read first: [merchant-category-service.md](merchant-category-service.md), [ADR 0005](../adr/0005-merchant-category-attestations.md), [ADR 0006](../adr/0006-monitored-budgets.md) and [05-policy-engine.md](../05-policy-engine.md).

## What changed from ADR 0005

ADR 0005 says *"Volume never raises trust, and behavior only lowers it."* That rule stops shops, or a shop and fake customers, from manufacturing eligibility. The new framing keeps the rule's purpose and changes what history can touch:

- **The declaration is the claim.** Only a category the shop declared can make it eligible. Registry or KYB evidence for a category it never declared doesn't count.
- **Trust level still comes only from who attests.** The ladder, the source registry and the NIT binding cap are unchanged. History is never written to the trust log.
- **Confidence is a separate output.** It combines corroboration and history. History can raise confidence, but **never to `HIGH`**: only an independent attester gets there. The loader enforces this in code.
- **Independent counterparties count, volume doesn't.** History counts distinct payers who confirmed a purchase. The shop's own point-of-sale labels can only contradict.

## Axis 1 — Corroboration

`MerchantCategoryResolution.declarations[]` gives one entry per declared category. The resolver computes it from **independent** claims, meaning any source except the merchant itself, after the binding cap.

| Tier | Meaning |
| --- | --- |
| `CONTRADICTED` | The strongest independent claim that leaves the category out of its main activity outranks the strongest one that includes it |
| `UNCORROBORATED` | Only the shop says so. A *tienda de barrio* |
| `REGISTRY_UNBOUND` | A verified source, typically the Cámara, includes the category but joins the wallet only through a NIT the shop typed itself |
| `PROVIDER_VERIFIED` | Wallet KYB includes it, or a registry does through a KYB binding (capped at the binding) |
| `EXTERNAL_VERIFIED` | An independent issuer includes it through an equally strong binding, or about the wallet directly |

- A secondary activity counts as support.
- An unmapped code neither supports nor contradicts, because the mapping table is incomplete.
- The merchant's own CIIU codes are not corroboration.

## Axis 2 — History

Observations live in an append-only **observation log**, kept apart from the trust log:

- `PAID` is recorded when an outgoing payment is created and hasn't failed.
- `PAYER_VERDICT` (`MATCH` or `MISMATCH`) is recorded when the purchase's payer answers.

Parties appear only as HMAC refs. Line descriptions, product names and amounts are never stored.

For category `C` at a merchant, over a 180-day window ending at the decision:

- A purchase **counts** only if its mandate was for `C`.
- It **confirms** if its payer said `MATCH` and no line is in a category incompatible with `C`. The table is data: `MEDICATION`, `FOOD` and `PERSONAL_CARE` against `ALCOHOL` and `TOBACCO`.
- It **contradicts** if its payer said `MISMATCH`, or a line is incompatible with `C`. A shop can label beer `MEDICATION`, but it can't hide a line it labeled `ALCOHOL`.
- A verdict from anyone but the purchase's own payer is ignored.

| Grade | Rule (initial values, untuned) |
| --- | --- |
| `CONTRADICTED` | ≥ 2 distinct contradicting payers **and** `contradictions × 5 ≥ paid purchases` (20%) |
| `ESTABLISHED` | ≥ 10 distinct confirming payers, first confirmed purchase ≥ 60 days ago |
| `EMERGING` | ≥ 3 distinct confirming payers, first confirmed purchase ≥ 14 days ago |
| `NONE` | Anything else |

Rows are checked top to bottom. The math uses integers only.

## The matrix

`data/seeds/trust-matrix/trust-matrix.json`, version `2026-10-16.1`:

| Corroboration \ History | `CONTRADICTED` | `NONE` | `EMERGING` | `ESTABLISHED` |
| --- | --- | --- | --- | --- |
| `CONTRADICTED` | CONTESTED | CONTESTED | CONTESTED | CONTESTED |
| `UNCORROBORATED` | CONTESTED | LOW | LOW | MEDIUM |
| `REGISTRY_UNBOUND` | CONTESTED | LOW | MEDIUM | MEDIUM |
| `PROVIDER_VERIFIED` | CONTESTED | HIGH | HIGH | HIGH |
| `EXTERNAL_VERIFIED` | CONTESTED | HIGH | HIGH | HIGH |

We use a lookup table, not a weighted score. A score would let enough history buy eligibility. With the table, each cell can be explained to a payer.

The loader (`trustMatrixViolations` in `backend/src/policy/trust-matrix.ts`) refuses a file that breaks any of these rules:

- Contradicted rows and columns are `CONTESTED`, and nothing else is.
- `UNCORROBORATED` and `REGISTRY_UNBOUND` never reach `HIGH`.
- Better evidence or better history never lowers confidence.
- Thresholds are positive integers, and `ESTABLISHED` asks at least as much as `EMERGING`, within the window.

## Policy step

`evaluateMerchantCategoryEvidence(resolution, policy, history)`. Rows are checked top to bottom:

| Condition | Result |
| --- | --- |
| A conflict or flag touches an eligible category | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` |
| The shop declared no eligible category | `DENY`, `MERCHANT_NOT_ELIGIBLE` |
| Best confidence is `CONTESTED` | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` (corroboration contradicted) or `MERCHANT_HISTORY_CONTRADICTS` (history did) |
| Best confidence ≥ `merchantConfidence.minimum` | PASS |
| Otherwise | `REVIEW`, `MERCHANT_EVIDENCE_INSUFFICIENT` |

- The best category is the highest confidence. Ties are broken by `COMPAS_CATEGORIES` order.
- A missing history summary throws. It never degrades silently to `NONE`.
- After the quote, `applyConfidenceCap` checks the mandate's optional `maxDebitBelowHigh` for a merchant that passed below `HIGH`. Over the cap, or in a different asset, gives `REVIEW` with `MERCHANT_CONFIDENCE_LIMIT_EXCEEDED`. The cap is a purpose check, so `MONITORED` records it without blocking.

**Audit.** `PurposeCheck.merchantConfidence` stores the category, corroboration, grade, confidence, matrix version and the full `MerchantHistorySummary`. An audit replays the cell from that record without the observation log.

**Mandate.** `purposePolicy.merchantConfidence = { minimum, maxDebitBelowHigh? }` replaces `acceptedTrustLevels`. The demo fixtures use `{ "minimum": "HIGH" }`, which keeps the demo story unchanged.

## Cámara de Comercio registry database

The database is a pull source. `RegistryDbFeed` implements the existing `CategoryEvidenceFeed`, and `refreshRegistryEvidence` sends its submissions through `ingestCategoryClaim` with `transport: "PULL"`:

```text
the shop types its NIT (IDENTITY_BINDING, SELF_DECLARED)
  -> refreshRegistryEvidence(nit): RegistryDbFeed.lookupByTaxId -> BusinessRegistryLookup.findByNit
  -> ACTIVE: CATEGORY_CLAIM about TAX_ID, CIIU codes with roles, validUntil = renewal deadline
     INACTIVE / CANCELLED: REVOCATION of that renewal's claim
  -> ingestCategoryClaim -> trust log
  -> resolver: joined through the binding -> REGISTRY_UNBOUND, or higher with a KYB binding
```

**Provisional contract** (`backend/src/ports/business-registry-lookup.ts`, `contracts/merchant-registry/README.md`):

```ts
type RegistryMerchantRecord = {
  nit: string; matricula: string; camara: string;
  status: "ACTIVE" | "INACTIVE" | "CANCELLED";
  lastRenewalYear: number;
  activities: readonly { ciiu: string; role: "PRIMARY" | "SECONDARY" }[];
  snapshotAt: string;
  provenance: string;
};
```

- **Trust follows provenance.** There is one feed and one source id per provenance, for example `camaras-db/rues-lookup` at `EXTERNAL_VERIFIED`. Rows from another provenance are skipped.
- **Submission ids are idempotent.** The id is `rdb:<camara>:<matricula>:<lastRenewalYear>`, so a refresh with no change does nothing.
- **Stale rows give nothing.** An `ACTIVE` row past its renewal deadline produces no claim, and the old claim expires. The deadline is believed to be 31 March of the next year. That is **unverified**.
- **Placeholder.** `UnimplementedBusinessRegistryLookup` throws until the database exists. It replaces `UnimplementedRuesCiiuFeed`.

**Binding conflict.** A NIT bound to this wallet and, at least as strongly, to another wallet gives a conflict, which leads to `REVIEW`. A weaker binding elsewhere doesn't affect a KYB-verified owner.

## Walkthroughs

| Shop | Corroboration | History | Confidence | Family medication mandate (`HIGH`) |
| --- | --- | --- | --- | --- |
| Droguería Central (demo) | `PROVIDER_VERIFIED` (KYB 4773) | `NONE` | HIGH | PASS, unchanged |
| Liquor store (demo) | declared `ALCOHOL` only | — | — | `DENY`, `MERCHANT_NOT_ELIGIBLE`, unchanged |
| Tienda Doña Gloria (demo) | `UNCORROBORATED` (declared `FOOD`) | `ESTABLISHED` (12 payers, 90 days) | MEDIUM | PASS on a food mandate with minimum `MEDIUM` |
| Registered droguería, self-typed NIT | `REGISTRY_UNBOUND` | `EMERGING` | MEDIUM | `REVIEW`. PASS where the minimum is `MEDIUM` |
| Cosmetics shop with KYB 4773 | `PROVIDER_VERIFIED` | `CONTRADICTED` | CONTESTED | `REVIEW`, `MERCHANT_HISTORY_CONTRADICTS` |
| Liquor store typing a pharmacy's NIT | `CONTRADICTED` (own KYB 4724 outranks the registry match) | any | CONTESTED | `REVIEW`. The NIT is also bound twice |

## Attacks and mitigations

| Attack | Mitigation | Residual risk |
| --- | --- | --- |
| The shop labels beer as `MEDICATION` | Line labels never raise history, only payer `MATCH` verdicts do | A payer who confirms falsely is misleading themselves |
| Fake payers confirm a shop | Distinct payers, minimum spans, the cap below `HIGH` and the optional per-purchase cap | Payer wallets are cheap on the test network. Later: weigh payers by wallet provider and KYC |
| A competitor smears a shop | ≥ 2 distinct payers with paid purchases there, and ≥ 20% of purchases | A determined competitor who pays. The result is `REVIEW`, never `DENY` |
| A shop uses another business's NIT | Self-typed binding is capped. A NIT bound twice gives a conflict. The shop's own contradicting KYB outranks the registry match | The first wallet to bind isn't necessarily the owner. The owner's KYB binding resolves it |
| A shop feeds its own history | Only payer verdicts count, including on purchases allowed below `HIGH` | None known |
| Stale registry row | `validUntil` from the renewal, and a revocation on inactive status | The refresh lag |

## Implementation map

| Concern | File |
| --- | --- |
| Types | `backend/src/domain/trust-matrix.ts`, `merchant-history.ts`, `merchant-category.ts` (`CorroborationTier`, `DeclaredCategory`), `mandate.ts` (`MerchantConfidencePolicy`) |
| Corroboration and the binding conflict | `backend/src/application/resolve-merchant-categories.ts` |
| History summary and grade (pure) | `backend/src/policy/merchant-history.ts` |
| Matrix lookup and invariants | `backend/src/policy/trust-matrix.ts`, loader `integrations/merchant-history/json-trust-matrix.ts` |
| Policy step and cap | `backend/src/policy/merchant-category-evidence.ts`, `evaluate-purchase.ts` (`applyConfidenceCap`) |
| Load and record history | `backend/src/application/merchant-history.ts`, wired in `purchase-under-mandate.ts` |
| Payer verdict | `backend/src/application/confirm-purchase-purpose.ts`, handler `api/spending-confirmations.ts` |
| Observation log | `backend/src/ports/merchant-observation-log.ts`, `integrations/merchant-history/in-memory-observation-log.ts`, `party-ref.ts` |
| Registry DB | `backend/src/ports/business-registry-lookup.ts`, `integrations/category-sources/registry-db-feed.ts`, `application/refresh-registry-evidence.ts` |
| Demo | `integrations/merchant-registry/demo-category-seed.ts` (tienda declares `FOOD`), `integrations/merchant-history/demo-history-seed.ts`, `create-merchant-history-service.ts` |

## Left open

1. **Payer authentication.** `confirmPurchasePurpose` checks only that the caller knows the payer id. This is the largest gap.
2. **The confirmation route isn't wired into `server.ts`.** The backend runs no purchases over HTTP, so its observation log would always be empty. Wire it together with the purchase routes, with a body limit of `MAX_CONFIRMATION_BODY_BYTES`.
3. **Payment completion.** A `PAID` observation records the state at creation, usually `PENDING`. A later `FAILED` isn't written back yet.
4. **State programs.** "Distinct payers" collapses to one program payer. Programs rely on `PROGRAM_OPERATOR` evidence.
5. **Registry lookups aren't triggered automatically** on a NIT binding. Call `refreshRegistryEvidence` once the database exists, and schedule refreshes before `validUntil`.
6. **Threshold tuning.** All numbers are team choices, not derived from data.
7. **Product identifiers.** An INVIMA *registro sanitario* on a line could become a merchant-independent signal. Whether it can be checked is unverified.

## Out of scope

- Building or populating the Cámara de Comercio database.
- Frontend wiring: the ARQ confirmation buttons and the confidence labels.
- AI. A classifier may still append a `FLAG`. Its output never counts as a confirmation (ADR 0003).
- Persistence. The observation log is in memory.
- Any change to Open Payments calls or `SafePaymentMetadata`.
