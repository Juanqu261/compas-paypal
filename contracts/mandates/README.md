# Mandate contracts

The HTTP API the ARQ (payer) and Nequi (delegate) simulations use to create, read, authorize and revoke mandates. The source of truth is `MandateService` in `backend/src/application/mandates.ts` and the handlers in `backend/src/api/mandates.ts`. The frontend mirrors these shapes in `frontend/src/features/compas/api/contracts.ts` and never imports `backend/src`.

A response never carries a wallet address, a grant, an access or continuation token, a nonce or a raw Open Payments payload.

Amounts use `MoneyAmount`: an integer in minor units as a decimal string, plus `assetCode` and `assetScale`.

## Identity

Every route except `POST /demo/sessions` needs `Authorization: Bearer <token>`. The backend resolves the actor from the token. A `payerId` or `delegateId` in a body or query is ignored: the payer of a new mandate is always the actor.

COMPAS has no user authentication yet. The token comes from a **demo session**:

```http
POST /demo/sessions
{ "partyId": "demo-payer-pedro" }

201 { "token": "…43 chars…", "party": { "id": "demo-payer-pedro", "displayName": "Pedro" }, "expiresAt": "…", "identity": "DEMO" }
```

Demo sessions are off when `NODE_ENV=production` or `COMPAS_DEMO_IDENTITY=disabled`, and the mandate routes then answer `503 IDENTITY_NOT_CONFIGURED`. Anyone who reaches the backend can start a demo session as any demo party. That is acceptable only because a mandate becomes `ACTIVE` solely after the payer consents at their own Open Payments wallet, and the demo wallets are on the test network. Replace it with the host wallet's authentication before real funds.

Roles come from the mandate, not from the app. The same party can be the payer of one mandate and the delegate of another.

## Routes

| Method and path | Who | Result |
| --- | --- | --- |
| `GET /me` | any session | The party, `payerWallet`, and runtime facts |
| `GET /demo/participants` | any session | Demo parties the actor can name. `dataLabel: "demo/test data"` |
| `GET /mandates?role=payer` | any session | Mandates where the actor is the payer |
| `GET /mandates?role=delegate` | any session | Mandates where the actor is the delegate, only `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` |
| `GET /mandates/:id` | payer or delegate | One mandate. A stranger gets `404` |
| `POST /mandates` | any session (becomes the payer) | `201` with a `DRAFT` mandate |
| `POST /mandates/:id/authorize` | payer | Starts consent at the payer's wallet. `PENDING_AUTHORIZATION` |
| `POST /mandates/:id/revoke` | payer | `REVOKED`. `202` while the wallet's cancellation is pending |
| `GET /mandates/:id/spending` | payer or delegate | The mandate's activity |

`GET /open-payments/finish` (the consent callback, `contracts/open-payments/README.md`) is unchanged. It is what activates a mandate.

A delegate never sees a `DRAFT` or `PENDING_AUTHORIZATION` mandate. Before the payer consents, there is no permission to show.

## Runtime facts

`GET /me` and `GET /health` say what this backend actually is:

```json
{ "identity": "DEMO", "persistence": "IN_MEMORY_DEMO", "openPayments": "configured | not_configured" }
```

`IN_MEMORY_DEMO` means mandates and authorization records live in process memory. A restart loses them. The `compas.mandates` and `compas.payer_grants` tables exist in Supabase but are not wired.

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
| `delegateId`, `beneficiaryId` | Known parties. The delegate is not the payer. The beneficiary needs no wallet |
| `categories` | One or more of `MEDICATION`, `FOOD`, `PERSONAL_CARE`, `ALCOHOL`, `TOBACCO`. Duplicates are dropped |
| `budget.value` | A positive integer string, at most 10,000 whole units of the asset |
| `budget.assetCode`, `assetScale` | The payer wallet's asset when it can be read (`ASSET_MISMATCH` otherwise). Scale 0 to 9 |
| `validFrom`, `expiresAt` | ISO date-times. End after start, end in the future, start no earlier than yesterday, at most one year |
| `enforcement` | `ENFORCED` (default) or `MONITORED`. `MONITORED` needs `"monitoredAcknowledged": true` |
| `merchantConfidence.minimum` | `LOW`, `MEDIUM` or `HIGH` (default). `CONTESTED` is refused |
| `merchantConfidence.maxDebitBelowHigh` | Optional, only with a minimum below `HIGH`. Same asset as the budget, at most the budget |

There is no recurring budget. Open Payments supports a grant `interval`, but the mandate model and schema have no recurring window yet, so the backend never sends one.

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
  "authorization": {
    "consent": "GRANTED",
    "canAuthorize": false,
    "canRevoke": true
  }
}
```

`remainingAuthorizedAmount` is authorization capacity. It is not money COMPAS holds and not a balance of the delegate. `usable` is true when COMPAS would evaluate a purchase under it now. `authorization` is present for the payer only:

| Field | Values |
| --- | --- |
| `consent` | `NOT_STARTED`, `WAITING_FOR_PAYER`, `GRANTED` |
| `grantCancellation` | After a revocation: `NOT_NEEDED` (no grant was ever requested), `PENDING` (COMPAS blocks, the wallet has not confirmed), `DONE` |
| `lastError` | `{ operation: "AUTHORIZE" | "CANCEL", code }`, the gateway's error code. Never a message from the provider |

## Status transitions

```text
DRAFT ──authorize──> PENDING_AUTHORIZATION ──verified finish callback──> ACTIVE
  │                        │  ▲ retry after a rejected or failed consent      │
  │                        └──┘                                               ├─> EXHAUSTED (capacity at zero)
  └────────── revoke ──────────────────────────────────────────────────────> REVOKED
any status but REVOKED ── expiresAt passed ──> EXPIRED
```

- `ACTIVE` only happens inside the finish callback, after `finishPayerGrant` verified the interaction hash and the auth server issued an access token. `?payerAuthorization=granted` in a URL is a hint for the UI and changes nothing.
- A rejected or failed consent leaves `PENDING_AUTHORIZATION`. The payer can authorize again.
- If the payer revokes while consent is in progress, a later finish cancels the new grant instead of activating the mandate.
- Expiry and exhaustion are applied when the mandate is read. An expired mandate's grant is not cancelled automatically. Revoking it cancels it.

## Authorize

```http
POST /mandates/:id/authorize
200 { "mandateId": "mandate-…", "redirectUrl": "https://auth.wallet…/interact/…", "mandate": { … } }
```

The browser goes to `redirectUrl`, Pedro's own wallet. Errors, with the mandate left as it was:

| Status | `error` | When |
| --- | --- | --- |
| 409 | `PAYER_WALLET_NOT_CONFIGURED` | The payer has no Open Payments wallet (`DEMO_PAYER_WALLET_ADDRESS` unset) |
| 503 | `OPEN_PAYMENTS_NOT_CONFIGURED` | The backend has no Open Payments client env |
| 409 | `ASSET_MISMATCH` | The budget is not in the wallet's asset |
| 502 | `AUTHORIZATION_FAILED` | The wallet refused. `providerCode` holds the gateway code |
| 409 | `INVALID_STATE` | Not `DRAFT` or `PENDING_AUTHORIZATION` |
| 403 | `NOT_THE_PAYER` | The delegate asked |

## Revoke

```http
POST /mandates/:id/revoke
200 { "mandate": { … }, "alreadyRevoked": false, "grantCancellation": "DONE" }
202 { "mandate": { … }, "alreadyRevoked": false, "grantCancellation": "PENDING" }
```

COMPAS saves `REVOKED` first, so no new purchase can pass, then calls `cancelPayerGrant`. If the wallet can't be reached, the answer is `202` with `PENDING`, and posting again retries the cancellation. Revoking twice is safe. A paid purchase is not reversed. Changing an active budget's amount or purpose is not supported: it would need a new grant.

## Activity

```http
GET /mandates/:id/spending
200 { "activity": { … }, "providerSpentAvailable": true, "providerSpent": { "value": "1120", "assetCode": "USD", "assetScale": 2 } }
```

`activity` comes from `buildMandateActivity` (`backend/src/application/mandate-activity.ts`), over the same spending log as `buildSpendingReport`:

| `kind` | Means |
| --- | --- |
| `COMPLETED` | The outgoing payment reached its debit amount |
| `PENDING` | An outgoing payment exists but has not completed |
| `FAILED` | Policy allowed it, but no payment completed |
| `DENIED`, `REVIEW` | Policy stopped it. No outgoing payment exists |

`totals.completed` sums only `COMPLETED` debits in the budget's asset. `totals.inProgress` sums `PENDING` ones apart. Failed, denied and held attempts add nothing. `buildSpendingReport`'s `totals.paid` counts any record with an outgoing payment URL, pending included. The screens use this view instead. `capacityReconciled: false` means recorded debits exceed what `remainingAuthorizedAmount` already accounts for: the purchase flow doesn't reduce capacity yet.

Each entry has `kind`, `merchantDisplayName`, `requestedAmount`, `debitAmount` when quoted, `monitoredException`, `purposeMatched` and `reasonCodes`. It has no line items, wallet URLs or Open Payments references. `providerSpent` is the wallet's own figure from `readGrantSpentAmounts`, for the payer only, when the grant is active.

No HTTP route records purchases yet, so in this runtime the activity is empty until the purchase routes share the spending log.
