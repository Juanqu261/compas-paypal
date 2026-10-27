# Data model for the frontend

What the backend stores in Supabase, which screen each piece feeds, and the shape it reaches the browser in. The SQL is in [`data/migrations/`](../../data/migrations/) and the database rules in [`data/schema/README.md`](../../data/schema/README.md). This page is the frontend's view of them.

## The one rule

**The frontend never talks to Supabase.** The `compas` schema is closed to `anon` and `authenticated`, so the Supabase JS client and the anon key get nothing. The browser calls the backend over HTTP, and the backend reads and writes the database. A policy result (`ALLOW`, `DENY`, `REVIEW`) comes only from the backend.

## Diagram

```mermaid
erDiagram
  parties ||--o{ mandates : "payer / delegate / beneficiary"
  mandates ||--o{ spending_records : "every purchase attempt"
  mandates ||--o{ purchase_intents : "charges paid under it"
  merchants ||..o{ purchase_intents : "by PayPal merchant id"
  spending_records ||--o{ merchant_observations : "paid + payer verdict"
  mandates ||--o{ audit_events : "timeline"
  trust_log_entries }o..|| merchants : "evidence about the merchant"
  registry_companies ||--o{ registry_establishments : "owns"

  parties { text id PK  text display_name  text paypal_payer_id }
  merchants { text paypal_merchant_id PK  text display_name }
  mandates { text id PK  numeric budget_value  numeric remaining_value  text asset_code  smallint asset_scale  category_array eligible_categories  text confidence_minimum  text enforcement  text status  timestamptz expires_at }
  purchase_intents { text id PK  text paypal_merchant_id  numeric amount_value  jsonb line_items  text status }
  spending_records { text id PK  text mandate_id FK  text outcome  jsonb reasons  jsonb purpose_check  jsonb merchant_categories  bool monitored_exception  text paypal_order_id  text payment_state }
  trust_log_entries { text id PK  text type  text source_id  text paypal_merchant_id  jsonb details }
  merchant_observations { text id PK  text type  text verdict }
  audit_events { text id PK  text type  timestamptz occurred_at }
  registry_companies { text nit PK  text name }
  registry_establishments { text camara PK  text matricula PK  text name  text ciiu_primary }
```

## What each table feeds

| Table | Screen | What the user sees | Served by |
| --- | --- | --- | --- |
| `parties` | all | Pedro, Andrea, Gladys and their names | inside the mandate |
| `mandates` | ARQ (Pedro), Nequi (Andrea) | Budget, remaining amount, purpose, "allow even if not fully approved", expiry | `GET /mandates/:id` ([`contracts/mandates/`](../mandates/README.md)) |
| `merchants` | Nequi Negocios, Nequi | The shop's name | not yet |
| `purchase_intents` | Nequi Negocios → Nequi | The charge the shop creates and Andrea pays with the QR | not yet (`POST /purchase-intents`) |
| `spending_records` | ARQ (Pedro), Nequi (Andrea) | Where the budget went: each attempt, ALLOW/DENY/REVIEW, why, which categories the shop had, and where its PayPal order stands | `GET /mandates/:id/spending` ([`contracts/mandates/`](../mandates/README.md)) |
| `merchant_observations` | ARQ (Pedro) | The "did this purchase fit?" answer (`MATCH`/`MISMATCH`) | `POST /spending-records/:id/confirmation` ([`contracts/merchant-history/`](../merchant-history/README.md)), not wired yet |
| `trust_log_entries` | Nequi Negocios, `/demo` | The shop's categories and how well they are backed | `GET /merchants/categories?paypalMerchantId=…` ([`contracts/merchant-categories/`](../merchant-categories/README.md)) |
| `audit_events` | `/demo` | Decision timeline | not yet |
| `registry_*` | Nequi Negocios onboarding | The Cámara de Comercio record of a shop (1,900 real Medellín shops) | not yet |

The database also holds 12 fabricated food mandates (`demo-food-mandate-N`) with their spending records. They give the demo tienda (Tienda Doña Gloria) the payment history that lifts it to `MEDIUM` confidence. Don't list them as Pedro's. Filter mandates by payer.

Routes marked "not yet" are listed in [`backend/src/api/README.md`](../../backend/src/api/README.md). Ask the backend team before you depend on one. Never read the table instead.

## Formats

**Money** is never a float. It is always three fields:

```json
{ "value": "4000", "assetCode": "USD", "assetScale": 2 }
```

`value` is an integer string in minor units. This one is USD 40.00. Format it with `value / 10^assetScale`, using string or BigInt math, not `Number` arithmetic on large values. Pedro's budget and the shop's charge must be in the same asset: the PayPal order is for exactly the charge, and COMPAS never converts. PayPal handles Pedro's own funding currency when he approves.

**Dates** are ISO 8601 strings in UTC (`2026-10-16T15:00:00.000Z`). Show them in Colombia time (UTC-5).

**PayPal merchant ids** are 13 upper-case characters without 0, 1, I or O, for example `JYHT3DF634TAG`. The backend keeps them; a browser response never carries one.

## Values to handle

| Field | Values | Show it as |
| --- | --- | --- |
| Category | `MEDICATION`, `FOOD`, `PERSONAL_CARE`, `ALCOHOL`, `TOBACCO` | Medicamentos, Alimentos, Cuidado personal, Licor, Tabaco |
| Decision `outcome` | `ALLOW`, `DENY`, `REVIEW` | Aprobado, Rechazado, En revisión |
| Mandate `enforcement` | `ENFORCED`, `MONITORED` | MONITORED is Pedro's "allow even if not fully approved" tick |
| Mandate `status` | `DRAFT`, `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` | |
| Merchant confidence | `CONTESTED`, `LOW`, `MEDIUM`, `HIGH` | How sure COMPAS is that the shop sells that category |
| Trust level | `SELF_DECLARED`, `PROVIDER_VERIFIED`, `EXTERNAL_VERIFIED` | Who backs it: the shop itself, its wallet, or a registry such as the Cámara de Comercio |
| Payment state | `AWAITING_PAYER_APPROVAL`, `PENDING`, `COMPLETED`, `CANCELLED`, `FAILED` | Only `COMPLETED` is "Pago realizado" |
| Payer verdict | `MATCH`, `MISMATCH` | "Sí era para eso" / "No era para eso" |

Decision `reasons` carry a `code` and a `message`. Build the copy from the code. The list is `POLICY_REASON_CODES` in `backend/src/domain/policy-decision.ts`. The ones the demo shows:

- `PURPOSE_MISMATCH`, `MERCHANT_NOT_ELIGIBLE`: the shop doesn't fit the purpose (the liquor store).
- `BUDGET_EXCEEDED`: the charge is more than what is left, or in another asset.
- `PAYER_MONITORED_EXCEPTION`: paid only because Pedro ticked MONITORED. Flag it in his report.
- `MERCHANT_EVIDENCE_INSUFFICIENT`, `MERCHANT_EVIDENCE_CONFLICT`, `MERCHANT_HISTORY_CONTRADICTS`: the shop's evidence is too weak or contradicts itself.

## Never shown in the browser

- PayPal account ids, order ids and capture ids. The payer's activity carries only the approval link of an order waiting for them.
- HMAC refs (`subject_ref`, `payer_ref`, `delegate_ref`). The backend strips them from responses.
- A natural person's NIT or cédula. The registry doesn't store them.
- Line-item descriptions after a charge is decided. They can name a medicine. Show categories instead.

## Labels the demo must carry

- ARQ, Nequi and Nequi Negocios are simulations. Category evidence from them is labeled `demo/test data` (`dataLabel` and `simulated` in the category response).
- The Cámara de Comercio shops are real public records (Confecámaras RUES, CC BY-SA 4.0). Credit them as "Fuente: Confecámaras, RUES, datos.gov.co", and never show a real shop as suspicious.
