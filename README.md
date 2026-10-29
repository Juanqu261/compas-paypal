# COMPAS

A policy layer for purpose-restricted payments, on PayPal. Money stays where it is: COMPAS moves permission, not money.

## The idea

Pedro, abroad, wants up to USD 40 available for his grandmother Gladys's medicines. Andrea, who lives with Gladys, can buy them but must not receive the money. Pedro, Andrea and the pharmacy are all on PayPal.

- **Pedro** creates a **mandate**: Andrea may pay for `MEDICATION`, up to USD 40.
- **Andrea** buys at a pharmacy. COMPAS checks the cart against the mandate. Alcohol is denied before any order exists.
- On `ALLOW`, COMPAS creates a **PayPal order** payable to the pharmacy's PayPal Business account. **Pedro approves it at PayPal**, and COMPAS captures it.

### Why PayPal

- The money never leaves Pedro's PayPal account and never reaches Andrea.
- Every payment is a PayPal order that Pedro approves and COMPAS captures, so PayPal stays the rail and the authority.
- The pharmacy is paid directly, as a verified PayPal Business account.
- COMPAS adds the purpose: what the money may buy, checked before PayPal is asked to move anything.

### The AI layer

- **Analyst.** An AI analyst reviews merchants ahead of time. It maps catalogs to INVIMA medicine codes (CUM) with Elastic, and flags lookalike shops. A deterministic verifier checks every mapping against INVIMA's data. The AI only finds evidence; it never raises a shop's trust, and it never authorizes a payment.
- **Binding.** Log in with PayPal and a Cámara de Comercio certificate bind a PayPal account to a registered business.
- **Errands.** Andrea confirms an errand ("one box of losartán 50 mg"). A cart with anything more is held for review.
- **MCP endpoint.** Any AI agent can shop for Andrea through `POST /mcp`, which has four tools: `search_eligible_merchants`, `check_purchase`, `propose_purchase` and `get_mandate_status`. The agent is limited to the errands Andrea gave it, names only SKUs and quantities, and has no PayPal tool. Act 3 of `/demo` shows one working: a scripted agent making real MCP calls, with Andrea's consent and the server's own log. See [contracts/agents/](contracts/agents/README.md).

## Repository

| Path | What |
| --- | --- |
| `frontend/` | Next.js demo: `/demo`, `/paypal` (Pedro), `/paypal-delegate` (Andrea), `/paypal-business` (online pharmacy) |
| `backend/` | Domain, policy, PayPal, analyst, HTTP API. See [backend/README.md](backend/README.md) |
| `contracts/` | API contracts shared by frontend and backend |
| `data/` | Seeds, demo fixtures, Postgres migrations |
| `docs/` | Product, architecture, ADRs |

The PayPal screens (Pedro's, Andrea's and the pharmacy's PayPal Business) are simulations. The PayPal orders are real sandbox orders.

## Run

```bash
cd backend && npm install && npm run dev     # API on :4000
cd frontend && npm install && npm run dev    # demo on http://localhost:3000
```

Configuration goes in `backend/.env`, starting from `backend/.env.example`.

### Connect your own AI agent

Any MCP client can shop for Andrea, locally. With Claude Code:

```bash
claude mcp add --transport http compas http://localhost:4000/mcp
```

1. Open `/demo` and give Andrea an errand: run Act 3 once, or set up a budget and an errand in Act 2. Choose the sandbox accounts in Act 2 if the agent should create a PayPal order.
2. Sign the client in (in Claude Code: `/mcp`, then `compas`, then Authenticate). It opens `/agents/authorize` in your default browser. Use the browser where `/demo` is open, because the consent screen acts as that demo's Andrea and lists her open errands.
3. Andrea picks the errands the agent may use. Then ask the agent to buy one, for example "Pide la losartán de mi abuela". It has four tools: `search_eligible_merchants`, `check_purchase`, `propose_purchase` and `get_mandate_status`. An `ALLOW` creates a PayPal order that Pedro approves on his phone in Act 2. The agent can't approve it.

What the agent did is in Act 3's server log and in Pedro's and Andrea's activity. The routes and tools are in [contracts/agents/](contracts/agents/README.md).

## Test

The backend suite covers the policy gate, PayPal, the trust matrix, the analyst, CUM mapping, the Cámara binding and errands. The live checks run against the sandbox and Elastic: `paypal:smoke`, `compas:smoke`, `cum:index` and `analyst:smoke`. Details are in [backend/README.md](backend/README.md#tests).

## Docs

- [AGENTS.md](AGENTS.md): context for coding agents.
- [docs/](docs/): vision, domain model, PayPal mapping, policy engine, AI, security.
- [docs/adr/](docs/adr/): decisions. 0008 is the PayPal rail, 0009 the AI analyst, 0010 errands, 0011 agents over MCP, 0012 the public demo.
- [infra/README.md](infra/README.md): deploying to Render.

Hackathon proof of concept. Not affiliated with or endorsed by PayPal or Elastic. No production integration is implied.
