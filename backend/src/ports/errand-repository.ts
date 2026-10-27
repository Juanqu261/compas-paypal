import type { Errand, ErrandUsage } from "../domain/errand.ts";

export type ErrandReservation = {
  /** The decision (spending record) that holds it. */
  decisionId: string;
  errandId: string;
  usage: ErrandUsage;
  reservedAt: string;
};

/**
 * Errands, and what purchases hold against them. A reservation is made when a
 * purchase is allowed and released wherever its capacity is released, so an
 * order the payer cancels gives its units back.
 */
export interface ErrandRepository {
  create(errand: Errand): Promise<void>;
  get(id: string): Promise<Errand | undefined>;
  listByMandate(mandateId: string): Promise<readonly Errand[]>;
  /** Conditional: only an ACTIVE errand is cancelled. */
  cancel(id: string): Promise<Errand | undefined>;
  /** Live (unreleased) usage reserved at or after `since`. */
  usage(errandId: string, since: Date): Promise<ErrandUsage | undefined>;
  /**
   * Atomic: reserves only if the live usage since `since` plus this one stays
   * within every item's maxUnits and the errand's maxAmount. False otherwise.
   */
  reserve(reservation: ErrandReservation, since: Date): Promise<boolean>;
  /** Releases the decision's reservation, if any. Idempotent. */
  release(decisionId: string): Promise<void>;
}
