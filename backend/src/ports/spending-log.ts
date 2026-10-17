import type { SpendingRecord } from "../domain/spending.ts";

/**
 * Every purchase attempt under a mandate, allowed or not, for the payer's
 * spending view. A record is never removed. Only its Open Payments payment
 * reference is filled in once the outgoing payment exists.
 */
export interface SpendingLog {
  append(record: SpendingRecord): Promise<void>;
  recordPayment(
    recordId: string,
    payment: { outgoingPaymentUrl: string; state: "PENDING" | "COMPLETED" | "FAILED" },
  ): Promise<SpendingRecord>;
  listByMandate(mandateId: string): Promise<readonly SpendingRecord[]>;
}
