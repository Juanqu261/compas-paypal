import type { CompasCategory } from "../domain/merchant-category.ts";
import type {
  MerchantHistorySummary,
  MerchantObservation,
  PaidObservation,
  VerdictObservation,
} from "../domain/merchant-history.ts";
import type { HistoryGrade, HistoryThreshold, TrustMatrix } from "../domain/trust-matrix.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window is (asOf - windowDays, asOf]. */
export function historyWindowStart(asOf: Date, matrix: TrustMatrix): Date {
  return new Date(asOf.getTime() - matrix.history.windowDays * DAY_MS);
}

/**
 * Pure: the same observations, category, time and matrix give the same summary.
 *
 * Only payer confirmations raise history. The merchant's own line labels can
 * only contradict it: a shop can label beer MEDICATION, but it cannot hide a
 * line it labeled ALCOHOL. Counting is by distinct payer, never by volume.
 */
export function summarizeMerchantHistory(input: {
  observations: readonly MerchantObservation[];
  paypalMerchantId: string;
  category: CompasCategory;
  asOf: Date;
  matrix: TrustMatrix;
}): MerchantHistorySummary {
  const { paypalMerchantId, category, asOf, matrix } = input;
  const start = historyWindowStart(asOf, matrix).getTime();
  const end = asOf.getTime();
  const incompatible = new Set(matrix.incompatible[category] ?? []);

  const atMerchant = input.observations.filter(
    (observation) =>
      observation.paypalMerchantId === paypalMerchantId && Date.parse(observation.observedAt) <= end,
  );
  const verdicts = new Map<string, VerdictObservation>();
  for (const observation of atMerchant) {
    if (observation.type === "PAYER_VERDICT") verdicts.set(observation.spendingRecordId, observation);
  }
  const paid = atMerchant.filter(
    (observation): observation is PaidObservation =>
      observation.type === "PAID" &&
      Date.parse(observation.observedAt) > start &&
      observation.mandateCategories.includes(category),
  );

  const confirmingPayers = new Set<string>();
  const contradictingPayers = new Set<string>();
  let contradictions = 0;
  let firstConfirmedAt: string | undefined;

  for (const purchase of paid) {
    // A verdict from anyone but the purchase's payer is ignored.
    const verdict = verdicts.get(purchase.spendingRecordId);
    const payerVerdict = verdict?.payerRef === purchase.payerRef ? verdict.verdict : undefined;
    const incompatibleLine = purchase.lineCategories.some((line) => incompatible.has(line));

    if (payerVerdict === "MISMATCH" || incompatibleLine) {
      contradictions += 1;
      contradictingPayers.add(purchase.payerRef);
    } else if (payerVerdict === "MATCH") {
      confirmingPayers.add(purchase.payerRef);
      if (!firstConfirmedAt || purchase.observedAt < firstConfirmedAt) firstConfirmedAt = purchase.observedAt;
    }
  }

  return {
    paypalMerchantId,
    category,
    windowStart: new Date(start).toISOString(),
    asOf: asOf.toISOString(),
    paidPurchases: paid.length,
    confirmingPayers: confirmingPayers.size,
    ...(firstConfirmedAt ? { firstConfirmedAt } : {}),
    contradictions,
    contradictingPayers: contradictingPayers.size,
    matrixVersion: matrix.version,
  };
}

function meets(summary: MerchantHistorySummary, threshold: HistoryThreshold): boolean {
  if (!summary.firstConfirmedAt || summary.confirmingPayers < threshold.minConfirmingPayers) return false;
  const spanDays = Math.floor((Date.parse(summary.asOf) - Date.parse(summary.firstConfirmedAt)) / DAY_MS);
  return spanDays >= threshold.minSpanDays;
}

/**
 * Rows top to bottom. Integers only: the contradiction ratio is compared by
 * cross-multiplying, never as a float.
 */
export function gradeMerchantHistory(summary: MerchantHistorySummary, matrix: TrustMatrix): HistoryGrade {
  if (summary.matrixVersion !== matrix.version) {
    throw new Error(`History summary built with matrix ${summary.matrixVersion}, graded with ${matrix.version}.`);
  }
  const { contradicted, established, emerging } = matrix.history;
  if (
    summary.contradictingPayers >= contradicted.minPayers &&
    summary.contradictions * contradicted.ratioDenominator >= summary.paidPurchases * contradicted.ratioNumerator
  ) {
    return "CONTRADICTED";
  }
  if (meets(summary, established)) return "ESTABLISHED";
  if (meets(summary, emerging)) return "EMERGING";
  return "NONE";
}
