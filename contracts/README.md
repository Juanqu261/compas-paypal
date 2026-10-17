# Contracts

Cross-runtime contracts will live here: OpenAPI descriptions, JSON schemas, event schemas, and shared request or response shapes.

- `mandates/`: creating, authorizing, reading and revoking mandates, demo sessions, and the mandate activity view.
- `merchant-categories/`: category claims and the merchant category view.
- `merchant-history/`: the payer's verdict on a paid purchase.
- `merchant-registry/`: PROVISIONAL shape of the Cámara de Comercio registry database.
- `open-payments/`, `purchases/`: see their READMEs.

There is no shared TypeScript package. The frontend must not import `backend/src`, and the backend must not import `frontend/src`. When a payload needs to be shared, add the contract in this directory instead.
