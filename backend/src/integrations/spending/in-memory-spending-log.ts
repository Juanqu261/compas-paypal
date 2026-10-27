import type { PaymentFailureCode, PaymentState, SpendingRecord } from "../../domain/spending.ts";
import type { SpendingLog } from "../../ports/spending-log.ts";

/** MVP spending log. A restart loses it, like the trust log and the observation log. */
export class InMemorySpendingLog implements SpendingLog {
  readonly #records = new Map<string, SpendingRecord>();

  async append(record: SpendingRecord): Promise<void> {
    if (this.#records.has(record.id)) {
      throw new Error(`Spending record already exists: ${record.id}`);
    }
    this.#records.set(record.id, structuredClone(record));
  }

  async recordOrder(
    recordId: string,
    order: { orderId: string; approvalUrl?: string; state: PaymentState },
  ): Promise<SpendingRecord> {
    const record = this.#records.get(recordId);
    if (!record) throw new Error(`No spending record ${recordId}`);
    if (record.decision.outcome !== "ALLOW") throw new Error(`Spending record ${recordId} is not an ALLOW`);
    if (record.paypal.orderId && record.paypal.orderId !== order.orderId) {
      throw new Error(`Spending record ${recordId} already has a different PayPal order`);
    }
    const updated: SpendingRecord = { ...record, paypal: { ...record.paypal, ...order } };
    this.#records.set(recordId, updated);
    return structuredClone(updated);
  }

  async transitionPayment(
    recordId: string,
    from: readonly PaymentState[],
    to: { state: PaymentState; captureId?: string; failureCode?: PaymentFailureCode },
  ): Promise<SpendingRecord | undefined> {
    const record = this.#records.get(recordId);
    if (!record?.paypal.orderId || !record.paypal.state || !from.includes(record.paypal.state)) return undefined;
    const updated: SpendingRecord = { ...record, paypal: { ...record.paypal, ...to } };
    this.#records.set(recordId, updated);
    return structuredClone(updated);
  }

  async findByPayPalOrderId(orderId: string): Promise<SpendingRecord | undefined> {
    const record = [...this.#records.values()].find((candidate) => candidate.paypal.orderId === orderId);
    return record && structuredClone(record);
  }

  async listByMandate(mandateId: string): Promise<readonly SpendingRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.mandateId === mandateId)
      .map((record) => structuredClone(record));
  }
}
