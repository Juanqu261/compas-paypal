# ADR 0009: The AI analyst finds evidence; sources attest it

## Status

Accepted on 2026-10-27. Amends [ADR 0003](0003-ai-is-advisory.md) and [ADR 0007](0007-merchant-confidence-matrix.md). From the idea doc `Compas for PayPal idea definition.md`, section 1.

## Context

The trust matrix needs manual research: reading a shop's Cámara de Comercio certificate, mapping its catalog to medicines, noticing when a "pharmacy" sells gift cards. A model can do that research. ADR 0003 says AI is advisory, and ADR 0007 says behaviour can only lower trust. An analyst must not become a way to raise a shop's confidence, whether it is fooled, prompt-injected by a storefront, or simply wrong.

On the PayPal rail, `PROVIDER_VERIFIED` is empty: PayPal signs no category attestations. `HIGH` then needs `EXTERNAL_VERIFIED`, which needs a binding of the PayPal account to a NIT.

## Decision

- **Two kinds of output, with different standing.**
  - A **pointer** names checkable evidence: "SKU x is CUM y", "this certificate's verification code is z". It counts only after a deterministic verifier re-reads it from the source, and then as that source's evidence. A CUM is re-read from INVIMA's dataset (`CumRegistry`), never from the search index or the model. A certificate is re-read from the Cámara (`CamaraVerifier`), and the Cámara's record, not the model's reading, is what enters the trust log.
  - A **judgment** is what no source can check: "4 of 6 products are not medicines", "this shop imitates another". It can only become a `FLAG` on one declared category. A flag gives `REVIEW` (`MERCHANT_EVIDENCE_CONFLICT`). It never adds support.
- **The analyst runs ahead of time.** At onboarding, on request (`POST /analyst/jobs`) or on a schedule, never inside a checkout. A checkout reads the stored, verified mapping.
- **Elastic finds, the source decides.** The CUM index in Elastic (`compas-cum-v1`, built by `npm run cum:index` from datos.gov.co) proposes candidates. The model may choose only among the candidates given for that SKU; any other CUM is dropped before verification. The verifier (`cum-verifier.2`) checks the CUM is active and vigente and not a free sample (`MUESTRA MÉDICA`, which can't be sold), and that the SKU names every ingredient, strength and the form, and the box size when it states one. A record the rules can't read is rejected, never guessed.
- **CUM is this MVP's registry, not COMPAS's.** The MVP covers one category, medicine (`MEDICATION`), and its pointers are INVIMA CUM codes. Other categories may need other registries with their own codes and checks: a food product carries an INVIMA sanitary registration (RSA, NSA, PSA), which names no strength or box size. Each registry would get its own search index (`compas-cum-v1` is the first), its own source adapter and its own verifier, and a category would list the registries that count as its evidence. A category with no source a verifier can re-read gets judgments only, never verified mappings. The schema stores a mapping as `(registry, code)` with `INVIMA_CUM` as the only registry. The code keeps CUM-specific names until a second category is built.
- **The model is Claude** (`claude-haiku-5-5`, Claude API), with the tool's schema as a structured output; without `ANTHROPIC_API_KEY`, Elastic's Inference API (`chat_completion`) with one forced tool call. Elastic's hosted LLMs answered `403` on the team's trial project, so Claude is the default. Either way, the answer is parsed by COMPAS: a shape error fails the whole run closed and writes nothing. Merchant text reaches the model only inside a delimited data block, and the prompt says it is data.
- **The off-purpose flag is a rule over the model's item classes:** at least 2 SKUs and at least a third of the catalog not medicines. Lookalike signals flag on their own, citing SKUs of the batch.
- **Flags are appealable.** The merchant can answer (`POST /analyst/findings/:id/response`). An answer changes nothing in the trust log. Only a human reviewer withdraws a flag, with a `REVOCATION` from the analyst's source (`POST /operator/findings/:id/withdraw`, operator token). The analyst never withdraws its own flags, so a fooled model can't clear one.
- **The binding.** Log in with PayPal proves control of the merchant's PayPal account (its payer id must be the merchant id) and gives its verified email. The analyst reads the certificate's code and NIT; the Cámara's record must have that NIT. The record's CIIU codes enter the trust log as a registry claim about the NIT, and the upload as the merchant's own binding (`REGISTRY_UNBOUND`, at most `MEDIUM`). Only when the record's notification email is the account's confirmed PayPal email does the Cámara source bind the NIT to the account: `EXTERNAL_VERIFIED`, and `HIGH` is reachable.
- **New trust-log sources.** `compas-analyst` (kind `COMPAS_ANALYST`, `FLAG` only) and `compas-onboarding/merchant` (the merchant's own binding) are always registered. `camara-fixture` (`BUSINESS_REGISTRY`, `EXTERNAL_VERIFIED`) is simulated and registered with the demo seed only.

## Consequences

- A fooled or injected analyst can at worst miss a flag or raise a false, appealable one. It cannot raise confidence: tests cover a model that calls every gift card a medicine.
- A shop that uploads another shop's certificate binds that NIT only by its own word. The existing rule for one NIT bound to two accounts then contests the impostor and leaves the verified owner at `HIGH`.
- A merchant who renames a SKU after verification loses the mapping: it counts only for the SKU text that was checked.
- The Cámara check is a fixture (`data/seeds/camara`, `demo/test data`). A real Cámara adapter replaces `FixtureCamaraVerifier` behind the same port.
- Findings, catalogs and mappings are in memory. Their tables are in `data/migrations/20261027170000_analyst_errands.sql`, applied on 2026-10-27 and empty until there are Postgres adapters.
- `CONTESTED` by confirmation of a flag (by a deterministic check or a reviewer) and AI contradiction of captured lines are not built.
