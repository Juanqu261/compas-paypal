import type { Mandate } from "../domain/mandate";
import type { MoneyAmount } from "../domain/money";

export interface MandateRepository {
  getById(id: string): Promise<Mandate | undefined>;
  save(mandate: Mandate): Promise<void>;
  /**
   * Takes `amount` from the remaining authorized amount in one atomic step,
   * when the mandate is ACTIVE, in the same asset and has enough left.
   * Returns false otherwise. Capacity is permission, not money.
   */
  reserveCapacity(mandateId: string, amount: MoneyAmount): Promise<boolean>;
  /** Gives back a reservation whose outgoing payment was not created. Never above the budget. */
  releaseCapacity(mandateId: string, amount: MoneyAmount): Promise<void>;
}
