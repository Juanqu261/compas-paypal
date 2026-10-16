# Demo story

This is the only scenario the MVP needs to prove. Names and amounts below are the product story. Runnable demo data lives in `src/demo/scenarios/` and is labeled `demo/test data`.

ARQ, Nequi, and Nequi Negocios are simulated wallet surfaces. They show how COMPAS could be embedded in existing apps. They are not production integrations with those companies.

## People

- Pedro is the payer. He lives abroad and holds a USD wallet. In the demo, his wallet surface is the ARQ simulation.
- Andrea is the delegate. She lives with Gladys and has a Nequi account. She does not receive Pedro's USD 40.
- Gladys is the beneficiary. She does not manage a wallet.
- The pharmacy is the merchant. Its surface is the Nequi Negocios simulation. The merchant wallet is the payee.

## Mandate

Pedro creates a mandate inside his existing wallet experience:

- payer: Pedro
- delegate: Andrea
- beneficiary: Gladys
- budget: USD 40
- purpose: `MEDICATION`
- status: `ACTIVE`
- expiration: configurable

Andrea obtains delegated spending capacity. The USD 40 stays in Pedro's wallet until a later eligible payment.

Pedro can authorize that capacity before Andrea knows which eligible pharmacy she will use. That fits an Open Payments outgoing-payment grant whose recipient is not known yet. See [04-open-payments-mapping.md](04-open-payments-mapping.md).

## Approved medication purchase

Andrea visits a pharmacy that participates in COMPAS and presents merchant and category information. She initiates payment, for example by a QR interaction. COMPAS evaluates the purchase against Pedro's mandate.

If the decision is `ALLOW`, COMPAS may start the Open Payments flow:

```text
Pedro's wallet -> Open Payments -> merchant wallet
```

Andrea is the delegate, not the recipient of the USD 40.

The demo may show a USD payer wallet and a COP merchant wallet. Any exchange or cost figure must come from an Open Payments quote or be labeled as a demo fixture. This repository does not hardcode a rate.

## Rejected alcohol purchase

If Andrea tries to use the same mandate at a liquor store, or for alcohol, COMPAS must return a denial such as `PURPOSE_MISMATCH` before anyone creates or executes an outgoing payment. `OpenPaymentsGateway.createOutgoingPayment()` must not be called.

## What the audience sees

`/demo` is the pitch surface: three phone frames, one shared scenario. `/arq`, `/nequi`, and `/nequi-negocios` render the same experience components alone. The audience should not have to visit those routes during the pitch.

## Out of the MVP UI

A treasury mandate for `LABOR_CONTRACTS`, or an NGO mandate, uses this same story shape later. It is documented in [00-product-vision.md](00-product-vision.md) and is not a second application.
