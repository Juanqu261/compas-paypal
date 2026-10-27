# COMPAS

COMPAS is an embedded authorization and policy layer for purpose-restricted payments, on PayPal.

Money stays where it is. COMPAS moves permission, not money.

## The problem

Pedro lives abroad and pays with PayPal, in USD. He wants up to USD 40 available for medication for his grandmother Gladys in Colombia. Gladys does not use a wallet. Andrea, Pedro's sister, lives with Gladys and has a Nequi account. Pedro does not want to send Andrea USD 40 as unrestricted money. He wants Andrea to cause a payment only for Gladys's medication.

## The idea

Pedro creates a mandate: Andrea may initiate payments, up to USD 40, for purpose `MEDICATION`, until the mandate expires. Andrea does not receive the funds. When she pays a pharmacy, the backend checks the mandate. If the decision is allow, COMPAS creates a PayPal order for that exact cart, payable to the pharmacy. Pedro approves it in his PayPal, and the money goes straight from his PayPal to the pharmacy's. If she tries to buy alcohol, COMPAS denies the intent before any PayPal order exists.

The same mandate can later express a business, NGO, or government allocation. The hackathon MVP implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail.

## What COMPAS is not

COMPAS is not a wallet, not a bank, and not a custodian of funds. It is not another consumer app, a token, or a blockchain. It is a policy layer that a wallet can embed.

## Demo surfaces

| Route | Who |
| --- | --- |
| `/demo` | All three phones, one shared scenario |
| `/paypal` | Pedro, payer |
| `/nequi` | Andrea, delegate |
| `/nequi-negocios` | Pharmacy, merchant |

These routes belong to the frontend. `/demo` is the pitch surface. The PayPal app, Nequi, and Nequi Negocios screens are simulations of embedding, not live integrations. The PayPal orders behind them are real sandbox orders.

## Repository

```text
frontend/     Next.js demo and wallet simulations
backend/      COMPAS runtime, policy, and PayPal boundary
data/         Demo fixtures and future schemas
contracts/    Future API and event contracts
infra/        Future deployment material
docs/         Product, architecture, and research
AGENTS.md     Context for coding agents
```

Details and diagrams: [docs/03-architecture.md](docs/03-architecture.md).

## PayPal

PayPal is the payment layer: the order, the payer's approval at PayPal, and the capture that pays the merchant directly. COMPAS is the purpose layer: mandate, delegate, beneficiary, budget, merchant evidence, and the allow or deny decision. Pedro authorizes a budget in COMPAS before the pharmacy is known, and approves each allowed purchase at PayPal. COMPAS runs on the PayPal sandbox only. Mapping: [docs/04-paypal-mapping.md](docs/04-paypal-mapping.md). Decision: [ADR 0008](docs/adr/0008-paypal-rail-per-order-approval.md).

## Development

There is no install or dev command at the repository root.

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Backend:

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm start
```

`npm run dev` in `frontend/` serves the demo at [http://localhost:3000](http://localhost:3000). `npm run dev` in `backend/` serves the COMPAS API and the PayPal return routes on port 4000. `npm run paypal:smoke` in `backend/` runs one real PayPal sandbox payment. See `backend/README.md`.

## Environment variables

PayPal sandbox app credentials and the demo's sandbox accounts belong in `backend/.env`, from `backend/.env.example`.

## Coding agents

Shared context for coding agents: [AGENTS.md](AGENTS.md).

## Research and prior art

Purpose-bound money, ERC-7291, transfer design, and merchant inclusion are summarized in [docs/09-research-and-prior-art.md](docs/09-research-and-prior-art.md). COMPAS does not claim to have invented programmable payments.

## Disclaimer

This is a hackathon proof of concept. The project is not affiliated with or endorsed by those companies. No production banking integration is implied.
