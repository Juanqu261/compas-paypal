# Contracts

Cross-runtime contracts will live here: OpenAPI descriptions, JSON schemas, event schemas, and shared request or response shapes.

- `data-model/`: what the database holds, which screen each table feeds, and the formats the frontend receives. Start here.
- `mandates/`: creating, authorizing, reading and revoking mandates, demo sessions, and the mandate activity view.
- `merchant-categories/`: category claims and the merchant category view.
- `merchant-history/`: the payer's verdict on a paid purchase.
- `merchant-registry/`: PROVISIONAL shape of the Cámara de Comercio registry database.
- `purchases/`: the delegate's purchase, the PayPal order it creates, and the PayPal return redirects.
- `errands/`: drafting, confirming, cancelling and reading errands.
- `agents/`: the MCP server and its OAuth flow, the agent tools, and the delegate's consent and grant routes.
- `merchant-onboarding/`: Log in with PayPal for merchants, the Cámara certificate, analyst jobs, findings and appeals.

There is no shared TypeScript package. The frontend must not import `backend/src`, and the backend must not import `frontend/src`. When a payload needs to be shared, add the contract in this directory instead.
