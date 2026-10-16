# Product vision

COMPAS is an embedded authorization and policy layer for programmable payments.

Money stays where it is. COMPAS moves permission, not money.

## Problem

Someone who holds funds often wants another person to cause a payment without handing that person the money. Pedro, living abroad, wants up to USD 40 available for his grandmother Gladys's medication in Colombia. Gladys does not manage a wallet. Andrea, who lives with Gladys, does. Sending USD 40 to Andrea would make Andrea the owner of unrestricted funds. Pedro wants a limited capacity to cause a future payment, and he wants that capacity used only for medication.

The same shape appears when a treasury, company, or NGO allocates funds for a purpose and a delegate must pay an eligible provider later. The MVP does not implement those cases. They reuse the same mandate.

## Concept

A payer creates a COMPAS mandate. The mandate names a delegate, a beneficiary, a budget, a purpose policy, and a validity window. The delegate does not receive the budget. The delegate receives permission to initiate a payment that COMPAS will check.

At payment time COMPAS evaluates the proposed purchase. Only an `ALLOW` decision may continue into Open Payments. The payment then runs from the payer's wallet to the merchant's wallet. The delegate is not the payee.

Purpose-Bound Money binds the money. COMPAS binds the permission to spend it. COMPAS did not invent restricted-purpose or programmable payments. Prior art is summarized in [09-research-and-prior-art.md](09-research-and-prior-art.md).

## What COMPAS is

COMPAS is a non-custodial policy and authorization layer that can sit inside an existing wallet experience. It decides whether a proposed payment is inside a mandate, records why, and only then allows an Open Payments flow to start.

## What COMPAS is not

COMPAS is not a bank, a wallet, a payment rail, a stored-value account, or a custodian of funds. It is not a token, a cryptocurrency, or a blockchain project. It is not a standalone consumer application or a dashboard product. The hackathon UI is a simulation harness for three existing-wallet surfaces, not three new financial products.

## Permission, not custody

`remainingAuthorizedAmount` is authorization capacity. It is not a balance COMPAS holds and not money that has moved to the delegate. Reducing it records consumed permission. The payer's wallet still holds the funds until Open Payments executes a payment to the merchant.

Open Payments can limit how much and when a client may create outgoing payments. COMPAS adds who may cause a payment, for whom, and for which purpose. `MEDICATION` is a COMPAS policy concept. It is not an Open Payments scope.

## Same primitive, later contexts

The mandate is the only authorization primitive:

- A person authorizes medication spending for a family member.
- A business authorizes a delegate to pay eligible suppliers.
- An NGO authorizes field spending against a program purpose.
- A public treasury authorizes a project manager to pay eligible labor providers from a `LABOR_CONTRACTS` allocation. A purchase classified as `MATERIALS` is not funded from that mandate.

Those extensions stay on the roadmap. The MVP proves the family medication flow, and the rejection of an ineligible purchase before any outgoing payment.

COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail. It does not solve corruption, fraud, or collusion.
