# Purchase and spending contracts

The payer's spending view. The source of truth is `buildSpendingReport` in `backend/src/application/spending-report.ts`. No HTTP route serves it yet: purchases need a mandate repository first. This file fixes the shape the ARQ (payer) simulation will read.

The view is a record. A policy result is produced only in the backend. The browser never decides `ALLOW`, `DENY` or `REVIEW`.

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
