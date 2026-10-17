# Purchase and spending contracts

The delegate's purchase routes and the payer's spending view. A policy result is produced only in the backend. The browser never decides `ALLOW`, `DENY` or `REVIEW`.

## Delegate purchases

The source of truth is `DelegatePurchaseService` in `backend/src/application/delegate-purchases.ts` and the handlers in `backend/src/api/purchases.ts`. Both routes need `Authorization: Bearer <token>` from a demo session (`contracts/mandates/README.md`). The actor is the delegate: the payer of the mandate gets `403 NOT_THE_DELEGATE`, a stranger gets `404 NOT_FOUND`, and a delegate gets `404` before the payer consented.

The body is a charge. It names the merchant by an id from the backend's directory (`GET /demo/merchants`). It never carries a wallet address or a merchant category: the backend reads the wallet from its directory and the categories from the trust log. Lines carry a category and an amount only, because a description can name a medicine.

```http
POST /purchases/preview
POST /purchases
{
  "mandateId": "mandate-…",
  "merchantId": "demo-merchant-drogueria-central",
  "amount": { "value": "1500", "assetCode": "USD", "assetScale": 2 },
  "lineItems": [{ "category": "MEDICATION", "amount": { "value": "1500", "assetCode": "USD", "assetScale": 2 } }],
  "idempotencyKey": "purchase-…"
}
```

| Field | Rule |
| --- | --- |
| `amount` | What the merchant charges, in the merchant wallet's asset |
| `lineItems` | 1 to 20. Same asset as `amount`, adding up to it. `category` is optional and one of the COMPAS categories. A line without one is held (`CLASSIFICATION_UNCERTAIN`) |
| `idempotencyKey` | Required by `POST /purchases`. 16 to 64 of `A-Z a-z 0-9 - _`. One per attempt |

### Preview

`POST /purchases/preview` runs the checks COMPAS can make before Open Payments: the mandate rules, the merchant's categories through the trust matrix and the line items. It writes nothing and calls no wallet. It is not a decision: the budget and the cap below `HIGH` need the quoted debit.

```json
{ "preview": {
  "mandateId": "mandate-…",
  "merchant": { "id": "demo-merchant-drogueria-central", "displayName": "Droguería Central" },
  "requestedAmount": { "value": "1500", "assetCode": "USD", "assetScale": 2 },
  "mandateRules": { "passed": true, "reasonCodes": [] },
  "purposeCheck": { "outcome": "ALLOW", "reasonCodes": [], "matchedCategories": ["MEDICATION"], "enforced": true, "merchantConfidence": "HIGH" },
  "merchantCategories": [{ "category": "MEDICATION", "trustLevel": "PROVIDER_VERIFIED" }],
  "next": "QUOTE",
  "pendingChecks": ["BUDGET"],
  "execution": "PURCHASES_DISABLED_FOR_DEMO"
} }
```

`next` is what `purchaseUnderMandate` would do: `STOP_DENY` or `STOP_REVIEW` decide before any Open Payments call, `QUOTE` goes on to an incoming payment, a quote and the budget check. `execution` says whether `POST /purchases` may run here.

### Purchase

`POST /purchases` runs `purchaseUnderMandate` on the same mandates, grants and spending log the mandate routes use, so the payer sees every attempt in `GET /mandates/:id/spending`. `createOutgoingPayment` is reached only after `ALLOW`. An `ALLOW` reserves the quoted debit from the mandate's remaining capacity.

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ "purchase": PurchaseView, "replayed": false }` | Recorded. `DENY` and `REVIEW` are results, not errors |
| 200 | `{ "purchase": PurchaseView, "replayed": true }` | The same key was already used for this purchase. Nothing ran again |
| 400 | `INVALID_PURCHASE` with `fieldErrors` | The body is wrong |
| 403 | `PURCHASES_DISABLED_FOR_DEMO` | Demo sessions can't spend a grant here. Checked before anything else |
| 403 | `NOT_THE_DELEGATE` | The payer asked |
| 404 | `NOT_FOUND` | No such mandate for this delegate |
| 409 | `GRANT_NOT_ACTIVE` | An `ACTIVE` mandate without the payer's active grant. Fails closed |
| 409 | `PAYER_WALLET_NOT_CONFIGURED`, `IDEMPOTENCY_KEY_REUSED` | |
| 422 | `UNKNOWN_MERCHANT` | Not in the backend's directory |
| 503 | `OPEN_PAYMENTS_NOT_CONFIGURED` | |
| 503 | `PAYMENT_NOT_STARTED`, `retryable: true` | COMPAS failed before it asked for the payment. Nothing was paid |
| 502 | `PAYMENT_OUTCOME_UNKNOWN`, `retryable: false` | COMPAS asked for the payment and got no clear answer. Do not retry: read the activity |

```json
{ "purchase": {
  "decisionId": "…",
  "mandateId": "mandate-…",
  "merchant": { "id": "demo-merchant-liquor", "displayName": "Licorera de ejemplo" },
  "outcome": "DENY",
  "reasonCodes": ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH"],
  "purposeCheck": { "outcome": "DENY", "reasonCodes": ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH"], "matchedCategories": [], "enforced": true },
  "monitoredException": false,
  "requestedAmount": { "value": "1500", "assetCode": "USD", "assetScale": 2 },
  "payment": { "status": "NOT_CREATED" },
  "recordedAt": "…"
}, "replayed": false }
```

`payment.status` is `NOT_CREATED` or `CREATED` with a derived `state` (`PENDING`, `COMPLETED`, `FAILED`). `ALLOW` with `PENDING` is not a completed payment. The view has no wallet URL, quote id or token.

**Who may spend.** Anyone can start a demo session as Andrea. So `POST /purchases` runs only when the operator sets `COMPAS_DEMO_PURCHASES=enabled` and `CLIENT_WALLET_ADDRESS`, `DEMO_PAYER_WALLET_ADDRESS` and `DEMO_MERCHANT_WALLET_ADDRESS` are on `interledger-test.dev` (`readDemoPurchasesMode`). It is never on with `NODE_ENV=production`. Replace demo sessions with the host wallet's authentication before real funds.

**Not yet.** The merchant has no authentication, so the backend stores no charge (`compas.purchase_intents` stays unused). In `/demo` the merchant phone hands the charge to the delegate phone in the browser, labeled as a simulation. The payer's verdict route (`contracts/merchant-history/README.md`) is still not wired.

## Spending report

The source of truth is `buildSpendingReport` in `backend/src/application/spending-report.ts`. The screens read the activity view in `GET /mandates/:id/spending` instead. The view is a record.

## Spending report

```json
{
  "mandateId": "demo-mandate-medication",
  "enforcement": "MONITORED",
  "budget": { "value": "4000", "assetCode": "USD", "assetScale": 2 },
  "totals": {
    "paid": { "value": "2240", "assetCode": "USD", "assetScale": 2 },
    "attempts": 3,
    "paidCount": 2,
    "notPaidCount": 1,
    "monitoredExceptions": 1,
    "paidOutsidePurpose": 1
  },
  "entries": [
    {
      "id": "decision-2",
      "mandateId": "demo-mandate-medication",
      "purchaseIntentId": "demo-intent-liquor",
      "merchantWalletAddressUrl": "https://wallet.example/demo-example-liquor",
      "merchantDisplayName": "Example liquor store",
      "requestedAmount": { "value": "1000", "assetCode": "EUR", "assetScale": 2 },
      "debitAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
      "decision": {
        "outcome": "ALLOW",
        "reasons": [
          { "code": "MERCHANT_NOT_ELIGIBLE", "message": "…" },
          { "code": "PURPOSE_MISMATCH", "message": "…" },
          { "code": "PAYER_MONITORED_EXCEPTION", "message": "…" }
        ]
      },
      "purposeCheck": {
        "outcome": "DENY",
        "reasons": [{ "code": "MERCHANT_NOT_ELIGIBLE", "message": "…" }, { "code": "PURPOSE_MISMATCH", "message": "…" }],
        "matchedCategories": [],
        "enforced": false
      },
      "merchantCategories": [
        { "category": "ALCOHOL", "trustLevel": "PROVIDER_VERIFIED" },
        { "category": "TOBACCO", "trustLevel": "PROVIDER_VERIFIED" }
      ],
      "monitoredException": true,
      "openPayments": {
        "incomingPaymentUrl": "https://…/incoming-payments/…",
        "quoteId": "https://…/quotes/…",
        "outgoingPaymentUrl": "https://…/outgoing-payments/…",
        "state": "PENDING"
      },
      "recordedAt": "2026-10-16T15:00:00.000Z"
    }
  ]
}
```

Amounts are illustrative. Real values come from an Open Payments quote.

## Reading an entry

| Field | Meaning |
| --- | --- |
| `decision.outcome` | What COMPAS decided. Only `ALLOW` can have an `outgoingPaymentUrl`. |
| `purposeCheck.outcome` | What the purpose checks alone concluded. In `MONITORED` mode this can be `DENY` on a paid purchase. |
| `purposeCheck.matchedCategories` | Eligible categories the shop resolved to at an accepted trust level. Empty means the shop did not match. |
| `merchantCategories` | Every category the shop resolved to at decision time, with its trust level |
| `monitoredException` | Paid only because the payer ticked "allow even if not fully approved" |
| `openPayments` | Open Payments references. Absent when COMPAS stopped before calling Open Payments. |

`purposeCheck` is absent when a mandate rule (status, validity, delegate) stopped the purchase first. Entries never contain line-item descriptions, because they could name a medicine.
