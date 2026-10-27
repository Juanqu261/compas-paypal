# Mandate contracts

The HTTP API the ARQ (payer) and Nequi (delegate) simulations use to create, read, authorize and revoke mandates. The source of truth is `MandateService` in `backend/src/application/mandates.ts` and the handlers in `backend/src/api/mandates.ts`. The frontend mirrors these shapes in `frontend/src/features/compas/api/contracts.ts` and never imports `backend/src`.

A response never carries a PayPal account id, an order or capture id, a token or a raw PayPal payload. The one PayPal value a response may carry is the link that approves an order, in the payer's activity only.

Amounts use `MoneyAmount`: an integer in minor units as a decimal string, plus `assetCode` and `assetScale`.

## Identity

Every route except `POST /demo/sessions` needs `Authorization: Bearer <token>`. The backend resolves the actor from the token. A `payerId` or `delegateId` in a body or query is ignored: the payer of a new mandate is always the actor.

COMPAS has no user authentication yet. The token comes from a **demo session**:

```http
POST /demo/sessions
{ "partyId": "demo-payer-pedro" }

201 { "token": "…43 chars…", "party": { "id": "demo-payer-pedro", "displayName": "Pedro" }, "expiresAt": "…", "identity": "DEMO" }
```

Demo sessions are off when `NODE_ENV=production` or `COMPAS_DEMO_IDENTITY=disabled`, and the mandate routes then answer `503 IDENTITY_NOT_CONFIGURED`. Anyone who reaches the backend can start a demo session as any demo party. That is acceptable only because no money moves on a session alone: every payment is a PayPal order that the payer approves while logged in to their own PayPal, and COMPAS talks to the PayPal sandbox only. Replace demo sessions with the host wallet's authentication before real funds.

Roles come from the mandate, not from the app. The same party can be the payer of one mandate and the delegate of another.

## Routes

| Method and path | Who | Result |
| --- | --- | --- |
| `GET /me` | any session | The party and runtime facts |
| `GET /demo/participants` | any session | Demo parties the actor can name: Andrea, Gladys and four test contacts (`demo-contact-*`). `dataLabel: "demo/test data"` |
| `GET /mandates?role=payer` | any session | Mandates where the actor is the payer |
| `GET /mandates?role=delegate` | any session | Mandates where the actor is the delegate, only `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` |
| `GET /mandates/:id` | payer or delegate | One mandate. A stranger gets `404` |
| `POST /mandates` | any session (becomes the payer) | `201` with a `DRAFT` mandate |
| `POST /mandates/:id/authorize` | payer | `ACTIVE`. Nothing is asked of PayPal |
| `POST /mandates/:id/revoke` | payer | `REVOKED` |
| `GET /mandates/:id/spending` | payer or delegate | The mandate's activity, after reconciling its open PayPal orders |

A delegate never sees a `DRAFT` mandate. Before the payer confirms, there is no permission to show.

## Runtime facts

`GET /me` and `GET /health` say what this backend actually is:

```json
{
  "identity": "DEMO",
  "persistence": "IN_MEMORY_DEMO | POSTGRES",
  "paypal": "sandbox | not_configured",
  "payerApproval": "PINNED | ANY_ACCOUNT",
  "purchases": "enabled | disabled_for_demo | not_configured"
}
```

- `persistence`: `POSTGRES` when `DATABASE_URL` is set. Mandates, spending records and audit events then live in the `compas` schema (`data/schema/README.md`). `IN_MEMORY_DEMO` keeps them in process memory, and a restart loses them.
- `paypal`: `sandbox` when `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set. COMPAS never talks to live PayPal.
- `payerApproval`: `PINNED` when `DEMO_PAYER_PAYPAL_ID` names Pedro's sandbox account: COMPAS then captures only orders that account approved. `ANY_ACCOUNT`: whoever approves the order pays it.
- `purchases`: whether a demo session may create PayPal orders through `POST /purchases` (`COMPAS_DEMO_PURCHASES`). See `contracts/purchases/README.md`.

## Create a mandate

```http
POST /mandates
{
  "delegateId": "demo-delegate-andrea",
  "beneficiaryId": "demo-beneficiary-gladys",
  "categories": ["MEDICATION"],
  "budget": { "value": "4000", "assetCode": "USD", "assetScale": 2 },
  "validFrom": "2026-10-16T05:00:00.000Z",
  "expiresAt": "2026-11-16T04:59:59.000Z",
  "enforcement": "ENFORCED",
  "merchantConfidence": { "minimum": "HIGH" }
}
```

| Field | Rule |
| --- | --- |
| `delegateId`, `beneficiaryId` | Known parties. The delegate is not the payer. The beneficiary needs no PayPal account. They may be the same party: the ARQ wizard asks for one contact and sends it as both |
| `categories` | One or more of `MEDICATION`, `FOOD`, `PERSONAL_CARE`, `ALCOHOL`, `TOBACCO`. Duplicates are dropped |
| `budget.value` | A positive integer string, at most 10,000 whole units of the asset |
| `budget.assetCode`, `assetScale` | A currency PayPal takes in an order, at PayPal's scale: USD/2, EUR/2, JPY/0 and so on (`ASSET_NOT_SUPPORTED` otherwise, for example COP). Every order under the mandate is in this asset: COMPAS does not convert |
| `validFrom`, `expiresAt` | ISO date-times. End after start, end in the future, start no earlier than yesterday, at most one year |
| `enforcement` | `ENFORCED` (default) or `MONITORED`. `MONITORED` needs `"monitoredAcknowledged": true` |
| `merchantConfidence.minimum` | `LOW`, `MEDIUM` or `HIGH` (default). `CONTESTED` is refused |
| `merchantConfidence.maxDebitBelowHigh` | Optional, only with a minimum below `HIGH`. Same asset as the budget, at most the budget |

There is no recurring budget.

A `400 INVALID_MANDATE` lists every problem:

```json
{ "error": "INVALID_MANDATE", "message": "…", "fieldErrors": [{ "field": "budget.value", "code": "INVALID_AMOUNT", "message": "…" }] }
```

## A mandate, as the actor sees it

```json
{
  "id": "mandate-…",
  "status": "ACTIVE",
  "viewerRole": "PAYER",
  "payer": { "id": "demo-payer-pedro", "displayName": "Pedro" },
  "delegate": { "id": "demo-delegate-andrea", "displayName": "Andrea" },
  "beneficiary": { "id": "demo-beneficiary-gladys", "displayName": "Gladys" },
  "budget": { "value": "4000", "assetCode": "USD", "assetScale": 2 },
  "remainingAuthorizedAmount": { "value": "4000", "assetCode": "USD", "assetScale": 2 },
  "purposePolicy": { "eligibleCategories": ["MEDICATION"], "enforcement": "ENFORCED", "merchantConfidence": { "minimum": "HIGH" } },
  "validFrom": "…", "expiresAt": "…", "createdAt": "…",
  "usable": true,
  "authorization": { "consent": "GRANTED", "canAuthorize": false, "canRevoke": true }
}
```

`remainingAuthorizedAmount` is authorization capacity. It is not money COMPAS holds and not a balance of the delegate. `usable` is true when COMPAS would evaluate a purchase under it now. `authorization` is present for the payer only. `consent` is `NOT_STARTED` or `GRANTED`, read from the mandate's audit events (`MANDATE_ACTIVATED`).

## Status transitions

```text
DRAFT ──authorize──> ACTIVE ─────────────────────> EXHAUSTED (capacity at zero)
  │                    │
  └────── revoke ──────┴───────────────────────────> REVOKED
any status but REVOKED ── expiresAt passed ──> EXPIRED
```

- Authorizing asks nothing of PayPal. Each allowed purchase is a PayPal order the payer approves at PayPal ([ADR 0008](../../docs/adr/0008-paypal-rail-per-order-approval.md)).
- Status changes go through `MandateRepository.transitionStatus`, a conditional update of the status alone. They never rewrite `remainingAuthorizedAmount`, so a purchase's reservation is never undone by an activation, expiry or revocation.
- `EXHAUSTED` is not stored. A mandate reads as `EXHAUSTED` while it is `ACTIVE` with no capacity left, and reads as `ACTIVE` again if an unpaid order releases its reservation.
- Expiry and exhaustion are applied when the mandate is read.

## Authorize

```http
POST /mandates/:id/authorize
200 { "mandateId": "mandate-…", "mandate": { … "status": "ACTIVE" … } }
```

| Status | `error` | When |
| --- | --- | --- |
| 409 | `INVALID_STATE` | Not `DRAFT`, for example already active, revoked or expired |
| 403 | `NOT_THE_PAYER` | The delegate asked |
| 404 | `NOT_FOUND` | A stranger asked, or no such mandate |

## Revoke

```http
POST /mandates/:id/revoke
200 { "mandate": { … }, "alreadyRevoked": false }
```

Revoking is a COMPAS change only: there is no standing permission at PayPal to cancel. No new purchase can pass, and an order still waiting for the payer is never captured: the settlement checks the mandate again before every capture. Revoking twice is safe. A paid purchase is not reversed. Changing an active budget's amount or purpose is not supported.

## Activity

```http
GET /mandates/:id/spending
200 { "activity": { … } }
```

The backend first reconciles the mandate's open PayPal orders (`PayPalOrderSettlement.refresh`): it captures an order the payer approved whose return never arrived, closes one PayPal expired, and completes a pending capture. A PayPal failure there is logged and the activity still answers.

`activity` comes from `buildMandateActivity` (`backend/src/application/mandate-activity.ts`), over the same spending log as `buildSpendingReport`:

| `kind` | Means |
| --- | --- |
| `COMPLETED` | PayPal captured the order: the merchant was paid |
| `PENDING` | PayPal accepted the capture but has not completed it |
| `AWAITING_APPROVAL` | Policy allowed it. The PayPal order waits for the payer. Nothing paid |
| `CANCELLED` | The payer cancelled at PayPal. Nothing paid |
| `FAILED` | Policy allowed it, but nothing was paid. `failureCode` says why |
| `DENIED`, `REVIEW` | Policy stopped it. No PayPal order exists |

`failureCode` is one of `MANDATE_NOT_USABLE`, `ORDER_MISMATCH`, `PAYER_ACCOUNT_MISMATCH`, `CAPTURE_DECLINED`, `ORDER_EXPIRED`. An `ALLOW` with no order and no code means the order could not be created.

`totals.completed` sums only `COMPLETED` charges in the budget's asset. `totals.inProgress` sums `AWAITING_APPROVAL` and `PENDING` ones apart, with `awaitingApprovalCount` and `inProgressCount`. Cancelled, failed, denied and held attempts add nothing. `capacityReconciled: false` means recorded charges exceed what `remainingAuthorizedAmount` already accounts for.

Each entry has `kind`, `merchantDisplayName`, `requestedAmount`, `monitoredException`, `purposeMatched`, `reasonCodes` and, for `FAILED`, `failureCode`. In the payer's view only, an `AWAITING_APPROVAL` entry of a usable mandate also has `approvalUrl`: the PayPal page where the payer approves that exact order. An entry never has line items, a PayPal account id or an order id.

`POST /purchases` (`contracts/purchases/README.md`) writes to the same spending log, so each of the delegate's attempts shows here. It runs only when the operator enabled demo purchases.
