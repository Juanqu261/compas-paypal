import type { Mandate } from "../domain/mandate.ts";
import type { CompasCategory } from "../domain/merchant-category.ts";
import type { PaidObservation } from "../domain/merchant-history.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { TrustMatrix } from "../domain/trust-matrix.ts";
import type { MerchantObservationLog } from "../ports/merchant-observation-log.ts";
import type { MerchantHistoryInput } from "../policy/merchant-category-evidence.ts";
import { historyWindowStart, summarizeMerchantHistory } from "../policy/merchant-history.ts";

export type MerchantHistoryDeps = {
  observations: MerchantObservationLog;
  matrix: TrustMatrix;
  /** HMAC of a payer or delegate id. The log never holds a party id. */
  partyRef: (partyId: string) => string;
};

/** Summaries for the categories the merchant step needs, at decision time. */
export async function loadMerchantHistory(
  paypalMerchantId: string,
  categories: readonly CompasCategory[],
  asOf: Date,
  deps: Pick<MerchantHistoryDeps, "observations" | "matrix">,
): Promise<MerchantHistoryInput> {
  const observations =
    categories.length === 0
      ? []
      : await deps.observations.listByMerchant(paypalMerchantId, historyWindowStart(asOf, deps.matrix));
  return {
    matrix: deps.matrix,
    summaries: categories.map((category) =>
      summarizeMerchantHistory({ observations, paypalMerchantId, category, asOf, matrix: deps.matrix }),
    ),
  };
}

/**
 * Records a purchase PayPal captured, or accepted for capture. Only
 * categories are kept, never line descriptions or amounts. An order that was
 * never captured is not history.
 */
export async function recordPaidPurchase(
  input: {
    record: Pick<SpendingRecord, "id" | "paypalMerchantId" | "lineCategories" | "hasUncategorizedLines">;
    mandate: Mandate;
    paymentState: PaidObservation["paymentState"];
    observedAt: Date;
  },
  deps: Pick<MerchantHistoryDeps, "observations" | "partyRef">,
): Promise<PaidObservation> {
  const { record } = input;
  const observation: PaidObservation = {
    type: "PAID",
    id: `${record.id}:paid`,
    spendingRecordId: record.id,
    paypalMerchantId: record.paypalMerchantId,
    payerRef: deps.partyRef(input.mandate.payer.id),
    delegateRef: deps.partyRef(input.mandate.delegate.id),
    mandateCategories: input.mandate.purposePolicy.eligibleCategories,
    lineCategories: record.lineCategories,
    hasUncategorizedLines: record.hasUncategorizedLines,
    enforcement: input.mandate.purposePolicy.enforcement,
    paymentState: input.paymentState,
    observedAt: input.observedAt.toISOString(),
  };
  await deps.observations.append(observation);
  return observation;
}
