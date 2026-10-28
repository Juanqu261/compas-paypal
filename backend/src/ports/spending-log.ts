import type { PaymentFailureCode, PaymentState, SpendingRecord } from "../domain/spending.ts";

/**
 * Every purchase attempt under a mandate, allowed or not, for the payer's
 * spending view. A record is never removed. Only its PayPal fields change:
 * the order once it exists, then the payment state as the payer and PayPal act.
 */
export interface SpendingLog {
  append(record: SpendingRecord): Promise<void>;
  /** Fills in the PayPal order of an allowed attempt. Refuses a record that already names another order. */
  recordOrder(
    recordId: string,
    order: { orderId: string; approvalUrl?: string; state: PaymentState },
  ): Promise<SpendingRecord>;
  /**
   * Moves the payment state in one atomic step, only if it is one of `from`.
   * Returns the updated record, or undefined when the record's state was not
   * in `from`. Only the caller that wins the move may release capacity or
   * record history, so a payer's double return can't do either twice.
   */
  transitionPayment(
    recordId: string,
    from: readonly PaymentState[],
    to: { state: PaymentState; captureId?: string; failureCode?: PaymentFailureCode },
  ): Promise<SpendingRecord | undefined>;
  findByPayPalOrderId(orderId: string): Promise<SpendingRecord | undefined>;
  listByMandate(mandateId: string): Promise<readonly SpendingRecord[]>;
  /** The merchant's attempts that reached PayPal (an order exists), newest first, at most `limit`. */
  listOrdersByMerchant(paypalMerchantId: string, limit: number): Promise<readonly SpendingRecord[]>;
}
