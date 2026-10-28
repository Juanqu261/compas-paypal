# Purchase and spending contracts

The delegate's purchase routes, the PayPal return redirects and the payer's spending view. A policy result is produced only in the backend. The browser never decides `ALLOW`, `DENY` or `REVIEW`.

## Delegate purchases

The source of truth is `DelegatePurchaseService` in `backend/src/application/delegate-purchases.ts` and the handlers in `backend/src/api/purchases.ts`. Both routes need `Authorization: Bearer <token>` from a demo session (`contracts/mandates/README.md`). The actor is the delegate: the payer of the mandate gets `403 NOT_THE_DELEGATE`, a stranger gets `404 NOT_FOUND`, and a delegate gets `404` before the payer authorized the budget.

The body is a charge. It names the merchant by an id from the backend's directory (`GET /demo/merchants`). It never carries a PayPal account or a merchant category: the backend reads the payee's PayPal merchant id from its directory and the categories from the trust log. Lines carry a category and an amount only, because a description can name a medicine.

```http
POST /purchases/preview
POST /purchases
{
  "mandateId": "mandate-…",
  "merchantId": "demo-merchant-drogueria-central",
  "amount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
  "lineItems": [{ "category": "MEDICATION", "amount": { "value": "1120", "assetCode": "USD", "assetScale": 2 } }],
  "idempotencyKey": "purchase-…"
}
```

| Field | Rule |
| --- | --- |
| `amount` | What the merchant charges. An allowed purchase's PayPal order is for exactly this, in this asset, which must be the budget's: COMPAS does not convert |
| `lineItems` | 1 to 20. Same asset as `amount`, adding up to it. `category` is optional and one of the COMPAS categories. A line without one is held (`CLASSIFICATION_UNCERTAIN`), unless its SKU has a verified CUM |
| `lineItems[].catalogItemId` | Optional. The merchant's SKU id (`A-Z a-z 0-9 . _ : -`, up to 64). The backend reads its CUM from the merchant's verified catalog mapping, never from the request. A line with no `category` whose SKU has one is `MEDICATION` |
| `lineItems[].quantity` | Optional, 1 to 99, default 1. Units of the SKU. Counted against an errand's caps |
| `errandId` | Optional. The errand the cart is bought under (`contracts/errands/README.md`). Every line must then fit it, or the purchase is `REVIEW` `ERRAND_MISMATCH`. Another delegate's errand is `DENY` `DELEGATE_NOT_AUTHORIZED`. Unknown: `422 UNKNOWN_ERRAND` |
| `idempotencyKey` | Required by `POST /purchases`. 16 to 64 of `A-Z a-z 0-9 - _`. One per attempt |

### Preview

`POST /purchases/preview` runs every check COMPAS makes before PayPal: the mandate rules, the budget, the merchant's categories through the trust matrix, the cap below `HIGH` and the line items. It writes nothing, reserves nothing and calls no PayPal API. It is not a decision: another purchase can still use the capacity first.

```json
{ "preview": {
  "mandateId": "mandate-…",
  "merchant": { "id": "demo-merchant-drogueria-central", "displayName": "Droguería Central" },
  "requestedAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
  "mandateRules": { "passed": true, "reasonCodes": [] },
  "budget": { "passed": true, "reasonCodes": [] },
  "purposeCheck": { "outcome": "ALLOW", "reasonCodes": [], "matchedCategories": ["MEDICATION"], "enforced": true, "merchantConfidence": "HIGH" },
  "merchantCategories": [{ "category": "MEDICATION", "trustLevel": "PROVIDER_VERIFIED" }],
  "next": "ORDER",
  "execution": "PURCHASES_DISABLED_FOR_DEMO"
} }
```

`next` is what `purchaseUnderMandate` would do now: `STOP_DENY` or `STOP_REVIEW` decide with no PayPal order, `ORDER` decides `ALLOW` and creates a PayPal order for the payer to approve. `budget` is absent when a mandate rule already stops the purchase. With an `errandId`, `errand: { passed, reasonCodes }` says whether the cart fits it. `execution` is `ENABLED`, `PURCHASES_DISABLED_FOR_DEMO` or `PAYPAL_NOT_CONFIGURED`.

### Purchase

`POST /purchases` runs `purchaseUnderMandate` on the same mandates and spending log the mandate routes use, so the payer sees every attempt in `GET /mandates/:id/spending`. On `ALLOW` it reserves the charge from the mandate's remaining capacity, then creates one PayPal order, payable to the merchant, which waits for the payer. `createOrder` is reached only after `ALLOW`. No money moves until the payer approves the order at PayPal.

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ "purchase": PurchaseView, "replayed": false }` | Recorded. `DENY` and `REVIEW` are results, not errors |
| 200 | `{ "purchase": PurchaseView, "replayed": true }` | The same key was already used for this purchase. Nothing ran again |
| 400 | `INVALID_PURCHASE` with `fieldErrors` | The body is wrong |
| 403 | `PURCHASES_DISABLED_FOR_DEMO` | Demo sessions can't create PayPal orders here. Checked before anything else |
| 403 | `NOT_THE_DELEGATE` | The payer asked |
| 404 | `NOT_FOUND` | No such mandate for this delegate |
| 409 | `IDEMPOTENCY_KEY_REUSED` | |
| 422 | `UNKNOWN_MERCHANT` | Not in the backend's directory |
| 422 | `UNKNOWN_ERRAND` | No errand with that id |
| 503 | `PAYPAL_NOT_CONFIGURED` | |
| 503 | `PAYMENT_NOT_STARTED`, `retryable: true` | The purchase stopped before COMPAS held a PayPal order for it, and the reservation was given back. Nothing was paid. An order PayPal may have created anyway can't be captured: no COMPAS purchase names it. Generate a new charge |

```json
{ "purchase": {
  "decisionId": "…",
  "mandateId": "mandate-…",
  "merchant": { "id": "demo-merchant-drogueria-central", "displayName": "Droguería Central" },
  "outcome": "ALLOW",
  "reasonCodes": [],
  "purposeCheck": { "outcome": "ALLOW", "reasonCodes": [], "matchedCategories": ["MEDICATION"], "enforced": true, "merchantConfidence": "HIGH" },
  "monitoredException": false,
  "requestedAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
  "payment": { "status": "CREATED", "state": "AWAITING_PAYER_APPROVAL" },
  "recordedAt": "…"
}, "replayed": false }
```

`payment.status` is `NOT_CREATED` or `CREATED` with a `state`: `AWAITING_PAYER_APPROVAL`, `PENDING`, `COMPLETED`, `CANCELLED` or `FAILED`. Only `COMPLETED` means the merchant was paid. The delegate's view never has the approval link, a PayPal account id, an order id or a token. The delegate's screen follows the state through `GET /mandates/:id/spending`.

**Who may order.** Anyone can start a demo session as Andrea. So `POST /purchases` runs only when the operator sets `COMPAS_DEMO_PURCHASES=enabled` and `DEMO_MERCHANT_PAYPAL_ID` holds the pharmacy's sandbox merchant id (`readDemoPurchasesMode`). It is never on with `NODE_ENV=production`, and COMPAS talks to the PayPal sandbox only. Replace demo sessions with the host wallet's authentication before real funds.

**Not yet.** The merchant has no authentication, so the backend stores no charge (`compas.purchase_intents` stays unused). In `/demo` the merchant phone hands the charge to the delegate phone in the browser, labeled as a simulation. The payer's verdict route (`contracts/merchant-history/README.md`) is still not wired. Refunds and disputes are not handled.

## PayPal return redirects

PayPal sends the payer's browser to the backend after they approve or cancel an order at PayPal. The source of truth is `backend/src/api/paypal-return.ts` and `PayPalOrderSettlement` in `backend/src/application/settle-paypal-order.ts`.

```http
GET /paypal/orders/return?token=<order id>&PayerID=…
GET /paypal/orders/cancel?token=<order id>
302 Location: <PAYPAL_FRONTEND_RETURN_URL>?paypalOrder=<result>&mandateId=<mandate id>
```

Nothing in the URL is trusted. On a return, the settlement reads the order from PayPal and captures it only if PayPal says `APPROVED`, its payee, amount and `custom_id` still match the record, the mandate is still `ACTIVE` and in its window, and, with `DEMO_PAYER_PAYPAL_ID` set, that account approved it. Otherwise the purchase closes unpaid with a `failureCode` and its capacity is given back. A second return captures nothing new. A cancel closes the order `CANCELLED`, unless PayPal already holds it as approved.

`paypalOrder` is a hint for the screen: `completed`, `pending`, `waiting` (not approved yet), `cancelled`, `failed`, or `unconfirmed` (PayPal gave no clear answer; the next activity read reconciles). `mandateId` is absent when the order is unknown or the token malformed. The redirect never carries the order id or the payer's PayPal id.

## Spending report

The source of truth is `buildSpendingReport` in `backend/src/application/spending-report.ts`. The screens read the activity view in `GET /mandates/:id/spending` instead. The report is a record.

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
      "paypalMerchantId": "DEMLAGERBAR22",
      "merchantDisplayName": "Example liquor store",
      "requestedAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
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
      "lineCategories": ["ALCOHOL"],
      "hasUncategorizedLines": false,
      "monitoredException": true,
      "paypal": {
        "orderId": "5O190127TN364715T",
        "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
        "captureId": "3C679366HH908993F",
        "state": "COMPLETED"
      },
      "recordedAt": "2026-10-16T15:00:00.000Z"
    }
  ]
}
```

Amounts and ids are illustrative.

## Reading an entry

| Field | Meaning |
| --- | --- |
| `decision.outcome` | What COMPAS decided. Only `ALLOW` can have a PayPal order. |
| `purposeCheck.outcome` | What the purpose checks alone concluded. In `MONITORED` mode this can be `DENY` on a paid purchase. |
| `purposeCheck.matchedCategories` | Eligible categories the shop resolved to at an accepted trust level. Empty means the shop did not match. |
| `merchantCategories` | Every category the shop resolved to at decision time, with its trust level |
| `lineCategories`, `hasUncategorizedLines` | The cart's COMPAS categories, kept so a capture can join the merchant's history. Never a description |
| `monitoredException` | Paid only because the payer ticked "allow even if not fully approved" |
| `paypal` | The order, its approval link, its capture and COMPAS's state for it. Empty when COMPAS stopped before PayPal. `failureCode` when `state` is `FAILED` |

`purposeCheck` is absent when a mandate rule (status, validity, delegate) stopped the purchase first. Entries never contain line-item descriptions, because they could name a medicine.

## The merchant's sandbox payments

`GET /demo/merchants/:id/payments`, in `backend/src/api/merchant-payments.ts`, is the merchant's view on the PayPal Business screen. No token: it answers only while demo sessions are on (else `503 IDENTITY_NOT_CONFIGURED`) and PayPal is configured (else `503 PAYPAL_NOT_CONFIGURED`). An unknown id is `404 UNKNOWN_MERCHANT`.

It lists the merchant's 8 newest COMPAS purchases that reached PayPal, and reads each order from the PayPal sandbox on every request. It only reads (`getOrder`): it never creates or captures.

```json
{
  "environment": "sandbox",
  "sandboxActivityUrl": "https://www.sandbox.paypal.com/myaccount/activities/",
  "merchant": { "id": "demo-merchant-drogueria-central", "displayName": "Droguería Central", "paypalMerchantId": "2H3UUEB7PL7A6" },
  "payments": [
    {
      "orderId": "0X890113GP3897051",
      "compasState": "COMPLETED",
      "recordedAt": "2026-10-27T12:52:24.966Z",
      "paypal": {
        "read": "OK",
        "orderStatus": "COMPLETED",
        "payeeMerchantId": "2H3UUEB7PL7A6",
        "amount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
        "capture": { "id": "8LL68975M6007841X", "status": "COMPLETED", "amount": { "value": "1120", "assetCode": "USD", "assetScale": 2 } }
      }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `paypal` | What PayPal reports now. `read: "UNAVAILABLE"` with PayPal's error code when that read failed: the state is never guessed |
| `compasState` | COMPAS's own record of the payment, which the settlement moves |
| `sandboxActivityUrl` | The real sandbox page, where the merchant's test business account logs in to see the payment |

The response carries nothing about the payer, the mandate or the purpose: no payer id, no mandate id, no categories, no reasons.
