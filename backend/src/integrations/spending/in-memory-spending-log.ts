import type { SpendingRecord } from "../../domain/spending.ts";
import type { SpendingLog } from "../../ports/spending-log.ts";

/** MVP spending log. A restart loses it, like the grant store and the trust log. */
export class InMemorySpendingLog implements SpendingLog {
  readonly #records = new Map<string, SpendingRecord>();

  async append(record: SpendingRecord): Promise<void> {
    if (this.#records.has(record.id)) {
      throw new Error(`Spending record already exists: ${record.id}`);
    }
    this.#records.set(record.id, structuredClone(record));
  }

  async recordPayment(
    recordId: string,
    payment: { outgoingPaymentUrl: string; state: "PENDING" | "COMPLETED" | "FAILED" },
  ): Promise<SpendingRecord> {
    const record = this.#records.get(recordId);
    if (!record) throw new Error(`No spending record ${recordId}`);
    if (record.openPayments.outgoingPaymentUrl && record.openPayments.outgoingPaymentUrl !== payment.outgoingPaymentUrl) {
      throw new Error(`Spending record ${recordId} already has a different outgoing payment`);
    }
    const updated: SpendingRecord = {
      ...record,
      openPayments: { ...record.openPayments, ...payment },
    };
    this.#records.set(recordId, updated);
    return structuredClone(updated);
  }

  async listByMandate(mandateId: string): Promise<readonly SpendingRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.mandateId === mandateId)
      .map((record) => structuredClone(record));
  }
}
