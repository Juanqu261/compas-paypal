---
name: compas-context
description: Product context for COMPAS, the non-custodial authorization and policy layer that lets a payer (a relative abroad, later a state food-bonus program) authorize a delegate to cause payments that COMPAS allows only at merchants eligible for a purpose such as MEDICATION. Gives the design rationale, the decisions taken, the Colombian research and the pitch guardrails behind the repo docs. Use when building, extending, demoing or pitching COMPAS, or when a task mentions mandates, purpose policy, merchant categories or trust levels, CIIU/RUES, bonos alimentarios, NFC cards or the Open Payments Hackathon Medellín.
---

# COMPAS context

**Precedence:** `AGENTS.md` and `docs/` are the source of truth for code. This skill adds *why* and *what comes after the MVP*. If anything here conflicts with them, follow the repo and flag the conflict.

COMPAS moves permission, not money. A **payer** authorizes a capped Open Payments grant once. A **delegate** initiates purchases. COMPAS returns `ALLOW` only when the merchant and items fit the mandate's purpose. The money goes from the payer's wallet straight to the merchant's wallet.

> Pitch line: "Open Payments enforces the consent and the cap. COMPAS enforces the purpose."

Pair this with `.skills/hackathon-ai-rules` (AI_USAGE.md, prompts/, code freeze). Flow mapping, CIIU rules, research figures and sources are in [REFERENCE.md](REFERENCE.md).

## Vocabulary (use the repo terms)
| Design-session term | Repo term |
|---|---|
| Funder (Juan abroad / state program) | **Payer** (Pedro, ARQ simulation) |
| Person at the counter (Mamá) | **Delegate** (Andrea, Nequi simulation); Gladys is the **beneficiary** |
| Allowance | **Mandate** (`budget`, `remainingAuthorizedAmount`, `purposePolicy`) |
| Category | Purpose / category, e.g. `MEDICATION`. A COMPAS concept, never an Open Payments scope |
| Wallet-node attestation | `PROVIDER_VERIFIED` claim |
| RUES / Cámara de Comercio check | `EXTERNAL_VERIFIED` claim |

## Decisions from the design session (do not re-litigate)
1. **Pull at the point of sale.** There is no push to the delegate and no escrow. COMPAS holds no funds and no money ledger.
2. **Deterministic rules decide; AI only classifies.** Low confidence fails closed (`REVIEW`/`DENY`). AI can also *flag* a merchant whose behavior contradicts its claims. It never authorizes.
3. **Purpose is checked per merchant plus line items.** Rich purchase detail stays in the COMPAS audit trail. Open Payments metadata carries **only** `compasMandateId`, `compasDecisionId` and `externalReference`.
4. **Every spend needs the delegate's action.** Otherwise any eligible merchant could drain a grant.
5. **Federated trust, one central registry.** Each wallet is the authority on its own merchants and signs attestations (Ed25519, the same key type Open Payments clients use). The registry is an append-only trust log of claims, checks, AI flags and disputes. There is no blockchain.
6. **One Mandate primitive** for a family, a business, an NGO or a government allocation.
7. **Business model:** programs and payers pay; merchants join free (state bonus money is their reason to register); wallets gain users and remittance flows.

## Scope ladder
- **MVP (per AGENTS.md):** Pedro's medication mandate with interactive consent → Andrea's pharmacy purchase → `ALLOW` → quote → outgoing payment → completed. Alcohol → `PURPOSE_MISMATCH`, and no `createOutgoingPayment` call.
- **Next, only when asked:**
  - Payer exception approval: `REVIEW` → the payer approves a one-off grant pinned to that incoming payment (`limits.receiver`).
  - `PROVIDER_VERIFIED` claims from a simulated wallet node with signature checks.
  - An AI classifier for ambiguous lines.
- **Roadmap (pitch only unless asked):**
  - State bonus mandates such as Medellín Cero Hambre, with split tender: several outgoing payments into one incoming payment, the bonus paid first.
  - An NFC card + PIN for a beneficiary with no smartphone (Web NFC, Android Chrome only).
  - Merchant anomaly detection over time.
  - Real RUES/Nequi adapters.

## Guardrails for agents and the pitch
- Grant limits are only `debitAmount` | `receiveAmount`, `interval` and `receiver`. Say plainly that purpose enforcement is COMPAS's job.
- No Colombian Open Payments provider is live: "If Nequi or Puntored ran Rafiki, these surfaces plug in unchanged." ARQ, Nequi and Nequi Negocios are simulations.
- The test wallet is USD/EUR. Any COP figure comes from a quote or is labeled `demo/test data`.
- Don't claim fraud that isn't documented, such as bonus resale. Do cite the documented problems listed in REFERENCE.md.
