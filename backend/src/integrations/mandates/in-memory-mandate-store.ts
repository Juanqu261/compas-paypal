import type { Mandate } from "../../domain/mandate.ts";
import type {
  MandateAuthorizationRecord,
  MandateAuthorizationStore,
} from "../../ports/mandate-authorization-store.ts";
import type { MandateRepository } from "../../ports/mandate-repository.ts";

/**
 * Hackathon mandate store. A backend restart loses every mandate, like the
 * grant store, the spending log and the trust log. It is not persistence:
 * `/health` and every mandate response say `persistence: "IN_MEMORY_DEMO"`.
 * The Postgres tables for it (`compas.mandates`) exist but are not wired yet.
 */
export class InMemoryMandateRepository implements MandateRepository {
  readonly #mandates = new Map<string, Mandate>();

  async getById(id: string): Promise<Mandate | undefined> {
    const mandate = this.#mandates.get(id);
    return mandate ? structuredClone(mandate) : undefined;
  }

  async save(mandate: Mandate): Promise<void> {
    this.#mandates.set(mandate.id, structuredClone(mandate));
  }

  async listByPayer(payerId: string): Promise<readonly Mandate[]> {
    return this.#list((mandate) => mandate.payer.id === payerId);
  }

  async listByDelegate(delegateId: string): Promise<readonly Mandate[]> {
    return this.#list((mandate) => mandate.delegate.id === delegateId);
  }

  #list(keep: (mandate: Mandate) => boolean): readonly Mandate[] {
    return [...this.#mandates.values()]
      .filter(keep)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((mandate) => structuredClone(mandate));
  }
}

/** In memory, like the grant store it describes. */
export class InMemoryMandateAuthorizationStore implements MandateAuthorizationStore {
  readonly #records = new Map<string, MandateAuthorizationRecord>();

  async get(mandateId: string): Promise<MandateAuthorizationRecord | undefined> {
    const record = this.#records.get(mandateId);
    return record ? structuredClone(record) : undefined;
  }

  async put(record: MandateAuthorizationRecord): Promise<void> {
    this.#records.set(record.mandateId, structuredClone(record));
  }
}
