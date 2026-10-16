# Contracts

Cross-runtime contracts will live here: OpenAPI descriptions, JSON schemas, event schemas, and shared request or response shapes.

There is no shared TypeScript package. The frontend must not import `backend/src`, and the backend must not import `frontend/src`. When a payload needs to be shared, add the contract in this directory instead.
