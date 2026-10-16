import type { AuditEvent } from "../domain/audit";

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listByMandate(mandateId: string): Promise<readonly AuditEvent[]>;
}
