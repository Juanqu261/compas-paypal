import type { Mandate, PurposeEnforcement } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { SpendingLog } from "../ports/spending-log.ts";

export type SpendingReport = {
  mandateId: string;
  enforcement: PurposeEnforcement;
  budget: MoneyAmount;
  totals: {
    /** Sum of quoted debits for purchases that produced an outgoing payment. */
    paid: MoneyAmount;
    attempts: number;
    paidCount: number;
    /** Attempts that produced no payment: denied, held for review, or failed before paying. */
    notPaidCount: number;
    /** Paid only because the payer chose MONITORED. */
    monitoredExceptions: number;
    /** Paid purchases whose shop did not resolve to an eligible category at an accepted level. */
    paidOutsidePurpose: number;
  };
  /** Newest first. */
  entries: readonly SpendingRecord[];
};

/** The payer's view: where the budget went and whether each shop matched the purpose. */
export async function buildSpendingReport(
  mandate: Mandate,
  spending: Pick<SpendingLog, "listByMandate">,
): Promise<SpendingReport> {
  const records = await spending.listByMandate(mandate.id);
  const paidRecords = records.filter((record) => record.openPayments.outgoingPaymentUrl);

  let paid = 0n;
  for (const record of paidRecords) {
    const debit = record.debitAmount;
    if (
      debit &&
      debit.assetCode === mandate.budget.assetCode &&
      debit.assetScale === mandate.budget.assetScale
    ) {
      paid += BigInt(debit.value);
    }
  }

  return {
    mandateId: mandate.id,
    enforcement: mandate.purposePolicy.enforcement,
    budget: mandate.budget,
    totals: {
      paid: { ...mandate.budget, value: paid.toString() },
      attempts: records.length,
      paidCount: paidRecords.length,
      notPaidCount: records.length - paidRecords.length,
      monitoredExceptions: paidRecords.filter((record) => record.monitoredException).length,
      paidOutsidePurpose: paidRecords.filter((record) => record.purposeCheck?.outcome !== "ALLOW").length,
    },
    entries: [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  };
}
