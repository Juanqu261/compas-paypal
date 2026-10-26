# ADR 0004 — General monorepo architecture

## Status

Accepted

## Context

The foundation in ADR 0002 kept three wallet simulations in one application, and the repository root was that Next.js application. A single frontend repository cannot show a clear boundary between the demo UI, the COMPAS runtime, and future persistence. Open Payments credentials in particular must not live beside browser code.

## Decision

The repository is a general product monorepo:

- `frontend/`, `backend/`, and `data/` are separated.
- The root is not an application and not a Node workspace. There is no `package.json`, Turborepo, Nx, or pnpm workspace at the root.
- One frontend still owns the ARQ, Nequi, and Nequi Negocios simulations.
- The backend owns COMPAS domain, policy, payment orchestration, and the Open Payments gateway.
- Tool-specific AI configuration stays local and untracked.
- The root `AGENTS.md` is the shared AI-agent context.

This supersedes only the "no monorepo" repository constraint from the original foundation. ADR 0002 remains in force for the three surfaces inside `frontend/`.

## Consequences

Commands run inside `frontend/` or `backend/`. The two projects must not import each other's source. A shared contract, when one is needed, is added under `contracts/` instead of a shared package. Demo datasets live in `data/fixtures/`.
