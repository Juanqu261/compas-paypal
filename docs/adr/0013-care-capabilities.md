# ADR 0013 — Care capabilities on the existing gate

## Status

Accepted for the hackathon demo. The new state lives in the visitor's in-memory workspace, the same place as mandates and errands. `data/migrations/20261111140000_capabilities.sql` is additive and has not been applied.

## Decision

Five capabilities extend the existing domain. They do not add a wallet, a second agent, or a PayPal charge that the payer did not approve.

1. **Fulfillment evidence.** After a completed purchase, a payer or delegate may submit a structured receipt. A deterministic verifier compares merchant, CUM, quantity and amount. `VERIFIED_DOCUMENT_MATCH` means the document matches. It does not mean the goods were delivered. A mismatch does not change the payment status.
2. **Offer comparison.** `compare_offers` ranks catalog prices for one confirmed CUM. A model may explain the result. It cannot mark an ineligible merchant eligible, invent a price, or invent stock. Availability is `UNKNOWN`.
3. **Basket partition.** Each line is classified on its own. Only the eligible lines can be sent to the purchase gate. The personal lines are not a COMPAS payment and are not marked paid.
4. **Refund reconciliation.** Capacity is restored only for a completed refund, only while the mandate is active and inside its window, and only once per PayPal refund id. Webhook bodies are not trusted. Without `PAYPAL_WEBHOOK_ID` every notification is refused. The demo's partial refund is labeled `DEMO_SIMULATION` and uses the same accounting.
5. **Care plans.** A monthly plan prepares an errand for a period. Generating a cycle does not create a PayPal order. A revoked plan does not resume and does not generate another cycle.

## Consequences

The public demo panel calls these routes. Act 2 remains the path that creates a sandbox order. The migration is pending until someone applies it on purpose to a database that already has the PayPal schema. Do not re-run `20261026120000_paypal_rail.sql`.
