# Audit

`AuditEvent` lives in `backend/src/domain/audit.ts`.

`AuditRepository` lives in `backend/src/ports/audit-repository.ts`.

This folder is reserved for a future writer that appends one event per material decision: mandate creation, authorization, policy result, and payment result. No writer is implemented in this scaffold, and nothing here persists data.
