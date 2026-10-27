# ADR 0010: Errands bind a purchase to what the delegate confirmed

## Status

Accepted on 2026-10-27. Builds on design decision 4 in `AGENTS.md` ("every spend needs the delegate's action"). From the idea doc `Compas for PayPal idea definition.md`, section 2.

## Context

The purpose check refuses an off-purpose line, such as a gift card. It can't refuse an in-purpose extra: a second drug, or ten boxes of losartán, pass the purpose check, the trust matrix and the budget. Once an agent shops for the delegate, an injected instruction can add exactly that. The delegate's action has to say what may be bought, not only that something may.

## Decision

- **An errand** is what the delegate confirmed under a mandate: items, each a set of accepted INVIMA CUMs with a unit cap, a maximum amount and an expiry. `ONE_OFF` caps are totals; a `STANDING` errand refills its caps every 7 to 90 days.
- **A model drafts, only the delegate confirms.** `POST /errands/drafts` sends the delegate's words to the model, Claude or Elastic's inference endpoint (with explicit consent) and returns medicines, quantities and CUM candidates. Nothing is stored. `POST /errands` with `confirmed: true`, by the mandate's delegate, is the only way to an active errand. Every accepted CUM must be active and vigente at INVIMA.
- **Matching is set membership.** A cart line names the merchant's SKU. The backend reads the SKU's verified CUM (ADR 0009), and the line fits an item only if that CUM is one the delegate accepted. COMPAS does not decide which drugs are equivalent.
- **`ERRAND_MISMATCH` is a hold.** A line without a verified CUM, a CUM on no item, too many units or too much money gives `REVIEW`, even under `MONITORED`: monitoring relaxes purpose rules, not the delegate's own confirmation. An errand that is another delegate's, or under another mandate, is a hard `DENY` (`DELEGATE_NOT_AUTHORIZED`).
- **Units are reserved like capacity.** An `ALLOW` reserves the cart's units atomically after the capacity. If another purchase took them first, the capacity is given back and the decision is `REVIEW`. Units come back wherever capacity does: an order PayPal refuses, the payer cancels, or that expires.
- **Errands are health data** (Ley 1581 de 2012). They stay in COMPAS. A PayPal order still carries only opaque references and "Item 1" lines. The analyst and the search index never see an errand.

## Consequences

- The demo's second beat, an injected second box, is `REVIEW ERRAND_MISMATCH` with no PayPal order.
- A purchase without an errand works as before. Requiring an errand for agent delegates belongs to the MCP phase.
- Items accept CUMs because this MVP covers medicine only. The schema stores them as `{ registry, code }`, so an errand for another category can name another registry's codes.
- Errands and reservations are in memory. Their tables are in `20261027170000_analyst_errands.sql`, applied on 2026-10-27 and empty until there are Postgres adapters.
- "La de siempre" relies on the delegate picking the CUMs in the draft: COMPAS keeps no per-purchase CUM history to look up.
