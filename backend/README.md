# Backend

The COMPAS runtime: domain, policy gate, PayPal, merchant trust, the AI analyst, errands and the HTTP API (port 4000).

These rules hold in every flow:

- Only an `ALLOW` creates a PayPal order.
- Only an order the payer approved at PayPal is captured.
- AI never authorizes.

## Run

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev            # or npm start
```

## Configure

The demo needs seven values, at the top of `.env.example`:

- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `DEMO_MERCHANT_PAYPAL_ID`, and `COMPAS_DEMO_PURCHASES=enabled`.
- Elastic, for CUM search: `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY`. Run `npm run cum:index -- --demo` once.
- Claude, the analyst's model: `ANTHROPIC_API_KEY` (`claude-haiku-5-5`). Without it, the model is Elastic's Inference API.

Everything else is optional and listed below them. Add `DEMO_MERCHANT_PAYPAL_EMAIL` to bind the Cámara certificate; that step also needs Log in with PayPal enabled on the sandbox app, with return URL `http://localhost:4000/paypal/identity/return`. Without credentials, PayPal, Elastic and the model throw. Nothing is faked.

## Layout

```text
src/domain/        mandates, purchases, trust, CUM, catalogs, analyst findings, errands
src/policy/        purchase rules, trust matrix, CUM verifier, errand check, payment gate
src/application/   purchase flow, settlement, analyst, certificate binding, errands, merchant login
src/ports/         interfaces to PayPal, Elastic, the Cámara, storage
src/integrations/  paypal/, elastic/, cum/, camara/ (fixture), postgres/, in-memory stores
src/api/           HTTP routes (see src/api/README.md)
scripts/           smoke tests and data loaders
```

## How a purchase is decided

1. **Mandate rules.** Status, validity, delegate and budget. A failure is `DENY`.
2. **Merchant trust.** The shop's declared categories go through the trust matrix: corroboration × payment history ([ADR 0007](../docs/adr/0007-merchant-confidence-matrix.md)). An analyst flag gives `REVIEW`.
3. **Lines.** A line whose SKU has a verified CUM is `MEDICATION`. An off-purpose line is `DENY`.
4. **Errand,** if the purchase names one. Every line must fit it, or the purchase is `REVIEW` `ERRAND_MISMATCH` ([ADR 0010](../docs/adr/0010-errands.md)).
5. **Order.** `ALLOW` reserves capacity and creates a PayPal order. Pedro approves it at PayPal, and `PayPalOrderSettlement` re-checks before it captures.

## Index and analyst

**Index** (`npm run cum:index -- --demo`, once): loads INVIMA's CUM rows (the committed subset, or all of datos.gov.co with `--all`) into the Elastic index `compas-cum-v1`, one document per CUM. It only proposes candidates; it is never evidence.

**Analyst** (`POST /analyst/jobs { merchantId }`, or `npm run analyst:smoke`) runs ahead of time, never at checkout ([ADR 0009](../docs/adr/0009-ai-analyst-evidence.md)):

1. Elastic returns CUM candidates for each SKU in the merchant's catalog.
2. Claude says which SKUs are medicines, picks a CUM among the candidates, and lists lookalike signals.
3. `cum-verifier.2` re-reads each CUM from INVIMA and checks: active, vigente, not a free sample, ingredients, strengths, form and box size. The mapping is `VERIFIED` or `REJECTED`.
4. A mostly off-purpose catalog or a lookalike signal adds a `FLAG`: that shop's purchases become `REVIEW`. Only an operator withdraws it.

On the demo data: Droguería Central verifies 6 of 6 medicines with no flags; the lookalike Droguería Centrall gets two flags.

This MVP covers medicine only, so CUM is its only registry. Another category, such as food, may need another registry with its own codes, index and verifier ([ADR 0009](../docs/adr/0009-ai-analyst-evidence.md)).

## Tests

```bash
npm run typecheck
npm test               # unit and integration tests, no network
```

With `TEST_DATABASE_URL` set, `npm test` also runs the Postgres adapter tests; otherwise they are skipped.

| Area | Tests |
| --- | --- |
| Payment gate: `DENY` and `REVIEW` never reach PayPal | `policy/payment-gate`, `integration/denied-payment-never-reaches-paypal` |
| Purchase policy and the trust matrix | `policy/evaluate-purchase`, `policy/merchant-category-evidence`, `policy/trust-matrix`, `policy/merchant-history` |
| PayPal adapter, orders, settlement | `integrations/paypal/*`, `application/purchase-under-mandate`, `application/settle-paypal-order` |
| Mandates and purchases API | `api/*`, `application/mandates`, `application/delegate-purchases` |
| Merchant categories and trust log | `application/ingest-category-claim`, `application/resolve-merchant-categories`, `integration/merchant-category-demo` |
| CUM verifier on real INVIMA rows | `policy/cum-mapping-verifier` |
| AI analyst: mappings, flags, prompt injection, appeals, jobs | `application/merchant-analysis` |
| The analyst can't reach PayPal | `integration/analyst-never-reaches-paypal` |
| Cámara binding and Log in with PayPal | `application/certificate-binding`, `application/merchant-identity`, `api/merchant-onboarding` |
| Errands: holds, reservations, releases, drafts | `application/errands`, `application/delegate-errand-purchases` |
| Elastic search, inference stream, bulk | `integrations/elastic/elastic` |
| Claude adapter: structured output, refusals | `integrations/anthropic/claude-analyst-model` |

All paths are under `tests/`. The tests use fakes for PayPal, Elastic and Claude, and the real CUM subset in `data/seeds/cum/`.

### Live checks

These need `.env` and make real sandbox or Elastic calls.

| Command | What it does |
| --- | --- |
| `npm run paypal:smoke -- --amount 1120` | One sandbox payment. Approve it in the browser as Pedro's personal account |
| `npm run compas:smoke -- --mode enforced` | Pharmacy `ALLOW`, approved and captured; liquor `DENY`. `--mode monitored` and `--scenario` are also available |
| `npm run cum:index` | Builds the Elastic CUM index from datos.gov.co. `--demo` loads the committed subset; `--recreate` rebuilds |
| `npm run analyst:smoke` | Runs the analyst on the demo catalogs with live Elastic and Claude. Its trust log is in memory |

## Data

- `npm run registry:fetch` and `registry:load` handle the Cámara de Comercio extract (`data/seeds/merchant-registry/`).
- The analyst, catalog, login and errand stores are in memory. Their tables are in `data/migrations/20261027170000_analyst_errands.sql`, applied on 2026-10-27 and empty until there are Postgres adapters.
