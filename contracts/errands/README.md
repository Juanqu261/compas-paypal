# Errand contracts

An errand is what the delegate confirmed may be bought under a mandate: INVIMA CUMs, with unit and amount caps ([ADR 0010](../../docs/adr/0010-errands.md)). The code is in `backend/src/api/errands.ts`. Every route needs a demo session token. Errands are health data and never reach PayPal, the analyst or Elastic.

## Draft (optional, stores nothing)

```http
POST /errands/drafts
{ "mandateId": "mandate-…", "utterance": "Pide la losartán de mi abuela", "consent": true }
```

The model proposes items, quantities and CUM `candidates`. The response is `{ "draft": …, "confirmed": false }`.

| Error | When |
| --- | --- |
| `400 CONSENT_REQUIRED` | No consent. Nothing is sent to the model |
| `503 DRAFTING_NOT_CONFIGURED` | Elastic or the model isn't set up |
| `422 DRAFT_UNREADABLE` | The model's answer can't be used |

## Confirm

```http
POST /errands
{
  "mandateId": "mandate-…",
  "kind": "ONE_OFF",
  "items": [{ "label": "Losartán 50 mg", "acceptedCums": ["20062603-28"], "maxUnits": 1 }],
  "maxAmount": { "value": "2000", "assetCode": "USD", "assetScale": 2 },
  "expiresAt": "2026-11-15T00:00:00Z",
  "confirmed": true
}
```

- Only the mandate's delegate can confirm, and `confirmed: true` is required.
- `kind`: `ONE_OFF`, or `STANDING` with `refillEveryDays` from 7 to 90.
- `items`: 1 to 5. Each has 1 to 10 CUMs, each active at INVIMA, and `maxUnits` from 1 to 20.
- `maxAmount` must be in the budget's asset and no more than the budget. `expiresAt` can't be later than the mandate's end.

The response is `201 { errand }`. The errand view adds `displayStatus` (`ACTIVE`, `CANCELLED`, `EXPIRED` or `FULFILLED`) and `used` (units and amount held now).

## Read, cancel, buy

- `GET /errands?mandateId=…`: the errands, for the payer and the delegate.
- `POST /errands/:id/cancel`: the delegate only.
- `POST /purchases` with `errandId`: each line's SKU must have a verified CUM listed in an item's `acceptedCums`, within the caps. Otherwise the purchase is `REVIEW` `ERRAND_MISMATCH`.
