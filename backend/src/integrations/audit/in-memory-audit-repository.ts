import type { AuditEvent } from "../../domain/audit.ts";
import type { AuditRepository } from "../../ports/audit-repository.ts";

/**
 * Append-only audit log in memory, for runs without DATABASE_URL. With a
 * database the server uses PostgresAuditRepository (compas.audit_events).
 * A restart loses it, like the other in-memory logs.
 */
export class InMemoryAuditRepository implements AuditRepository {
  readonly #events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    if (this.#events.some((existing) => existing.id === event.id)) {
      throw new Error(`Audit event already exists: ${event.id}`);
    }
    this.#events.push(structuredClone(event));
  }

  async listByMandate(mandateId: string): Promise<readonly AuditEvent[]> {
    return this.#events
      .filter((event) => event.mandateId === mandateId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((event) => structuredClone(event));
  }
}
