# Demo story

This is the only scenario the MVP needs to prove. Names and amounts below are the product story. Runnable demo data lives in `data/fixtures/demo/` and is labeled `demo/test data`.

The PayPal app, Nequi, and Nequi Negocios screens are simulated wallet surfaces. They show how COMPAS could be embedded in existing apps. They are not production integrations with those companies. The PayPal orders are real sandbox orders: Pedro approves each one at the PayPal sandbox, outside the simulation.

## People

- Pedro is the payer. He lives abroad and pays with his PayPal account, in USD. In the demo, his wallet surface is a simulation of the PayPal app, and his PayPal is a sandbox personal account.
- Andrea is the delegate. She lives with Gladys and has a Nequi account. She does not receive Pedro's USD 40.
- Gladys is the beneficiary. She does not manage a wallet.
- The pharmacy is the merchant. Its surface is the Nequi Negocios simulation. Its PayPal business account is the payee.

## Mandate

Pedro creates a mandate inside his existing wallet experience:

- payer: Pedro
- delegate: Andrea
- beneficiary: Gladys
- budget: USD 40
- purpose: `MEDICATION`
- status: `ACTIVE`
- expiration: configurable

Andrea obtains delegated spending capacity. The USD 40 stays in Pedro's PayPal until a later eligible payment.

Pedro authorizes that capacity before Andrea knows which eligible pharmacy she will use. Nothing is asked of PayPal then: each allowed purchase becomes a PayPal order for that exact cart, which Pedro approves. See [04-paypal-mapping.md](04-paypal-mapping.md).

## Approved medication purchase

Andrea visits a pharmacy that participates in COMPAS and presents merchant and category information. She initiates payment, for example by a QR interaction. COMPAS evaluates the purchase against Pedro's mandate.

If the decision is `ALLOW`, COMPAS creates a PayPal order payable to the pharmacy, and Pedro approves it in his PayPal:

```text
Pedro's PayPal -> PayPal (order approved by Pedro, captured by COMPAS) -> pharmacy's PayPal
```

Andrea is the delegate, not the recipient of the USD 40.

The charge and the budget are both in USD. COMPAS does not convert currencies, and PayPal takes no COP. PayPal handles Pedro's own funding currency when he approves. This repository does not hardcode a rate.

## Rejected alcohol purchase

If Andrea tries to use the same mandate at a liquor store, or for alcohol, COMPAS must return a denial such as `PURPOSE_MISMATCH` before any PayPal order exists. `PayPalGateway.createOrder()` must not be called.

## What the audience sees

`/demo` is the pitch surface: three phone frames, one shared scenario. `/paypal`, `/nequi`, and `/nequi-negocios` render the same experience components alone. The audience should not have to visit those routes during the pitch.

## Out of the MVP UI

A treasury mandate for `LABOR_CONTRACTS`, or an NGO mandate, uses this same story shape later. It is documented in [00-product-vision.md](00-product-vision.md) and is not a second application.
