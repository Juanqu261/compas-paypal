# COMPAS

A policy layer for purpose-restricted payments, on PayPal. Money stays where it is: COMPAS moves permission, not money.

## The idea

Pedro, abroad, wants up to USD 40 available for his grandmother Gladys's medicines. Andrea, who lives with Gladys, can buy them but must not receive the money.

- Pedro creates a **mandate**: Andrea may pay for `MEDICATION`, up to USD 40.
- Andrea buys at a pharmacy. COMPAS checks the cart against the mandate.
- On `ALLOW`, COMPAS creates a PayPal order payable to the pharmacy. Pedro approves it at PayPal, and COMPAS captures it. Alcohol is denied before any order exists.

### The AI layer

- **Analyst.** An AI analyst reviews merchants ahead of time. It maps catalogs to INVIMA medicine codes (CUM) with Elastic, and flags lookalike shops. A deterministic verifier checks every mapping against INVIMA's data. The AI only finds evidence; it never raises a shop's trust, and it never authorizes a payment.
- **Binding.** Log in with PayPal and a Cámara de Comercio certificate bind a PayPal account to a registered business.
- **Errands.** Andrea confirms an errand ("one box of losartán 50 mg"). A cart with anything more is held for review.
- **MCP endpoint.** Any AI agent can shop for Andrea through `POST /mcp`, which has four tools: `search_eligible_merchants`, `check_purchase`, `propose_purchase` and `get_mandate_status`. The agent is limited to the errands Andrea gave it, names only SKUs and quantities, and has no PayPal tool. Act 3 of `/demo` shows one working: a scripted agent making real MCP calls, with Andrea's consent and the server's own log. See [contracts/agents/](contracts/agents/README.md).

## Repository

| Path | What |
| --- | --- |
| `frontend/` | Next.js demo: `/demo`, `/paypal` (Pedro), `/nequi` (Andrea), `/paypal-business` (online pharmacy) |
| `backend/` | Domain, policy, PayPal, analyst, HTTP API. See [backend/README.md](backend/README.md) |
| `contracts/` | API contracts shared by frontend and backend |
| `data/` | Seeds, demo fixtures, Postgres migrations |
| `docs/` | Product, architecture, ADRs |

The PayPal, PayPal Business and Nequi screens are simulations. The PayPal orders are real sandbox orders.

## Run

```bash
cd backend && npm install && npm run dev     # API on :4000
cd frontend && npm install && npm run dev    # demo on http://localhost:3000
```

Configuration goes in `backend/.env`, starting from `backend/.env.example`.

## Test

```bash
cd backend && npm run typecheck && npm test
cd frontend && npm run typecheck && npm test
```

The backend suite covers the policy gate, PayPal, the trust matrix, the analyst, CUM mapping, the Cámara binding and errands. The live checks run against the sandbox and Elastic: `paypal:smoke`, `compas:smoke`, `cum:index` and `analyst:smoke`. Details are in [backend/README.md](backend/README.md#tests).

## Docs

- [AGENTS.md](AGENTS.md): context for coding agents.
- [docs/](docs/): vision, domain model, PayPal mapping, policy engine, AI, security.
- [docs/adr/](docs/adr/): decisions. 0008 is the PayPal rail, 0009 the AI analyst, 0010 errands, 0011 agents over MCP.

Hackathon proof of concept. Not affiliated with or endorsed by PayPal, Nequi or Elastic. No production integration is implied.
