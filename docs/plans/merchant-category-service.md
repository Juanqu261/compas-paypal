# Plan — Merchant category service

Status: implemented on branch `open-payments`, 2026-10-16, except the demo UI label in Phase 4 and the population plan. Card-network MCCs were dropped the same day (see [Evidence sources](#evidence-sources)). Owner: the merchant-category feature team.

This feature adds a security layer on top of Open Payments. Open Payments enforces the consent and the cap. COMPAS enforces the purpose. This service tells COMPAS what a merchant is, how strongly that is backed and who backs it.

This plan covers the code that **receives, stores, normalizes and resolves** merchant category evidence. It does not cover populating it. Real feeds from wallet providers, the Cámaras de Comercio through RUES or territorial health authorities are a later plan. This plan defines the port they plug into and leaves each one as a fail-closed placeholder.

The policy engine and the orchestrator are other features. This plan ends at a handoff contract: one pure function the policy engine calls for its `merchant_category_evidence` step.

Read first: [02-domain-model.md](../02-domain-model.md) (merchant evidence and trust levels), [04-open-payments-mapping.md](../04-open-payments-mapping.md) (who enforces what) and [05-policy-engine.md](../05-policy-engine.md) (evaluation order).

## Implementation notes

The code follows this plan. These are the places where it differs, and why:

- **Normalizers** live in `backend/src/domain/merchant-identifiers.ts`, not `integrations/`, so the application layer doesn't import an adapter. The CIIU check is format only (four digits). We have no complete CIIU list, so a well-formed code with no mapping is accepted and reported in `unmappedEvidence`. NITs are checked with the DIAN check-digit algorithm, using DIAN's own NIT, 800.197.268-4, as the test vector.
- **Names.** The pull-adapter port is `CategoryEvidenceFeed`, because `CategorySource` is the domain type. The feeds are `unimplemented-rues-ciiu-feed.ts` and `unimplemented-health-registry-feed.ts`. The source registry is `StaticCategorySourceRegistry` plus `loadCategorySources` in `static-source-registry.ts`.
- **Sources** also declare `transport` (`PUSH` or `PULL`) and `allowedEntryTypes`. A push for a pull source is `UNKNOWN_SOURCE`.
- **Revocation** names the same source's `revokesSubmissionId`, not a COMPAS entry id. A source therefore can't even address another source's entries.
- **Idempotency.** Every entry stores `submissionId` and `bodyDigest` (SHA-256 of the raw body). The same id with the same body returns the first entry (`200`). The same id with a different body is `SUBMISSION_ID_REUSED` (`409`). `INVALID_IDENTIFIER` was added for a bad NIT.
- **HMAC key.** A missing `MERCHANT_SUBJECT_HMAC_KEY` gives a random per-process key and a warning, instead of failing at startup. The trust log is in memory, so the refs can't outlive the key anyway. A key shorter than 32 characters still fails at startup.
- **Demo seed** runs inside the backend at startup, not as a separate script. It generates a throwaway Ed25519 key and registers the two simulated sources with it. It then sends every demo claim through `ingestCategoryClaim` with a real signature check. `MERCHANT_CATEGORY_DEMO_SEED=false` turns it off. Demo wallets use the reserved `wallet.example` domain. When `DEMO_MERCHANT_WALLET_ADDRESS` is set, that test-network wallet gets Droguería Central's evidence too.
- **CIIU 4773** covers pharmaceutical and medicinal products **and cosmetics and toiletries**, according to secondary sources (dian-rut.com). It maps to `MEDICATION` and `PERSONAL_CARE`. A cosmetics shop with 4773 therefore resolves to `MEDICATION` too. The pharmacy license is the evidence that separates them.
- **Conflict rule.** Two claims at `PROVIDER_VERIFIED` or above conflict when their main categories share nothing. Main categories come from `PRIMARY` codes, codes without a role and licenses. Self-declared claims never create a conflict.
- **Resolution** also returns `sourceIds` per category and `unmappedEvidence`. Each flag carries its category. The GET response adds `dataLabel` and a per-category `simulated` flag.
- **Alcohol fixture** keeps `PURPOSE_MISMATCH` as its expected story reason. The merchant step gives `MERCHANT_NOT_ELIGIBLE`, and a decision can carry both.
- **Frontend.** The demo card now reads `purchaseIntent.merchantDisplayName`. It wasn't typechecked here because the frontend's dependencies aren't installed.
- **HTTP.** An unexpected error in a category route returns `500` instead of crashing the process. Bodies over 16 KiB get `413`.

## Goal

When this feature is done, the backend can:

1. Accept a category claim about a merchant from a registered source, through a push endpoint or a pull adapter. Both paths go through the same ingestion use case.
2. Reject a claim whose source is unknown, whose signature fails, whose code is malformed or whose code system the source isn't allowed to use.
3. Assign the trust level from the **source registry**, never from the claim itself.
4. Keep every claim, revocation and flag in an append-only trust log.
5. Resolve a merchant's **Open Payments wallet address** to COMPAS categories such as `MEDICATION`, each with its trust level, its sources and any conflicts.
6. Give the policy engine a deterministic step result for the merchant: pass, `DENY MERCHANT_NOT_ELIGIBLE`, or `REVIEW` when evidence is too weak or contradictory.

A demo seed shows the full path with a simulated Nequi Negocios provider attestation, labeled `demo/test data`.

## Design rules

These come from the design session and the repo invariants. The code must keep them.

- **The category belongs to the payee, not to the payment.** It's looked up by the merchant's wallet address. It is never read from Open Payments metadata. Metadata keeps only `compasMandateId`, `compasDecisionId` and `externalReference`. `toSafeMetadata` doesn't change.
- **The purchase intent doesn't carry trusted claims.** Today `PurchaseIntent.merchant` is a full `MerchantProfile` with `categoryClaims`, so whoever builds the intent supplies the evidence. This plan changes the intent to carry the merchant's wallet address, and COMPAS resolves the claims itself (Phase 1).
- **External evidence is translated, not trusted as-is.** A CIIU Rev. 4 A.C. code or a license type, such as a pharmacy establishment registration, is an input. A versioned mapping table turns it into a COMPAS category. Unmapped evidence yields no category. Nothing guesses.
- **COMPAS owns the purpose taxonomy.** `MEDICATION`, `FOOD` and the rest are COMPAS categories, not Open Payments scopes and not CIIU codes.
- **Volume never raises trust.** Many self-declarations, peer vouching or a clean history never upgrade a claim. Only an independent issuer does. Behavior can only lower trust.
- **The trust level comes from who said it.** A submission cannot set its own `trustLevel`. The source registry maps a source to a trust level and to the code systems it may assert.
- **Fail closed.** No claim, an expired claim, a revoked claim, an unknown code or a conflict never becomes an `ALLOW`.
- **AI is advisory.** A later classifier may append a `FLAG` entry to the trust log. A flag can push a decision to `REVIEW`. It can't create eligibility.
- **No blockchain, no database decision.** The trust log is a port. The MVP adapter is in memory.

## Evidence sources

COMPAS runs on top of digital wallets. It has no connection to Visa, Mastercard or a card acquirer, so it can neither obtain nor check an MCC (ISO 18245). **MCC is not an input.** If a wallet that also acquires cards (Nequi Negocios accepts cards through Wompi) later attests an MCC, it can be added as a code system then. Nothing in this plan depends on it.

What's left, ordered by what each source proves:

| Source | What it proves | How COMPAS gets it | Trust level | Status |
| --- | --- | --- | --- | --- |
| Merchant self-declaration | What the merchant says it sells | Onboarding in the wallet's merchant surface, relayed by the wallet | `SELF_DECLARED` | Demo: Nequi Negocios simulation |
| Wallet provider KYB | That the wallet belongs to a given NIT, and the CIIU on the RUT the merchant gave at signup | Signed attestation pushed by the wallet | `PROVIDER_VERIFIED` | Simulated. No Colombian wallet runs Open Payments yet |
| RUES (Cámaras de Comercio) | Registered economic activity: one main and up to three secondary CIIU codes | Lookup by NIT, or the monthly Confecámaras extract on datos.gov.co | `EXTERNAL_VERIFIED` | Bulk open data exists (CC BY-SA 4.0). A Medellín sample is in `data/seeds/merchant-registry/`, not loaded yet |
| Territorial health authority | That the shop is a registered pharmacy establishment (droguería), not only that it declared the activity | Registry lookup, or a certificate checked against its issuer | `EXTERNAL_VERIFIED` | Unverified. Likely varies by department |
| Program operator (roadmap) | That a food-bonus program authorized the shop, such as Medellín Cero Hambre's "establecimientos autorizados" | Signed list from the program | `EXTERNAL_VERIFIED` | Roadmap |

Notes:

- **CIIU is registered activity, not proof of what's sold.** Supersociedades lets merchants carry out unregistered lawful activities, and a 2008 Bogotá study found Cámara pharmacy lists that included shops not selling medicine (`.skills/compas-context/REFERENCE.md`). For `MEDICATION`, the health-authority registration is the purpose-specific evidence. CIIU 4773 is supporting evidence. It also catches contradictions, such as a primary 4724 (liquor store).
- **RUT and RUES must match.** A merchant's RUES CIIU codes must match its RUT. So a wallet's RUT-based attestation that disagrees with RUES is itself a conflict signal.
- **Pharmacy registration.** From memory, Decreto 780 de 2016 and Resolución 1403 de 2007 require pharmacy establishments to register with the territorial health authority. This is **unverified**. Before the population plan, check this and whether those registries can be queried, per department.
- **Uploaded documents.** A merchant can upload a Cámara certificate (certificado de existencia y representación legal or matrícula mercantil) or its RUT. A document counts only once it's checked against its issuer, for example through the certificate's verification code on the Cámara's site. Confirm that each Cámara offers this. A file that was uploaded but never checked stays `SELF_DECLARED`.

### Building trust from self-declarations

Self-declaration is how a merchant joins. It is not validation.

- **The ladder.** The merchant self-declares. Then its wallet attests the identity and the RUT CIIU. Then RUES or a health registry confirms. Each step is one more trust-log entry, and the mandate's policy decides which levels it accepts.
- **Volume never raises trust.** Many `SELF_DECLARED` claims, merchants vouching for each other, or a long clean history never produce `PROVIDER_VERIFIED` or `EXTERNAL_VERIFIED`. Otherwise a group of colluding shops could vouch one another into eligibility.
- **Behavior only lowers trust.** Line items that contradict the category, delegate reports, disputes or an AI anomaly flag each append a `FLAG`. A flag pushes the decision to `REVIEW`. Merchant anomaly detection is on the roadmap.
- **Proof of wallet control.** A self-declaration has to come from whoever controls the wallet address. When the wallet provider relays it, the provider's signature covers this. Without the provider, it's an open question. One option is an interactive Open Payments grant at the merchant's wallet, which only the account holder can approve. Check which grant types require interaction before relying on this. Incoming-payment grants can be non-interactive, so being able to create an incoming payment on a wallet proves nothing.

## Identity binding

RUES and health registries identify a merchant by NIT. Payments identify it by an Open Payments wallet address. The service needs to know that both refer to the same merchant.

That link is a claim too, with a source and a trust level:

- `SELF_DECLARED`: the merchant typed its NIT at signup.
- `PROVIDER_VERIFIED`: the wallet provider did KYB (business identity checks) on that wallet and attests the NIT. For a sole proprietor (persona natural), the NIT is the cédula plus a check digit, so a wallet that verified the holder's cédula at signup can check the match itself.

The resolver joins a registry claim to a wallet address only through a binding. A `SELF_DECLARED` binding caps the joined claim at `SELF_DECLARED`, whatever the registry's own level. Otherwise a liquor store could name a pharmacy's NIT and inherit its registry entry. This makes the wallet provider the key partner: without its binding, RUES and health-registry evidence can't rise above `SELF_DECLARED`.

**Privacy.** A sole proprietor's NIT is their cédula plus a check digit. That is personal data under Ley 1581 de 2012. The trust log stores `subjectRef`: an HMAC of the identifier under a backend secret. It doesn't store the raw NIT. The raw value goes only to a source adapter at lookup time.

## Domain additions

`backend/src/domain/merchant-category.ts` (new) and changes to `merchant.ts` and `purchase.ts`. Every type stays erasable for `--experimental-strip-types`: no `enum`, no parameter properties.

```ts
/** External code systems COMPAS can receive. MCC is out: COMPAS has no card-network link. */
export const CATEGORY_CODE_SYSTEMS = ["CIIU_REV4_AC"] as const;
export type CategoryCodeSystem = (typeof CATEGORY_CODE_SYSTEMS)[number];

export type ExternalCategoryCode = {
  system: CategoryCodeSystem;
  code: string;            // normalized: "4773"
  role?: "PRIMARY" | "SECONDARY"; // RUES/RUT main vs secondary activity
};

/** Sector licenses that prove a purpose more directly than a CIIU code. */
export const LICENSE_TYPES = ["CO_PHARMACY_ESTABLISHMENT"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** COMPAS purpose taxonomy. Not an Open Payments scope. */
export const COMPAS_CATEGORIES = ["MEDICATION", "FOOD", "PERSONAL_CARE", "ALCOHOL", "TOBACCO"] as const;
export type CompasCategory = (typeof COMPAS_CATEGORIES)[number];

export const CATEGORY_SOURCE_KINDS = [
  "MERCHANT",            // self-declaration, relayed by the wallet
  "WALLET_PROVIDER",     // KYB attestation
  "BUSINESS_REGISTRY",   // RUES
  "HEALTH_AUTHORITY",    // territorial pharmacy registry
  "PROGRAM_OPERATOR",    // roadmap: food-bonus authorized merchants
] as const;

export type CategorySource = {
  id: string;                         // "nequi-negocios-sim/merchant", "nequi-negocios-sim/kyb", "rues"
  kind: (typeof CATEGORY_SOURCE_KINDS)[number];
  trustLevel: MerchantTrustLevel;     // assigned here, never by a claim
  allowedSystems: readonly CategoryCodeSystem[];
  allowedLicenses: readonly LicenseType[];
  allowedSelfDeclaredCategories: boolean; // only MERCHANT sources
  publicKeyJwk?: JsonWebKey;          // Ed25519; required for push sources
  simulated: boolean;                 // true for every demo source
};

export type MerchantSubject =
  | { kind: "WALLET_ADDRESS"; walletAddressUrl: string }
  | { kind: "TAX_ID"; subjectRef: string };         // HMAC, never the raw NIT

/** One append-only trust-log entry. */
export type TrustLogEntry =
  | { type: "CATEGORY_CLAIM"; id: string; sourceId: string; subject: MerchantSubject;
      codes: readonly ExternalCategoryCode[];
      declaredCategories?: readonly CompasCategory[]; // MERCHANT sources only
      observedAt: string; validUntil?: string; evidenceRef?: string; recordedAt: string }
  | { type: "LICENSE_CLAIM"; id: string; sourceId: string; subject: MerchantSubject;
      licenseType: LicenseType; licenseRef: string; validUntil?: string; recordedAt: string }
  | { type: "IDENTITY_BINDING"; id: string; sourceId: string; walletAddressUrl: string;
      subject: MerchantSubject; recordedAt: string }
  | { type: "REVOCATION"; id: string; sourceId: string; revokes: string; reason: string; recordedAt: string }
  | { type: "FLAG"; id: string; sourceId: string; walletAddressUrl: string;
      category: CompasCategory; note: string; recordedAt: string };

export type ResolvedCategory = {
  category: CompasCategory;
  trustLevel: MerchantTrustLevel;     // strongest live, bound evidence
  supportingEntryIds: readonly string[];
};

export type MerchantCategoryResolution = {
  walletAddressUrl: string;
  categories: readonly ResolvedCategory[];
  conflicts: readonly { categories: readonly CompasCategory[]; entryIds: readonly string[] }[];
  flags: readonly string[];           // FLAG entry ids
  mappingVersion: string;
  resolvedAt: string;
};
```

Changes to existing types:

- `PurchaseIntent.merchant: MerchantProfile` becomes `merchantWalletAddressUrl: string`, plus an optional `merchantDisplayName` for the UI. `MerchantProfile` stays as a read model built by the registry.
- `PurposePolicy` gains `acceptedTrustLevels: readonly MerchantTrustLevel[]`, for example `["PROVIDER_VERIFIED", "EXTERNAL_VERIFIED"]`. A set avoids having to decide whether a card network outranks a wallet provider. `eligibleCategories` becomes `readonly CompasCategory[]`.
- `POLICY_REASON_CODES` gains `MERCHANT_EVIDENCE_INSUFFICIENT` (eligible category, but only below the accepted trust levels) and `MERCHANT_EVIDENCE_CONFLICT` (contradictory claims or a flag). Both lead to `REVIEW`.

## Mapping tables

`data/seeds/category-mappings/` holds versioned JSON: one file for CIIU and one for license types. Each file is labeled `unverified` until someone checks it against the source document. The codes below are from memory.

```json
{
  "system": "CIIU_REV4_AC",
  "version": "2026-10-16.1",
  "verification": "unverified — check against the DIAN Res. 114/2020 annex",
  "mappings": [
    { "code": "4773", "label": "Retail sale of pharmaceutical and medicinal products, cosmetics and toiletries", "categories": ["MEDICATION", "PERSONAL_CARE"] },
    { "code": "4724", "label": "Retail sale of beverages and tobacco", "categories": ["ALCOHOL", "TOBACCO"] },
    { "code": "4711", "label": "Non-specialized retail, mainly food", "categories": ["FOOD"] }
  ]
}
```

The CIIU file also maps 4721–4723 to `FOOD`. `license-types.json` maps `CO_PHARMACY_ESTABLISHMENT` to `MEDICATION`.

One code can map to several categories (4724 covers beverages and tobacco). Mappings are data, so changing one never needs a code change. Every resolution records `mappingVersion` so an audit can replay it.

## Target layout

```text
contracts/
  merchant-categories/
    README.md                                   claim submission and resolution payloads
    category-claim-submission.schema.json       JSON Schema for the push endpoint
data/
  seeds/
    category-mappings/
      ciiu-rev4-ac.json
      license-types.json
    category-sources/
      demo-sources.json                         simulated sources, labeled demo/test data
backend/src/
  domain/
    merchant-category.ts                        types above
    merchant.ts, purchase.ts, mandate.ts,
    policy-decision.ts                          changes above
  ports/
    merchant-trust-log.ts                       append(entry), listByWalletAddress, listBySubject
    category-source-registry.ts                 getById(sourceId)
    category-source.ts                          pull adapter: lookup(subject) -> submissions
    category-mapping-repository.ts              map(code) -> CompasCategory[], version
    merchant-registry.ts                        revised: resolve(walletAddressUrl)
  application/
    ingest-category-claim.ts                    the one ingestion use case
    resolve-merchant-categories.ts              trust log + mappings -> resolution
  policy/
    merchant-category-evidence.ts               pure step function (handoff contract)
  integrations/
    merchant-registry/
      in-memory-trust-log.ts
      json-source-registry.ts                   loads data/seeds/category-sources
      json-category-mappings.ts                 loads data/seeds/category-mappings
      code-normalizers.ts                       CIIU and license-type validation
      claim-signature.ts                        Ed25519 verify with node:crypto
      subject-ref.ts                            HMAC for NITs
      unimplemented-merchant-registry.ts        kept until the resolver is wired
    category-sources/
      unimplemented-rues-ciiu-source.ts         throws NotImplementedError
      unimplemented-health-registry-source.ts   throws NotImplementedError
  api/
    merchant-categories.ts                      POST /merchant-category-claims, GET resolution
backend/tests/
  domain/merchant-category.test.ts
  integrations/merchant-registry/*.test.ts
  application/ingest-category-claim.test.ts
  application/resolve-merchant-categories.test.ts
  policy/merchant-category-evidence.test.ts
  api/merchant-categories.test.ts
docs/
  adr/0005-merchant-category-attestations.md
```

The `category-sources/` placeholders follow the existing rule: no fabricated success. Each throws until its plan is written.

## Ingestion

`ingestCategoryClaim(submission, deps)` is the only way a claim enters the trust log. The HTTP route and every pull adapter call it.

```text
submission
  -> schema valid?                          else INVALID_SUBMISSION
  -> source registered?                     else UNKNOWN_SOURCE
  -> push source: Ed25519 signature valid?  else BAD_SIGNATURE
  -> evidence allowed for this source (code system, license type,
     or self-declared categories for MERCHANT sources only)?  else EVIDENCE_NOT_ALLOWED
  -> evidence normalizes (CIIU: 4 digits, known class; license: known type)?  else INVALID_CODE
  -> raw tax ids replaced by subjectRef
  -> idempotent on (sourceId, submissionId)
  -> append TrustLogEntry with recordedAt
  -> return entry id
```

The signature covers the exact request body bytes, sent in a header. Signing raw bytes avoids having to canonicalize JSON. Verification uses `crypto.verify(null, body, publicKey, signature)` from `node:crypto`. That's Ed25519, the key type Open Payments clients already use, and it needs no new dependency.

Submissions carry no `trustLevel` field. The schema rejects one if present, so a source can't even attempt it.

Revocations and identity bindings use the same pipeline with their own entry type. A source can revoke only its own entries.

## Resolution

`resolveMerchantCategories(walletAddressUrl, deps)`:

1. Read entries for the wallet address, plus entries for any subject bound to it.
2. Drop revoked entries, entries past `validUntil` and entries from sources no longer in the registry.
3. For each claim, take its trust level from the source. If it joined through a binding, cap it at the binding's level.
4. Map each CIIU code and license type to COMPAS categories with the current mapping version. Self-declared categories pass through as `SELF_DECLARED`. Drop unmapped evidence and record it for the audit.
5. Per category, keep the strongest trust level and the supporting entry ids.
6. Record a conflict when sources at an accepted level disagree. Example: the wallet attests RUT CIIU 4773 (`MEDICATION`) while RUES has 4724 as the primary activity (`ALCOHOL`). A secondary CIIU code alone doesn't conflict with a primary one. Record every `FLAG` entry.

The function is pure over its inputs and returns the timestamp and mapping version it used. Audit can replay it.

## Handoff to the policy engine

`evaluateMerchantCategoryEvidence(resolution, purposePolicy)` is the contract. It returns a step result, not a `PolicyDecision`:

| Condition | Result |
| --- | --- |
| A conflict or flag touches an eligible category | `REVIEW`, `MERCHANT_EVIDENCE_CONFLICT` |
| An eligible category resolved at an accepted trust level | `PASS` (go on to line items) |
| An eligible category, but only at a level outside `acceptedTrustLevels` | `REVIEW`, `MERCHANT_EVIDENCE_INSUFFICIENT` |
| No eligible category (none, or only ineligible ones) | `DENY`, `MERCHANT_NOT_ELIGIBLE` |

Rows are checked top to bottom. The function never returns `ALLOW`. Only the policy engine produces a decision, and only an `ALLOW` reaches `createOutgoingPaymentIfAllowed`.

The policy engine calls the resolver at decision time, not when the intent is created. A revocation then takes effect on the next purchase.

## HTTP

Shapes go in `contracts/merchant-categories/README.md`, following `contracts/open-payments/README.md`.

- `POST /merchant-category-claims`: push ingestion from wallet nodes and other push sources. The body is a signed submission. It returns `202 { entryId }`, or `4xx` with an error code. There is no session auth. The source signature is the authentication.
- `GET /merchants/categories?walletAddress=<url>`: the resolution, for the Nequi Negocios simulation and the demo screen. It returns COMPAS categories, trust levels and source ids. It never returns subject refs or raw identifiers.

## Phases

Each phase is a mergeable PR that keeps `npm run typecheck` and `npm test` green.

### Phase 0 — Decisions (people)

- [x] Write ADR 0005: the category is attached to the payee's wallet address through signed claims in a trust log. It is never carried in Open Payments metadata and never trusted from a purchase intent.
- [x] Agree on the default `acceptedTrustLevels` for the family medication mandate. The fixtures use the recommendation, `PROVIDER_VERIFIED` and `EXTERNAL_VERIFIED`. The team can revise it.
- [x] Confirm the first `COMPAS_CATEGORIES` list. Implemented as proposed. The team can revise it.

### Phase 1 — Domain, contracts, mappings (no IO)

- [x] Add `merchant-category.ts` and the type changes above. Update `domain/index.ts`.
- [x] Change `PurchaseIntent` to `merchantWalletAddressUrl`. Update both demo fixtures and `tests/fixtures/demo-fixtures.test.ts`.
- [x] Add the reason codes. Update `docs/02-domain-model.md` and `docs/05-policy-engine.md`.
- [x] Add the mapping seeds, labeled `unverified`, and `code-normalizers.ts`.
- [x] Add the JSON Schema and the contracts README.
- [x] Tests: normalizers (good and bad CIIU codes, unknown license types), mapping lookups including multi-category codes, and a schema check that rejects a `trustLevel` field.

### Phase 2 — Trust log, sources, ingestion

- [x] Add the ports, `InMemoryTrustLog`, `JsonSourceRegistry` and `subject-ref.ts`. The HMAC key comes from `MERCHANT_SUBJECT_HMAC_KEY` in `backend/.env.example`. A missing key fails at startup.
- [x] Add `claim-signature.ts` and `ingestCategoryClaim`.
- [x] Add the two `Unimplemented*Source` adapters (RUES, health registry).
- [x] Tests: every rejection path, idempotency, revocation by another source refused, a non-`MERCHANT` source sending self-declared categories refused, raw NIT never stored, and the log is append-only (no update or delete on the port).

### Phase 3 — Resolver and policy step

- [x] Add `resolveMerchantCategories` and `evaluateMerchantCategoryEvidence`.
- [x] Revise `MerchantRegistry` to `resolve(walletAddressUrl)`. Keep `UnimplementedMerchantRegistry` until the API wires the real one.
- [x] Tests: expiry, revocation, binding cap (a `SELF_DECLARED` binding caps an `EXTERNAL_VERIFIED` RUES claim), primary-vs-primary conflict, secondary code without conflict, flag leads to `REVIEW`, unmapped code yields no category, and every row of the step table.

### Phase 4 — HTTP and demo seed

- [x] Add `api/merchant-categories.ts` and wire it into `server.ts`.
- [x] Add `data/seeds/category-sources/demo-sources.json` with two sources that share one simulated wallet key: `nequi-negocios-sim/merchant` (`MERCHANT`, `SELF_DECLARED`) and `nequi-negocios-sim/kyb` (`WALLET_PROVIDER`, `PROVIDER_VERIFIED`). Both are `simulated: true`. The Ed25519 keypair is generated at startup and never committed. The source id, not the key, sets the trust level.
- [x] A seed script signs and posts the demo ladder:
  - Droguería Central: a self-declaration of `MEDICATION`, then a KYB attestation of RUT CIIU 4773 on its demo wallet.
  - The alcohol fixture's merchant: a KYB attestation of RUT CIIU 4724.
  
  The medication story then resolves to `MEDICATION` at `PROVIDER_VERIFIED`. The alcohol story resolves to `ALCOHOL` and `TOBACCO`, which gives `MERCHANT_NOT_ELIGIBLE`.
- [ ] The demo UI and the pitch label the attestation "simulated Nequi Negocios provider attestation". It is not a real Nequi signal. Not done: no UI calls the GET route yet. The response already carries `dataLabel` and `simulated`.
- [x] Tests: route-level ingestion with a good and a bad signature, and the GET response contains no subject refs.

### Later — Population (separate plan)

Not part of this plan. Questions the population plan must answer first:

- Wallet providers: what does a wallet collect at merchant KYB (NIT, RUT, Cámara certificate), and would it sign attestations? Wallets are the key partner, because without their identity binding registry evidence stays capped at `SELF_DECLARED`.
- RUES: is there an API or a bulk feed, or only lookups one NIT at a time? Is primary-vs-secondary CIIU available? What do the terms of use say about automated lookups?
  - Partly answered 2026-10-16. Confecámaras publishes monthly extracts on datos.gov.co under CC BY-SA 4.0, with a main CIIU and up to three secondary ones per establishment. See `data/seeds/merchant-registry/README.md`. Still open: shops owned by natural persons have no NIT in the seed, so they need a binding by registry key.
- Health authorities: is pharmacy establishment registration public and queryable, and in which departments? Antioquia first, for the Medellín demo.
- Uploaded documents: which Cámaras let a third party check a certificate's verification code?
- How fresh does each source need to be, and what `validUntil` does each get?
- Who operates a source's signing key once the source is real?

Each answer becomes an adapter that implements `CategorySource` and calls `ingestCategoryClaim`. Nothing else changes.

## Out of scope

- Line-item classification and the `item_category_evidence` step.
- The AI classifier. This plan only reserves the `FLAG` entry type.
- Disputes and their workflow. Revocation is the only correction path here.
- Persistence. The trust log is in memory, and a restart loses ingested claims. The seed script repopulates the demo.
- Any change to the Open Payments adapter or to `SafePaymentMetadata`.
