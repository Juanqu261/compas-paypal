# Devpost submission materials — COMPAS (PayPal AI Hackathon 2026)

Public demo (Render Free):

- Frontend: https://compas-paypal-web.onrender.com
- Backend: https://compas-paypal-api.onrender.com
- Demo: https://compas-paypal-web.onrender.com/demo

Do **not** use older `compas-backend.onrender.com` / `compas-frontend.onrender.com` URLs (other apps).

---

## 1. The problem

Families, NGOs and programs often allocate money for a purpose — medicine, food, school — but the person who can shop is not the person who funds it. Unrestricted transfers create misuse risk; escrow and custody add cost and trust problems. Remittance recipients and caregivers need limited capacity to pay merchants for stated purposes without receiving the money themselves.

In Colombia and similar contexts, medicine purchases are high-stakes and catalog fraud (lookalike pharmacies, mislabeled SKUs) is hard to spot at checkout. Existing rails move money well; they do not encode purpose.

## 2. What COMPAS is

COMPAS is an embedded **authorization and policy layer** for purpose-restricted payments. **Money stays where it is. COMPAS moves permission, not money.**

A payer (Pedro) creates a **mandate**: a delegate (Andrea) may cause payments for a stated purpose (e.g. `MEDICATION`) within a budget, for a beneficiary (Gladys). The delegate never receives the funds. On `ALLOW`, COMPAS creates a PayPal order payable to the merchant; the payer approves it at PayPal; COMPAS re-checks and captures. Alcohol against a medication mandate is `DENY` before any order exists.

COMPAS is not a wallet, bank, custody account, token, or blockchain.

## 3. How we use PayPal

- **Rail:** PayPal Sandbox Orders API only (`create` → payer approval → `capture`).
- **Payee:** the merchant’s PayPal Business account (`payee.merchant_id`), never Andrea.
- **Consent:** every spend needs Pedro’s approval at PayPal (no Vault / payer-absent charge in this MVP).
- **Identity:** Log in with PayPal binds a merchant to Cámara evidence when emails match.
- **Simulated vs real:** Pedro/Andrea/pharmacy **screens** are simulations; **orders, approval, and capture** are real Sandbox operations.

Proven local E2E (one capture): medication `ALLOW` → order → approve → capture `COMPLETED`; alcohol `DENY` with no order.

## 4. Analyst: Claude + Elastic + INVIMA

Before anyone buys, an **AI analyst** reviews a pharmacy catalog:

1. **Elasticsearch** proposes INVIMA **CUM** candidates for each SKU.
2. **Claude** proposes a mapping or abstains (judgment can only flag).
3. A **deterministic verifier** re-reads the CUM against datos.gov.co (or the demo subset). Pointers count only after verification.
4. Flags are appealable; AI never authorizes payment and never alone raises trust to `HIGH`.

Act 1 of `/demo` runs this live (with cooldown on the public host).

## 5. Deterministic policy engine

At purchase time, rules decide — not the model:

1. Mandate status, window, delegate, budget / remaining capacity.
2. Merchant category confidence (trust matrix: Cámara × wallet KYB × history).
3. Line items vs purpose; optional **errand** (CUM + unit/amount caps) → `ERRAND_MISMATCH` if off.
4. Outcomes: `ALLOW` | `DENY` | `REVIEW`. Only `ALLOW` calls PayPal `createOrder`.
5. Settlement re-checks mandate + order + approver before capture; idempotent recovery avoids double capture.

`MONITORED` budgets still record purpose checks but do not block on purpose; mandate/budget rules always apply.

## 6. MCP and agentic commerce

COMPAS exposes an MCP server (`POST /mcp`) with four tools: `search_eligible_merchants`, `check_purchase`, `propose_purchase`, `get_mandate_status`.

- Agents are **sub-delegates** under Andrea’s consent (OAuth 2.1 + PKCE).
- Agents name SKUs/quantities only; COMPAS sets prices/categories.
- **No PayPal tool**, no amounts to invent, no way to confirm payment — Pedro still approves.

**Act 3 of `/demo`:** a **scripted** agent (written reasoning) making **real** MCP calls, with a clear “Mode: scripted” label. A live autonomous client can connect the same MCP endpoint separately.

## 7. Challenges and how we solved them

| Challenge | Approach |
| --- | --- |
| Wrong public hosts (Nest app / suspended FE) | New unequivocal Free services `compas-paypal-api` / `compas-paypal-web` |
| Capture then audit-write failure | Settlement keeps COMPLETED evidence; history failure does not undo money |
| ALLOW without recorded order | Resume same PayPal-Request-Id; no duplicate charge path |
| Presenter sandbox accounts on a public demo | `COMPAS_PRESENTER_KEY` gate; visitors use their own account IDs by default |
| Free tier sleep + in-memory demos | Honest UX: demos reset on sleep/restart; capture skipped if workspace `ended`; longer client read timeout for cold start |
| AI vs authorization | Analyst/MCP never reach PayPal authorize path; fail closed |

## 8. Impact and next steps

**Impact:** purpose-bound spending without custody; auditable decisions; safer caregiver/remittance flows; merchant trust evidence without blockchain.

**Next (when asked):** payer one-off exception for `REVIEW`; refunds/webhooks; Vault when PayPal enables it; live-model agent beside Act 3; Postgres adapters for errands/agents; real RUES.

## 9. Judge test instructions

1. Open https://compas-paypal-web.onrender.com/demo (first load may wait ~30–60s if Free instances slept).
2. **Act 1:** Pick Central Pharmacy → Run the analyst (or view last real run). Confirm Claude/Elastic/INVIMA story; lookalike shop is the contrast.
3. **Act 2:** Enter **your** PayPal Sandbox personal + business account IDs (never share passwords). Create Pedro’s medication mandate (~USD 40). As Andrea, try a pharmacy cart (expect path toward `ALLOW`) and a liquor cart (expect `DENY`, no order). Optional: open presenter link only if the team shared `?presenter=…` — otherwise presenter accounts stay locked.
4. If `ALLOW` creates an order, Pedro approves **in PayPal Sandbox**; return to the demo — COMPAS captures only after re-check. Prefer not to burn captures unless judging payment end-to-end.
5. **Act 3:** Run the scripted agent; confirm “Mode: scripted” and real MCP calls in the technical log.
6. Mobile: same `/demo` URL; three phone frames should remain usable.

## 10. Video script (≤ 3 minutes)

**0:00–0:20 — Hook**  
“Money for Gladys’s medicine should buy medicine — not cash for anyone else. COMPAS moves permission, not money, on PayPal.”

**0:20–0:50 — Problem + mandate**  
Show Act 2: Pedro’s mandate, Andrea as delegate, budget USD 40, purpose `MEDICATION`. Say: non-custodial; Andrea never receives the funds.

**0:50–1:20 — Act 1 trust**  
Central Pharmacy vs lookalike. Analyst: Elastic proposes CUM, Claude maps, INVIMA verifies. “AI never authorizes.”

**1:20–2:10 — Purchase**  
Pharmacy cart → policy `ALLOW` → PayPal order to the merchant → Pedro approves at Sandbox → capture. Cut to liquor → `DENY`, no order. Point at timeline of real states.

**2:10–2:40 — Agents**  
Act 3: scripted agent, real MCP, Andrea’s consent, no PayPal tool. “Autonomous agents use the same MCP; this demo is scripted on purpose.”

**2:40–3:00 — Close**  
Architecture one-liner: deterministic policy + PayPal rail + evidence layer. Demo URL. “Purpose-restricted payments without custody.”

---

## PayPal Developer checklist (manual)

**Checkout Orders v2** sends `return_url` / `cancel_url` on each create-order call (COMPAS env: `PAYPAL_RETURN_URI` / `PAYPAL_CANCEL_URI`). PayPal docs treat these as per-order experience URLs; they are **not** the same as a registered Login with PayPal Return URL. Our deployed values:

- `https://compas-paypal-api.onrender.com/paypal/orders/return`
- `https://compas-paypal-api.onrender.com/paypal/orders/cancel`

After COMPAS handles that hit, it redirects the browser to:

- `https://compas-paypal-web.onrender.com/demo` (`PAYPAL_FRONTEND_RETURN_URL`)

**Log in with PayPal** (merchant Cámara binding) **does** require a Return URL configured on the Sandbox app (Developer Dashboard → app → Log in with PayPal → Advanced Settings):

- `https://compas-paypal-api.onrender.com/paypal/identity/return`

Sandbox does not need PayPal’s live app review for Login with PayPal. Do **not** put `COMPAS_PRESENTER_KEY` in Devpost, README links, or public materials.

## Devpost delivery checklist

- [ ] Title + tagline emphasize purpose-restricted payments / non-custodial
- [ ] Demo link: https://compas-paypal-web.onrender.com/demo (warm `/health` first if Free slept)
- [ ] Repo: `Juanqu261/compas-paypal` on `main`
- [ ] Built with: PayPal Sandbox Orders, Claude, Elasticsearch, INVIMA CUM — **not** PayPal Live
- [ ] Act 3 described as **scripted** agent + real MCP (not autonomous LLM)
- [ ] Judge steps from §9 pasted or linked
- [ ] ≤3‑minute video from §10
- [ ] No presenter key, no Sandbox passwords, no Live claims
