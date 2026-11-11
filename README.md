# COMPAS

COMPAS turns ordinary PayPal payments into purpose-restricted, auditable transactions. A payer can let someone else cause a payment for a stated purpose, within a budget, without giving that person the money. COMPAS moves permission, not money. PayPal moves the money.

Hackathon: PayPal AI Hackathon 2026. License: [MIT](LICENSE).

Reviewers, including automated ones: [docs/AGENT_EVALUATION_GUIDE.md](docs/AGENT_EVALUATION_GUIDE.md).

## Public demo

Checked on 2026-11-11.

| Surface | URL | What responded |
| --- | --- | --- |
| Demo | https://compas-paypal-web.onrender.com/demo | HTTP 200, title COMPAS |
| Backend health | https://compas-paypal-api.onrender.com/health | HTTP 200, `status=ok`, `paypal=sandbox`, `liveAgent=presenter_only` |

Use this pair. `https://compas-frontend.onrender.com/demo` and `https://compas-backend-mjyc.onrender.com/health` also answered as COMPAS that day. They are earlier hosts, not the canonical pair. Do not use `compas-backend.onrender.com`.

Hosted on Render. Visitor workspaces are in memory. A sleep or restart clears them. The health check above is the deployed build from before this care-story work. A Render rebuild is required before the public demo shows the new panel.

## What it solves

Pedro wants up to USD 40 available for his grandmother Gladys's medicines. Andrea, who lives with Gladys, can shop. She must not receive the USD 40. The pharmacy is paid on PayPal. COMPAS checks the purpose before any order exists.

- Pedro creates a mandate: Andrea may cause a `MEDICATION` payment, up to USD 40.
- Andrea buys at a pharmacy. Alcohol against that mandate is `DENY`. No PayPal order is created.
- On `ALLOW`, COMPAS creates one PayPal sandbox order payable to the pharmacy. Pedro approves it at PayPal. COMPAS checks the mandate and the order again, then captures.
- `remainingAuthorizedAmount` is authorization capacity. It is not a PayPal balance and not custody.

COMPAS is not a wallet, a bank, a payment rail, a custody account, a token, or a blockchain.

## What is built

The deterministic policy engine decides `ALLOW`, `DENY`, or `REVIEW`. Only `ALLOW` may create a PayPal order. `DENY` and `REVIEW` never do. The payer approves every sandbox payment. AI classifies and explains. It does not authorize, capture, or refund.

- **Merchant analyst.** Elasticsearch proposes INVIMA CUM candidates. Claude proposes a mapping or abstains. A deterministic verifier re-reads the code. A flag never authorizes a payment. Act 1 of `/demo`.
- **Errands.** Andrea confirms what may be bought, by CUM, with unit and amount caps.
- **MCP agent.** OAuth 2.1 with PKCE. Five tools: `search_eligible_merchants`, `compare_offers`, `check_purchase`, `propose_purchase`, `get_mandate_status`. No PayPal tool. Act 3 has two modes over that server:
  - **Scripted agent.** Written narration, real MCP calls. Public.
  - **Live agent.** Claude chooses the tool calls. The same policy decides. On the public deploy, live mode is presenter-gated. The presenter key is not in this repository.
- **Pharmacy comparison.** `compare_offers` ranks catalog prices for the confirmed CUM. A cheaper contested shop is excluded. Stock is unknown. The model cannot override the ranking.
- **Split basket.** A mixed cart is split. Only the eligible lines can reach the payment gate. The personal lines are not marked paid.
- **Proof of purpose.** After a completed purchase, a structured receipt is compared with the authorized merchant, CUM, quantity and amount. `VERIFIED_DOCUMENT_MATCH` is document consistency, not proof of delivery. A mismatch leaves the payment status unchanged.
- **Refund reconciliation.** A completed refund can restore capacity while the mandate is active and inside its window, once per refund id, never above the original budget. Webhook amounts are not trusted. The demo button is a labeled simulation through that same accounting.
- **Recurring care plan.** A monthly plan can prepare the next errand. Generating a cycle does not create a PayPal order. Pause, resume and revoke are payer actions. A revoked plan does not resume.

The optional **Care story** panel on `/demo` walks the five additions with fictional demo/test data. Act 2 remains the live sandbox payment.

## Real, simulated, and not built

| Real, when configured | Simulated, and labeled | Not this build |
| --- | --- | --- |
| PayPal sandbox order, approval, capture | PayPal app screens for Pedro, Andrea and the pharmacy | Production PayPal, Vault, payer-absent charges |
| Webhook signature check and refund read, when `PAYPAL_WEBHOOK_ID` is set | The care-story capture and the USD 5 refund button (`DEMO_SIMULATION`) | A refund of an arbitrary existing capture |
| Analyst calls to Elastic and Claude | Wallet KYB and Cámara fixtures | A second product registry beyond medicine |
| MCP tool calls and OAuth consent | Scripted agent narration | An automatic PayPal charge when a care cycle is due |
| Deterministic CUM verification | The three-shop price table in the care story (demo/test data) | Physical delivery confirmation |

An unimplemented or unconfigured PayPal call throws. It does not invent an order, an approval, or a capture.

## Repository

| Path | What |
| --- | --- |
| `frontend/` | Next.js demo: `/demo`, `/paypal`, `/paypal-delegate`, `/paypal-business` |
| `backend/` | Domain, policy, PayPal, analyst, MCP, care capabilities |
| `contracts/` | Shared API notes, including the agent tools |
| `data/` | Seeds and Postgres migrations. `20261111140000_capabilities.sql` is additive and not applied |
| `docs/` | Product, ADRs, the evaluation guide |
| `infra/` | Render notes |

The frontend and the backend do not import each other's source.

## Setup

```bash
cd backend && npm install && npm run dev     # API on :4000
cd frontend && npm install && npm run dev    # http://localhost:3000/demo
```

Copy `backend/.env.example` to `backend/.env`. Secrets stay there. They are not `NEXT_PUBLIC_*` variables.

| Variable | Role |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app. Missing: the gateway throws |
| `PAYPAL_ENVIRONMENT` | `sandbox` only |
| `PAYPAL_WEBHOOK_ID` | Webhook verification. Missing: notifications are refused and capacity is unchanged |
| `COMPAS_DEMO_PURCHASES` | `enabled` lets a demo session create sandbox orders. Otherwise preview still runs and no order is created |
| `DEMO_MERCHANT_PAYPAL_ID`, `DEMO_LIQUOR_PAYPAL_ID`, `DEMO_PAYER_PAYPAL_ID` | Presenter sandbox account ids, not emails or passwords |
| `COMPAS_PRESENTER_KEY` | Gates the presenter accounts and, on the public deploy, live Claude |
| `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY` | CUM search |
| `ANTHROPIC_API_KEY` | Analyst and live Act 3. Empty: live mode is unavailable; scripted mode still runs |
| `DATABASE_URL` | Shared trust log and analyst runs. Visitor mandates stay in memory either way |
| `CUM_REGISTRY` | `demo` uses the committed subset |

`data/migrations/20261026120000_paypal_rail.sql` truncates runtime tables. Do not run it again. The capabilities migration is new and has not been applied. Applying it is a separate deployment step on a database that already has the PayPal schema.

## Tests

```bash
cd backend && npm run typecheck && npm test
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run e2e
```

`npm test` does not call PayPal, Elastic, or Claude. `npm run e2e` starts a local API with purchases disabled and drives `/demo`. It is not a live sandbox payment.

Sandbox checks, only when `backend/.env` is configured, and not part of CI: `npm run paypal:smoke` and `npm run compas:smoke` in `backend/`. Do not repeat captures to re-check the UI.

CI runs the backend and frontend checks above, plus the Playwright smoke, without sandbox secrets.

## Judges

1. Open the demo. Act 1 shows a merchant review. Act 2 is the medication payment and the alcohol refusal. Act 3 is the agent. Scripted mode is public. Live mode may be presenter-only.
2. Open **Care story**. The comparison selects Farma Sur, not the cheaper contested shop. The shampoo stays out of the COMPAS lines. Generating a cycle does not create a PayPal order. The receipt and the USD 5 refund are labeled simulations.
3. An external MCP client can use `POST /mcp` on the API. See [contracts/agents/README.md](contracts/agents/README.md).

## Known limitations

- Sandbox only. No production PayPal integration is implied.
- Render Free sleeps and drops in-memory workspaces.
- The care-story capture and refund do not move sandbox money. A live refund still needs PayPal and `PAYPAL_WEBHOOK_ID`.
- Receipt verification does not prove delivery. There is no image or PDF upload.
- The three-shop price table is fictional demo data. Live `compare_offers` uses catalog prices for shops the mandate already accepts.
- The capabilities tables are not in the shared database until the new migration is applied. The demo does not need that database for visitor state.
- Live Claude is capped and may be presenter-gated. This repository does not contain the presenter key.

Not affiliated with or endorsed by PayPal, Elastic, or INVIMA.

## Docs

- [docs/AGENT_EVALUATION_GUIDE.md](docs/AGENT_EVALUATION_GUIDE.md)
- [docs/](docs/) — vision, PayPal mapping, policy, security
- [docs/adr/](docs/adr/) — 0008 PayPal, 0009 analyst, 0010 errands, 0011 agents, 0012 public demo, 0013 care capabilities
- [docs/devpost-submission.md](docs/devpost-submission.md) and [docs/video-runbook.md](docs/video-runbook.md)
- [AGENTS.md](AGENTS.md) — instructions for coding agents
