# COMPAS

A policy layer for purpose-restricted payments, on PayPal. Money stays where it is: COMPAS moves permission, not money.

## Public demo (PayPal AI Hackathon 2026)

| Surface | URL |
| --- | --- |
| Demo (three acts) | https://compas-paypal-web.onrender.com/demo |
| Frontend | https://compas-paypal-web.onrender.com |
| Backend `/health` | https://compas-paypal-api.onrender.com/health |

Hosted on **Render Free** (`compas-paypal-web` + `compas-paypal-api`). First visit after idle can take ~30–60s while instances wake. Visitor demos are **in memory**: a sleep/restart clears them; if that happens mid–PayPal approval, COMPAS does **not** capture (`paypalOrder=ended`).

Do **not** use `compas-backend.onrender.com` or `compas-frontend.onrender.com` — those hostnames belong to other apps.

Submission copy, judge steps, and a ≤3‑minute video script: [docs/devpost-submission.md](docs/devpost-submission.md).

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

## What is simulated vs real

| Simulated | Real (PayPal Sandbox / live services) |
| --- | --- |
| PayPal app screens for Pedro, Andrea, and the pharmacy (`/paypal`, `/paypal-delegate`, `/paypal-business`) | PayPal Orders API: create, payer approval, capture |
| Wallet KYB / Cámara fixtures for trust evidence | Elastic CUM search + Claude (or Elastic Inference) for the analyst |
| Act 3 agent *reasoning* (scripted narration) | Act 3 MCP tool calls, OAuth consent, COMPAS policy |
| Visitor demo workspaces (in memory) | Shared analyst run cache when `DATABASE_URL` is set |

COMPAS never holds money. `remainingAuthorizedAmount` is authorization capacity, not a PayPal balance.

## Proven Sandbox payment chain

Local automated E2E (2026-11-09), one capture only:

1. Mandate USD 40 · `ACTIVE`
2. Medication purchase USD 1.00 → `ALLOW`
3. PayPal order created → payer `KUHH9HTUKXYMN` · payee `FYFGX237GSG2U`
4. Pedro approved at Sandbox
5. Capture `COMPLETED`
6. Central Pharmacy received USD 1.00 (Business activity + payments API)
7. Mandate remaining USD 39.00
8. Alcohol attempt → `DENY` · no new order · budget unchanged

Harness (gitignored): `.personal-docs/paypal-e2e-audit/`. Do not re-run captures on deploy.

## Test

The backend suite covers the policy gate, PayPal, the trust matrix, the analyst, CUM mapping, the Cámara binding and errands. The live checks run against the sandbox and Elastic: `paypal:smoke`, `compas:smoke`, `cum:index` and `analyst:smoke`. Details are in [backend/README.md](backend/README.md#tests).

CI (GitHub Actions): backend typecheck + tests; frontend lint, typecheck, tests, build. No sandbox secrets in CI.

## Docs

- [AGENTS.md](AGENTS.md): context for coding agents.
- [docs/](docs/): vision, domain model, PayPal mapping, policy engine, AI, security.
- [docs/adr/](docs/adr/): decisions. 0008 is the PayPal rail, 0009 the AI analyst, 0010 errands, 0011 agents over MCP, 0012 the public demo.
- [infra/README.md](infra/README.md): deploying to Render.

## Known limitations

- Render **Free** sleeps when idle; cold starts are slow and wipe in-memory visitor workspaces. Prefer warming `/health` before a live pitch.
- Team presenter Sandbox accounts need the gated presenter link (`COMPAS_PRESENTER_KEY`). Public visitors use their own Sandbox account IDs.
- Act 3’s in-demo agent is **scripted** (real MCP calls, written reasoning). Connect a real MCP client for autonomous shopping.
- Settlement is demo-hardened (capture then history failure no longer undoes COMPLETED; incomplete ALLOW can resume the same PayPal-Request-Id). Not a claim of production-grade multi-region settlement.
- Register PayPal Sandbox return URLs for the new API host if Login with PayPal / allowlists require it (see Devpost doc).
- No Vault / payer-absent charges. No Live PayPal. No refunds/webhooks yet.

Hackathon proof of concept. Not affiliated with or endorsed by PayPal or Elastic. No production integration is implied.

## License

This project is licensed under the [MIT License](LICENSE).

