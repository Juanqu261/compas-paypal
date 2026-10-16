# Product

COMPAS is an embedded authorization and policy layer for programmable payments.

Money stays where it is. COMPAS moves permission, not money.

A payer creates a mandate that gives a delegate limited capacity to cause a future payment for a stated purpose. The delegate does not receive the funds. `remainingAuthorizedAmount` is authorization capacity, not a wallet balance and not custody.

COMPAS is not a wallet, a bank, a payment rail, a custody account, a token, a blockchain project, or a consumer dashboard.

## Demo story

Pedro is the payer. He holds a USD wallet and wants up to USD 40 available for medication for Gladys. Gladys is the beneficiary and does not manage a wallet. Andrea is the delegate. She lives with Gladys and must not receive the USD 40 as unrestricted money.

A pharmacy purchase for `MEDICATION` is the allowed story. An alcohol purchase against the same mandate must be rejected before any outgoing payment.

ARQ, Nequi, and Nequi Negocios are simulated embedding surfaces. They are not production integrations.

The same mandate can later describe a business, NGO, or government allocation. The MVP UI implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail. It does not solve corruption.
