# API

The only implemented route is `GET /health`.

The frontend must call this process later. It must not import `backend/src`.

Likely future resources, not implemented:

- `POST /mandates` and `GET /mandates/:id`
- `POST /purchase-intents`
- `POST /policy-evaluations`
- `POST /payments`
- `GET /demo/session`

A policy result is produced here. The browser does not decide `ALLOW`, `DENY`, or `REVIEW`.
