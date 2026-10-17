# Open Payments contracts

These are the Open Payments shapes the frontend may see. They never include an access token, a continuation token, a nonce or a raw Open Payments payload. The backend keeps those.

Amounts use the COMPAS `MoneyAmount` shape: an integer in minor units as a decimal string, plus `assetCode` and `assetScale`.

```json
{ "value": "4000", "assetCode": "USD", "assetScale": 2 }
```

## Payer authorization started

Returned by the orchestrator when Pedro is asked to authorize a mandate. The frontend sends the browser to `redirectUrl`, which is Pedro's own wallet consent screen.

```json
{
  "mandateId": "demo-mandate-medication",
  "redirectUrl": "https://auth.example/interact/…"
}
```

## Consent return

After consent, Pedro's wallet redirects to the backend at `GET /open-payments/finish`. The backend verifies the redirect, finishes the grant and sends the browser on to `OPEN_PAYMENTS_RETURN_URL` with two query parameters:

| Parameter | Values |
| --- | --- |
| `payerAuthorization` | `granted`, `rejected`, `failed` |
| `grantKey` | the mandate id |

The query string is a hint for the UI. The mandate status from the backend is the source of truth.

## Payment receipt

Returned by the orchestrator after an `ALLOW` decision produced an outgoing payment. A `DENY` or `REVIEW` has no receipt because no outgoing payment exists.

```json
{
  "mandateId": "demo-mandate-medication",
  "decisionId": "…",
  "outgoingPaymentUrl": "https://wallet.example/op/outgoing-payments/…",
  "incomingPaymentUrl": "https://merchant.example/op/incoming-payments/…",
  "state": "PENDING | COMPLETED | FAILED",
  "debitAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 },
  "receiveAmount": { "value": "…", "assetCode": "…", "assetScale": 2 },
  "sentAmount": { "value": "1120", "assetCode": "USD", "assetScale": 2 }
}
```

`state` is derived by COMPAS. Open Payments has no status field on an outgoing payment. `COMPLETED` means `sentAmount` reached `debitAmount`. The merchant-side view, the incoming payment's `completed` flag, can confirm it.

The amounts above are illustrative. Real values come from a quote on the test network.
