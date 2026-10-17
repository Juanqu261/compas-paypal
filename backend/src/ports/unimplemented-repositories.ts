import type { AuditEvent } from "../domain/audit";
import type { Mandate } from "../domain/mandate";
import { notImplemented } from "../lib/not-implemented";
import type { AuditRepository } from "./audit-repository";
import type { MandateRepository } from "./mandate-repository";

/**
 * Fail-closed placeholders. There is no database in this scaffold.
 * These classes must not return empty success that looks like persistence.
 */
export class UnimplementedMandateRepository implements MandateRepository {
  getById(): Promise<Mandate | undefined> {
    return notImplemented("MandateRepository.getById");
  }

  save(): Promise<void> {
    return notImplemented("MandateRepository.save");
  }

  listByPayer(): Promise<readonly Mandate[]> {
    return notImplemented("MandateRepository.listByPayer");
  }

  listByDelegate(): Promise<readonly Mandate[]> {
    return notImplemented("MandateRepository.listByDelegate");
  }
}

export class UnimplementedAuditRepository implements AuditRepository {
  append(): Promise<void> {
    return notImplemented("AuditRepository.append");
  }

  listByMandate(): Promise<readonly AuditEvent[]> {
    return notImplemented("AuditRepository.listByMandate");
  }
}
