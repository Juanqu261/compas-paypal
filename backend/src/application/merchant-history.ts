import type { Mandate } from "../domain/mandate.ts";
import { type CompasCategory, isCompasCategory } from "../domain/merchant-category.ts";
import type { PaidObservation } from "../domain/merchant-history.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import type { TrustMatrix } from "../domain/trust-matrix.ts";
import type { PaymentState } from "../ports/open-payments-gateway.ts";
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
  walletAddressUrl: string,
  categories: readonly CompasCategory[],
  asOf: Date,
  deps: Pick<MerchantHistoryDeps, "observations" | "matrix">,
): Promise<MerchantHistoryInput> {
  const observations =
    categories.length === 0
      ? []
      : await deps.observations.listByMerchant(walletAddressUrl, historyWindowStart(asOf, deps.matrix));
  return {
    matrix: deps.matrix,
    summaries: categories.map((category) =>
      summarizeMerchantHistory({ observations, walletAddressUrl, category, asOf, matrix: deps.matrix }),
    ),
  };
}

/**
 * Records a purchase that produced an outgoing payment. Only categories are
 * kept, never line descriptions or amounts. A failed payment is not history.
 */
export async function recordPaidPurchase(
  input: {
    spendingRecordId: string;
    mandate: Mandate;
    intent: PurchaseIntent;
    merchantWalletAddressUrl: string;
    paymentState: PaymentState;
    observedAt: Date;
  },
  deps: Pick<MerchantHistoryDeps, "observations" | "partyRef">,
): Promise<PaidObservation | undefined> {
  if (input.paymentState === "FAILED") return undefined;
  const lineCategories = new Set<CompasCategory>();
  let hasUncategorizedLines = false;
  for (const line of input.intent.lineItems) {
    if (isCompasCategory(line.category)) lineCategories.add(line.category);
    else hasUncategorizedLines = true;
  }

  const observation: PaidObservation = {
    type: "PAID",
    id: `${input.spendingRecordId}:paid`,
    spendingRecordId: input.spendingRecordId,
    merchantWalletAddressUrl: input.merchantWalletAddressUrl,
    payerRef: deps.partyRef(input.mandate.payer.id),
    delegateRef: deps.partyRef(input.mandate.delegate.id),
    mandateCategories: input.mandate.purposePolicy.eligibleCategories,
    lineCategories: [...lineCategories],
    hasUncategorizedLines,
    enforcement: input.mandate.purposePolicy.enforcement,
    paymentState: input.paymentState,
    observedAt: input.observedAt.toISOString(),
  };
  await deps.observations.append(observation);
  return observation;
}
