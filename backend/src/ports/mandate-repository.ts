import type { Mandate } from "../domain/mandate";

export interface MandateRepository {
  getById(id: string): Promise<Mandate | undefined>;
  save(mandate: Mandate): Promise<void>;
  /** Mandates that name the party as payer. */
  listByPayer(payerId: string): Promise<readonly Mandate[]>;
  /** Mandates that name the party as delegate. */
  listByDelegate(delegateId: string): Promise<readonly Mandate[]>;
}
