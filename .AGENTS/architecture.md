# Architecture

The repository is a product monorepo. The root is documentation and agent context. It is not an application and it has no workspace orchestrator.

- `frontend/` is one Next.js app. `/arq`, `/nequi`, `/nequi-negocios`, and `/demo` are simulated wallet surfaces. `/demo` shows the three experiences in phone frames under one session. They are not separate apps.
- `backend/` owns the domain, policy gate, Open Payments port, merchant registry, purpose classifier, audit, and the future HTTP API.
- `data/` holds fixtures and, later, schemas, migrations, and seeds. It is not a database.
- `contracts/` is where a shared API or event schema goes. There is no shared TypeScript package.
- `infra/` is reserved. Nothing is deployed from it yet.
- `docs/` is the product and research documentation.

The frontend must not import `backend/src`. The backend must not import `frontend/src`. A browser result is not an authoritative `ALLOW`, `DENY`, or `REVIEW`.

Open Payments private keys stay in the backend environment. They must not be exposed as `NEXT_PUBLIC_*` variables.
