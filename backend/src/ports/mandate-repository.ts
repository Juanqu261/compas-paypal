import type { Mandate, MandateStatus } from "../domain/mandate";
import type { MoneyAmount } from "../domain/money";

export interface MandateRepository {
  getById(id: string): Promise<Mandate | undefined>;
  /**
   * Writes the whole mandate. Use it to create one. It also writes the
   * remaining amount, so never use it to change the status of a mandate a
   * purchase may be reserving against: that is `transitionStatus`.
   */
  save(mandate: Mandate): Promise<void>;
  /**
   * Takes `amount` from the remaining authorized amount in one atomic step,
   * when the mandate is ACTIVE, in the same asset and has enough left.
   * Returns false otherwise. Capacity is permission, not money.
   */
  reserveCapacity(mandateId: string, amount: MoneyAmount): Promise<boolean>;
  /** Gives back a reservation whose outgoing payment was not created. Never above the budget. */
  releaseCapacity(mandateId: string, amount: MoneyAmount): Promise<void>;
  /**
   * Moves the mandate to `to` in one atomic step, only if its status is one
   * of `from`. It never writes the remaining amount, so it can't undo a
   * reservation made in between. Returns the updated mandate, or undefined
   * when the mandate is missing or was not in `from`.
   */
  transitionStatus(
    mandateId: string,
    from: readonly MandateStatus[],
    to: MandateStatus,
  ): Promise<Mandate | undefined>;
  /** Mandates that name the party as payer, newest first. */
  listByPayer(payerId: string): Promise<readonly Mandate[]>;
  /** Mandates that name the party as delegate, newest first. */
  listByDelegate(delegateId: string): Promise<readonly Mandate[]>;
}
