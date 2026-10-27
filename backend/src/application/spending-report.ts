import type { Mandate, PurposeEnforcement } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { SpendingLog } from "../ports/spending-log.ts";

export type SpendingReport = {
  mandateId: string;
  enforcement: PurposeEnforcement;
  budget: MoneyAmount;
  totals: {
    /** Sum of the charges PayPal captured, or accepted for capture. */
    paid: MoneyAmount;
    attempts: number;
    paidCount: number;
    /** Attempts that produced no payment: denied, held for review, waiting for the payer, cancelled or failed. */
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
  const paidRecords = records.filter(
    (record) => record.paypal.state === "COMPLETED" || record.paypal.state === "PENDING",
  );

  let paid = 0n;
  for (const record of paidRecords) {
    const charge = record.requestedAmount;
    if (charge.assetCode === mandate.budget.assetCode && charge.assetScale === mandate.budget.assetScale) {
      paid += BigInt(charge.value);
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
