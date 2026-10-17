import type { AuditEvent, OpenPaymentsResourceRefs } from "../../domain/audit.ts";
import type { AuditRepository } from "../../ports/audit-repository.ts";
import { type Database, iso } from "./database.ts";

type AuditRow = {
  id: string;
  type: string;
  occurred_at: Date;
  mandate_id: string | null;
  decision_id: string | null;
  actor_id: string | null;
  open_payments_refs: OpenPaymentsResourceRefs | null;
  payload: Record<string, string>;
};

/** compas.audit_events. The table refuses UPDATE and DELETE. */
export class PostgresAuditRepository implements AuditRepository {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async append(event: AuditEvent): Promise<void> {
    const sql = this.#sql;
    await sql`
      insert into compas.audit_events
        (id, type, occurred_at, mandate_id, decision_id, actor_id, open_payments_refs, payload)
      values
        (${event.id}, ${event.type}, ${event.occurredAt}, ${event.mandateId ?? null}, ${event.decisionId ?? null},
         ${event.actorId ?? null}, ${event.openPaymentsRefs ? sql.json(event.openPaymentsRefs as never) : null},
         ${sql.json(event.payload as never)})`;
  }

  async listByMandate(mandateId: string): Promise<readonly AuditEvent[]> {
    const rows = await this.#sql<AuditRow[]>`
      select * from compas.audit_events where mandate_id = ${mandateId} order by occurred_at, id`;
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      occurredAt: iso(row.occurred_at),
      ...(row.mandate_id !== null ? { mandateId: row.mandate_id } : {}),
      ...(row.decision_id !== null ? { decisionId: row.decision_id } : {}),
      ...(row.actor_id !== null ? { actorId: row.actor_id } : {}),
      ...(row.open_payments_refs !== null ? { openPaymentsRefs: row.open_payments_refs } : {}),
      payload: row.payload,
    }));
  }
}
