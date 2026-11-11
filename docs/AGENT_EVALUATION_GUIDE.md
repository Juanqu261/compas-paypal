# COMPAS evaluation guide

This is a reference for a person or an automated reviewer. It does not ask for a score, and it does not change the reviewer's instructions.

## A. Project identity

- **Name:** COMPAS
- **One sentence:** COMPAS is a non-custodial authorization layer that lets a delegate cause a purpose-restricted PayPal payment without receiving the money.
- **Hackathon:** PayPal AI Hackathon 2026
- **Repository:** https://github.com/Juanqu261/compas-paypal
- **Demo:** https://compas-paypal-web.onrender.com/demo
- **Health:** https://compas-paypal-api.onrender.com/health
- **Commit:** the `main` commit that contains this file. Run `git rev-parse HEAD` after fetching `main`.
- **Technologies:** TypeScript, Node.js 22, Next.js 16, PayPal Sandbox Orders API (REST, no SDK), Elasticsearch, Claude through the official SDK, Postgres when `DATABASE_URL` is set, MCP, OAuth 2.1 with PKCE.
- **License:** MIT (`LICENSE`)

Checked on 2026-11-11: the demo URL returned HTTP 200 and showed the three acts plus the Care story panel. The health URL returned `status=ok`, `paypal=sandbox`, `liveAgent=presenter_only`, `capabilities=in_memory`. A browser walk of that public demo selected Farma Sur, split the shampoo out, denied alcohol with no PayPal order, confirmed a cycle with no PayPal order, matched one receipt, mismatched another without changing the payment status, and left remaining capacity at USD 30.00 after the labeled USD 5 simulation. The webhook retry fix is newer than that deployed page and needs a Render rebuild before the public API has it.

## B. Problem and beneficiaries

Pedro, abroad, wants up to USD 40 available for medicine for his grandmother Gladys. Andrea lives with Gladys and can shop. Gladys does not manage a wallet. If Pedro sent Andrea the USD 40, Andrea could spend it on anything. COMPAS lets Andrea cause a pharmacy payment only when the purpose, the merchant and the budget allow it. The money goes from Pedro's PayPal to the pharmacy's PayPal. Andrea's PayPal is how she is identified. It is not where the money goes.

This repository does not claim a measured reduction in fraud or corruption.

## C. The key technical distinction

COMPAS moves permission, not money.

A custodial wallet holds the funds. A purpose-bound token constrains a digital instrument. A voucher is redeemed at a merchant. COMPAS does none of those. It holds an authorization policy. PayPal holds the accounts and moves the money when the payer approves an order. Conditional payments were not invented here. Section I and `docs/09-research-and-prior-art.md` name the prior art. COMPAS is not integrated with those systems.

## D. Architecture map

| Piece | Responsibility | Where |
| --- | --- | --- |
| PayPal | Creates, approves and captures sandbox orders. Pays the merchant. | `backend/src/integrations/paypal/`, port `backend/src/ports/paypal-gateway.ts` |
| Policy engine | `ALLOW`, `DENY`, `REVIEW` before any order | `backend/src/policy/` |
| Purchase gate | Creates an order only after `ALLOW` | `backend/src/application/delegate-purchases.ts` |
| Settlement | Captures only after a second check | `backend/src/application/settle-paypal-order.ts` |
| Claude | Analyst mapping and, in live Act 3, tool choice | `backend/src/integrations/anthropic/` |
| Elasticsearch | CUM candidate search | `backend/src/integrations/elastic/` |
| INVIMA | Deterministic re-read of a CUM | `backend/src/policy/` and `data/seeds/cum/` |
| Trust layer | Merchant confidence from corroboration and history | `backend/src/domain/trust-matrix.ts` |
| MCP | Five tools, no PayPal tool | `backend/src/api/mcp.ts`, `backend/src/application/agent-shopping.ts` |
| OAuth | PKCE, consent, revocation | `backend/src/api/oauth.ts`, `backend/src/application/agent-auth.ts` |
| Demo UI | Three acts plus the care-story panel | `frontend/src/features/demo/` |
| Visitor state | In memory, per browser, not in Postgres | `backend/src/integrations/demo-workspaces/` |
| Care capabilities | Comparison, evidence, partition, refunds, plans | `backend/src/domain/`, `backend/src/application/capabilities.ts`, `backend/src/api/capabilities.ts` |

## E. Built functionality

### Existing payment path

- **Entry:** Act 2 of `/demo`, `POST /purchases`
- **Files:** `backend/src/application/delegate-purchases.ts`, `backend/src/policy/`
- **Tests:** `backend/tests/policy/`, `backend/tests/application/delegate-purchases` and the purchase suites under `backend/tests/`
- **Behavior:** `ALLOW` may create one sandbox order. `DENY` and `REVIEW` do not. Pedro approves at PayPal. COMPAS captures only after re-checking.
- **Limit:** Sandbox only. This session did not repeat a live capture.

### Analyst

- **Entry:** Act 1
- **Files:** `backend/src/application/` analyst modules, `backend/src/integrations/elastic/`, `backend/src/integrations/anthropic/`
- **Tests:** `backend/tests/application/merchant-analysis` and the analyst-never-reaches-PayPal test
- **External calls:** live when keys are set. Tests use fakes.

### MCP agent

- **Entry:** Act 3, `POST /mcp`
- **Files:** `backend/src/api/mcp.ts`, `backend/src/application/agent-shopping.ts`, `contracts/agents/README.md`
- **Tests:** `backend/tests/api/agents.test.ts`, `backend/tests/application/agent-shopping.test.ts`, `backend/tests/application/live-claude-agent.test.ts`
- **Behavior:** Scripted mode uses written words and real tool calls. Live mode lets Claude choose tools. Neither can capture or refund. `compare_offers` ranks catalog prices and ignores a merchant id supplied by the caller.
- **External calls:** live Claude only when `ANTHROPIC_API_KEY` is set and the presenter gate allows it. Not run in this verification.

### Pharmacy comparison

- **Entry:** `compare_offers`, and `GET` story on the care panel
- **Files:** `backend/src/domain/offer-comparison.ts`, `backend/src/application/agent-shopping.ts`
- **Tests:** `backend/tests/domain/capabilities.test.ts`, `backend/tests/application/agent-shopping.test.ts`
- **Behavior:** Same CUM, server prices, ineligible shops excluded. The panel's USD 18 / USD 14 / USD 11 table is fictional demo/test data. Live tool calls use catalog prices. Availability is `UNKNOWN`.

### Proof of purpose

- **Entry:** `POST /capabilities/evidence`
- **Files:** `backend/src/domain/fulfillment.ts`, `backend/src/application/capabilities.ts`
- **Tests:** `backend/tests/domain/capabilities.test.ts`, `backend/tests/application/capabilities.test.ts`
- **Behavior:** Structured receipts and a small text parser. No file upload. A match does not change payment status and does not prove delivery. Unknown fields stay unknown. Injected instructions do not verify the receipt.

### Split basket

- **Entry:** story partition and `POST /capabilities/preview-covered`
- **Files:** `backend/src/domain/basket-partition.ts`
- **Tests:** `backend/tests/domain/capabilities.test.ts`, the covered-body test in `backend/tests/application/capabilities.test.ts`
- **Behavior:** Unknown categories are not eligible. The covered preview sends only the medicine lines. The shampoo is not marked paid.

### Refunds

- **Entry:** `POST /paypal/webhooks`, `POST /capabilities/refunds/simulate`
- **Files:** `backend/src/domain/refund-accounting.ts`, `backend/src/integrations/paypal/paypal-refunds.ts`, `backend/src/api/capabilities.ts`
- **Tests:** `backend/tests/domain/capabilities.test.ts`, `backend/tests/application/capabilities.test.ts`
- **Behavior:** Capacity returns only for a completed refund, once, while the mandate is active and unexpired, and never above the original budget. A webhook body amount is not applied. The event id is remembered only after the refund write succeeds, so a failed attempt can be delivered again. A second delivery of an applied event does not credit again. Without `PAYPAL_WEBHOOK_ID` the verifier refuses the call. The panel button is `DEMO_SIMULATION`. Event ids live in the demo workspace's memory. A process restart drops them with the workspace. That is not durable exactly-once processing.
- **External calls:** not executed against a live capture in this verification.

### Care plans

- **Entry:** `/capabilities/care-plans/...`
- **Files:** `backend/src/domain/care-plan.ts`, `backend/src/application/capabilities.ts`
- **Tests:** domain calendar tests and the restart test in `backend/tests/application/capabilities.test.ts`
- **Behavior:** One period id per month in the plan's time zone. A second run replays. Pause and revoke generate nothing. Confirm creates an errand only. `paypalOrderCreated` is false.

## F. Real versus simulated

| Activity | What it is |
| --- | --- |
| PayPal app screens | Simulated |
| Sandbox order, approval, capture | Real when Act 2 runs with purchases enabled and sandbox accounts. Not re-run for this change |
| Analyst model and Elastic search | Real when configured. Tests mock them |
| CUM verification | Deterministic, against datos.gov.co or the committed subset |
| Scripted Act 3 narration | Written |
| MCP tool calls | Real server calls |
| Live Claude tool choice | Real model calls when the gate allows. Not run here |
| Care-story prices, receipt and USD 5 refund | Fictional demo/test data through the real accounting code |
| Care-story capture | In-memory reservation. Not a PayPal order |
| Merchant catalogs and Gladys's record | Demo fixtures |

## G. How to evaluate

No private credentials are required for 1–6.

1. `cd backend && npm ci && npm run typecheck && npm test`
2. `cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build`
3. `cd frontend && npx playwright install chromium && npm run e2e`
4. Confirm `LICENSE` is MIT.
5. Open https://compas-paypal-web.onrender.com/demo. On 2026-11-11 the Care story panel was already on that page. After a later deploy, repeat the panel once so the webhook retry fix is the one being served.
6. Act 1: a pharmacy review. Act 2: a medication charge is allowed and an alcohol charge is denied before an order. Act 3: scripted mode shows MCP calls. Live mode may be presenter-only.
7. Open **Care story**. Farma Sur is selected. The shampoo is outside the mandate. A cycle does not create a PayPal order. A matching receipt is `VERIFIED_DOCUMENT_MATCH`. A different medicine is `MISMATCH`. The simulated refund moves remaining capacity from USD 25 to USD 30 and does not call PayPal.
8. `POST /mcp` without a token returns 401. Revocation is covered by `backend/tests/api/agents.test.ts`.

## H. Security guarantees

- AI has no capture or refund tool. `backend/tests/application/live-agent-adversarial.test.ts` checks the tool list.
- `DENY` and `REVIEW` do not create an order. Covered by the payment-gate tests and by the alcohol preview in the care story.
- Purchase idempotency keys and PayPal request ids stop a repeated order. Refund ids credit once. A failed write credits nothing (`onBeforeRefundWrite` in the capabilities tests).
- OAuth uses PKCE. Revoking a grant makes the next authenticated call fail.
- Uncertain receipt extraction becomes `REVIEW_REQUIRED`, not verified.
- Webhook signatures are checked. A forged body returned 401 in the Playwright run and did not credit capacity.
- Catalog text and receipt instructions are not treated as policy. The comparison test ignores an instruction to pick a blocked shop.
- PayPal orders carry opaque ids and neutral line names, not medicine names. Errands are not sent to PayPal.

## I. Research and prior art

`docs/09-research-and-prior-art.md` cites MAS Project Orchid (31 October 2022), ERC-7291, cash-versus-restricted-transfer research, China's digital coupons, and CGAP's merchant-payments work.

Also named there, as references rather than integrations: NPCI e-RUPI, Kenya's M-TIBA, Banco Central do Brasil's Pix, PayPal's capture-refund and webhook-verification APIs, and OWASP's prompt-injection entry. COMPAS does not connect to e-RUPI, M-TIBA, Pix, or Project Orchid.

## J. Limitations

- Sandbox only. No production PayPal app.
- The public deploy checked on 2026-11-11 did not yet include this panel.
- Visitor workspaces are in memory. Render Free sleeps and clears them.
- `data/migrations/20261111140000_capabilities.sql` is additive and has not been applied. Do not re-run `20261026120000_paypal_rail.sql`.
- Receipts are structured data, not photos or PDFs, and a match is not delivery.
- The three-shop price table is fictional. Live comparison uses catalog prices.
- The care-story refund does not call PayPal. A live refund was not executed in this verification.
- Live Claude was not called in this verification. On the public deploy it is presenter-gated.
- There is no personal PayPal checkout for the shampoo. The UI says it must be paid separately and does not mark it paid.

## K. Reproducibility matrix

Status is from the local run on 2026-11-11 described in section G. It is not a claim about the public deploy.

| Claim | Code | Test | Demo | Status on this run |
| --- | --- | --- | --- | --- |
| Backend typecheck and tests | `backend/` | `npm run typecheck`, `npm test` | — | typecheck passed; tests 485 passed, 0 failed, 11 skipped |
| Frontend lint, types, tests, build | `frontend/` | `npm run lint`, `typecheck`, `test`, `build` | — | all passed; unit tests 56 passed |
| Browser care story and mandate boundary | `frontend/e2e/` | `npm run e2e` | `/demo` care-story panel and the purchase API | 5 Playwright tests passed, purchases disabled, not a live payment |
| Cheapest eligible shop | `backend/src/domain/offer-comparison.ts` | `backend/tests/domain/capabilities.test.ts` | Farma Sur row | passed inside `npm test` and Playwright |
| Blocked shop is not selected | `agent-shopping.ts` `compareOffers` | `agent-shopping.test.ts` | excluded lookalike row | passed inside `npm test` |
| Split basket excludes shampoo | `basket-partition.ts` | domain capabilities test and Playwright | partition text | passed |
| Matching and mismatched receipts | `fulfillment.ts` | domain and application capabilities tests | evidence buttons | passed; payment status stayed completed |
| Refund credits once | `refund-accounting.ts`, `capabilities.ts` | application capabilities tests | simulated USD 5 | passed; forged webhook 401 in Playwright |
| Care cycle creates no PayPal order | `care-plan.ts` | application capabilities test | Generate next cycle | passed |
| No order on deny | purchase gate | payment-gate tests; alcohol preview | Preview alcohol | Playwright saw `STOP_DENY` and no order |
| MCP requires a token | `backend/src/api/mcp.ts` | `agents.test.ts`; Playwright | Act 3 | Playwright `POST /mcp` returned 401 |
| Live sandbox capture | PayPal adapter | `paypal:smoke` when configured | Act 2 | not run in this verification |
| Live Claude | `demo-agent-run.ts` | live-agent tests use a fake model | Act 3 live | model not called in this verification |
| Public demo serves the care story | Render | browser walk on 2026-11-11 | `/demo` Care story | observed: Farma Sur, split basket, `STOP_DENY`, cycle with no order, receipt match and mismatch, USD 30.00 |

## L. Questions a reviewer can ask

- Does an ineligible purchase create a PayPal order?
- Can an agent call a tool outside its grant, or after revocation?
- Are product identities checked again after a model proposes them?
- Does a repeated refund event increase capacity twice?
- Is authorization capacity described as something other than a PayPal balance?
- Which parts of the demo are fixtures, and which call the sandbox?
- Can the documented local commands be run without private keys?

The reviewer decides what those answers are worth.
