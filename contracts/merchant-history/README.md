# Merchant history contracts

The payer's verdict on a paid purchase. It is the only input that raises a merchant's history in the trust matrix. Design: `docs/plans/trust-matrix.md` and `docs/adr/0007-merchant-confidence-matrix.md`.

## Confirm a purchase

`POST /spending-records/<spendingRecordId>/confirmation`

The handler is in `backend/src/api/spending-confirmations.ts`. It is **not wired into the server yet**: the backend runs no purchases over HTTP, so there is nothing to confirm. `spendingRecordId` is the policy decision id on the payer's spending record.

```json
{ "payerId": "demo-payer-pedro", "verdict": "MATCH" }
```

`verdict` is `MATCH` (the purchase fit the purpose) or `MISMATCH` (it didn't).

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ "recorded": "MATCH" }` | Recorded |
| 200 | `{ "recorded": "MATCH", "duplicate": true }` | The same verdict was already recorded |
| 400 | `{ "error": "INVALID_CONFIRMATION", "message" }` | Not JSON, no `payerId`, or an unknown verdict |
| 403 | `{ "error": "NOT_THE_PAYER", "message" }` | Only the purchase's payer may answer |
| 404 | `{ "error": "PURCHASE_NOT_FOUND", "message" }` | No paid purchase with that id |
| 409 | `{ "error": "VERDICT_ALREADY_RECORDED", "message" }` | A different verdict was already recorded. One verdict per purchase |

**There is no payer authentication yet.** Knowing the payer id is all the handler checks. This must close before a real deployment.

## What is stored

One observation per paid purchase and one per verdict. Each holds:

- the merchant's PayPal merchant id
- HMAC refs for the payer and the delegate
- the mandate's categories and the categories on the merchant's lines
- the enforcement mode, the payment state and the time

Line descriptions, product names, amounts and party ids are never stored.
