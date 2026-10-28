# Merchant onboarding and analyst contracts

Merchant login, the Cámara certificate, analyst jobs, findings and appeals ([ADR 0009](../../docs/adr/0009-ai-analyst-evidence.md)). The code is in `backend/src/api/merchant-onboarding.ts`. Findings are about merchants only: they never hold a NIT, an email, a payer or an errand.

## Merchant session

| Route | Result |
| --- | --- |
| `GET /paypal/identity/start?merchantId=…` | `302` to the PayPal sandbox login. `503` without PayPal credentials |
| `GET /paypal/identity/return` (PayPal calls it) | `302` to the frontend with, in the fragment, `merchantSession` and `merchantId`, or `merchantLoginError` |
| `POST /demo/merchant-sessions { merchantId }` | A demo session (`proof: "DEMO"`). It can't bind a certificate |

The PayPal account that logs in must be the merchant's own. Send the token as `Authorization: Bearer <token>`.

## Certificate

```http
POST /merchant-onboarding/certificate
{ "certificateText": "CERTIFICADO DE EXISTENCIA Y REPRESENTACIÓN LEGAL …" }
```

The response is `201 { finding }`. Its `outcome` is one of:

- `VERIFIED_BOUND`: the Cámara confirms the certificate, and its email is the account's PayPal email. The shop can reach `HIGH`.
- `VERIFIED_UNBOUND`: confirmed, but there's no email match. At most `MEDIUM`.
- `REJECTED`: the code is unknown, or the NIT differs.

Errors: `401` without a session, `422 CERTIFICATE_UNREADABLE`, `503 ANALYST_NOT_CONFIGURED`. A demo certificate is available at `GET /demo/camara-certificate?merchantId=…`.

## Analyst

| Route | Notes |
| --- | --- |
| `POST /analyst/jobs { merchantId }` | `202 { job }`. Off with `COMPAS_ANALYST_JOBS=disabled`, and never in production |
| `GET /analyst/jobs/:id` | `QUEUED`, `RUNNING`, `COMPLETED` or `FAILED` |
| `GET /analyst/findings?merchantId=…` | Needs the merchant's session, or demo mode |
| `POST /analyst/findings/:id/response { text }` | The merchant answers a flag. The trust log doesn't change |
| `POST /operator/findings/:id/withdraw { reason }` | Needs `Bearer <COMPAS_OPERATOR_TOKEN>`. A human withdraws the flag |

A `COMPLETED` job has a `result`: `runId`, the counts (`items`, `verifiedMappings`, `rejectedMappings`, `newFlags`), and `skus`, one per catalog SKU: `skuId`, `name`, `candidates` (how many CUMs the index proposed), the model's `itemClass` (`MEDICINE`, `NOT_MEDICINE`, `UNSURE`), and, when the model picked one, `cum` and the verifier's `outcome`. A `FAILED` job has only the error's name.

A finding is one of:

- a `CUM_MAPPING` pointer: `skuId`, `cum`, `VERIFIED` or `REJECTED`
- a `CAMARA_CERTIFICATE` pointer: `verificationCode`, `outcome`, `detail`
- a `JUDGMENT`: `CATALOG_OFF_PURPOSE` or `LOOKALIKE_SIGNALS`, with `citedSkuIds`, `note`, and a `status` of `OPEN`, `RESPONDED` or `WITHDRAWN`
