import type { MerchantTrustLevel } from "./merchant.ts";
import type { CompasCategory } from "./merchant-category.ts";
import type { MoneyAmount } from "./money.ts";
import type { PolicyOutcome, PolicyReason, PurposeCheck } from "./policy-decision.ts";

/**
 * One purchase attempt under a mandate, as the payer sees it: where the
 * delegate tried to spend, what the shop resolved to, what COMPAS decided and
 * what Open Payments did. Line-item descriptions are not kept, because they
 * can name a medicine. Categories are enough to show whether the shop matched.
 */
export type SpendingRecord = {
  /** The policy decision id. */
  id: string;
  mandateId: string;
  purchaseIntentId: string;
  merchantWalletAddressUrl: string;
  merchantDisplayName?: string;
  /** What the merchant asked for, in the merchant wallet's asset. */
  requestedAmount: MoneyAmount;
  /** What leaves the payer wallet, from the Open Payments quote. Absent when no quote was made. */
  debitAmount?: MoneyAmount;
  decision: { outcome: PolicyOutcome; reasons: readonly PolicyReason[] };
  purposeCheck?: PurposeCheck;
  /** The merchant's resolved categories at decision time. */
  merchantCategories: readonly { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  /** True when the payment went ahead only because the payer chose MONITORED. */
  monitoredException: boolean;
  openPayments: {
    incomingPaymentUrl?: string;
    quoteId?: string;
    outgoingPaymentUrl?: string;
    state?: "PENDING" | "COMPLETED" | "FAILED";
  };
  recordedAt: string;
};
