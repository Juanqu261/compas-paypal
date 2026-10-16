# COMPAS

COMPAS is an embedded authorization and policy layer for purpose-restricted payments on existing wallets.

Money stays where it is. COMPAS moves permission, not money.

## The problem

Pedro lives abroad and holds a USD wallet. He wants up to USD 40 available for medication for his grandmother Gladys in Colombia. Gladys does not use a wallet. Andrea, Pedro's sister, lives with Gladys and has a Nequi account. Pedro does not want to send Andrea USD 40 as unrestricted money. He wants Andrea to cause a payment only for Gladys's medication.

## The idea

Pedro creates a mandate: Andrea may initiate payments, up to USD 40, for purpose `MEDICATION`, until the mandate expires. Andrea does not receive the funds. When she pays a pharmacy, the backend checks the mandate. If the decision is allow, Open Payments moves money from Pedro's wallet to the merchant. If she tries to buy alcohol, COMPAS denies the intent before any outgoing payment exists.

The same mandate can later express a business, NGO, or government allocation. The hackathon MVP implements the family story only. COMPAS can reduce unauthorized use of allocated funds by enforcing purpose restrictions at payment time and producing an auditable decision trail.

## What COMPAS is not

COMPAS is not a wallet, not a bank, and not a custodian of funds. It is not another consumer app, a token, or a blockchain. It is a policy layer that a wallet can embed.

## Demo surfaces

| Route | Who |
| --- | --- |
| `/demo` | All three phones, one shared scenario |
| `/arq` | Pedro, payer |
| `/nequi` | Andrea, delegate |
| `/nequi-negocios` | Pharmacy, merchant |

These routes belong to the frontend. `/demo` is the pitch surface. ARQ, Nequi, and Nequi Negocios are simulations of embedding, not live integrations.

## Repository

```text
frontend/     Next.js demo and wallet simulations
backend/      COMPAS runtime, policy, and Open Payments boundary
data/         Demo fixtures and future schemas
contracts/    Future API and event contracts
infra/        Future deployment material
docs/         Product, architecture, and research
prompts/      Exact AI coding prompts
.AGENTS/      Shared instructions for coding agents
```

Details and diagrams: [docs/03-architecture.md](docs/03-architecture.md).

## Open Payments

Open Payments is the payment layer: wallet addresses, grants, incoming payments, quotes, and outgoing payments. COMPAS is the purpose layer: mandate, delegate, beneficiary, merchant evidence, and the allow or deny decision. An outgoing-payment grant can exist before the pharmacy is known, which is what lets Pedro authorize a budget first. No Open Payments call is implemented yet. Mapping: [docs/04-open-payments-mapping.md](docs/04-open-payments-mapping.md).

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

`npm run dev` in `frontend/` serves the demo at [http://localhost:3000](http://localhost:3000). `npm run dev` in `backend/` serves `GET /health` on port 4000.

## Environment variables

Open Payments client settings belong in `backend/.env.example`. Leave them empty until a later task. Do not commit a private key, and do not expose those values to the frontend.

## AI usage

Disclosure: [AI_USAGE.md](AI_USAGE.md). Prompts: [prompts/](prompts/). Shared agent context: [AGENTS.md](AGENTS.md) and [.AGENTS/](.AGENTS/).

## Research and prior art

Purpose-bound money, ERC-7291, transfer design, and merchant inclusion are summarized in [docs/09-research-and-prior-art.md](docs/09-research-and-prior-art.md). COMPAS does not claim to have invented programmable payments.

## Disclaimer

This is a hackathon proof of concept. ARQ, Nequi, and Nequi Negocios are simulated integration surfaces. The project is not affiliated with or endorsed by those companies. No production banking integration is implied.
