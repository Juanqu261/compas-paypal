import type { MerchantTrustLevel } from "./merchant.ts";
import type { CompasCategory } from "./merchant-category.ts";
import type { MoneyAmount } from "./money.ts";
import type { PolicyOutcome, PolicyReason, PurposeCheck } from "./policy-decision.ts";


export const PAYMENT_STATES = ["AWAITING_PAYER_APPROVAL", "PENDING", "COMPLETED", "CANCELLED", "FAILED"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Why COMPAS did not, or PayPal could not, capture an order. No money moved in any of them. */
export const PAYMENT_FAILURE_CODES = [
  "MANDATE_NOT_USABLE",
  "ORDER_MISMATCH",
  "PAYER_ACCOUNT_MISMATCH",
  "CAPTURE_DECLINED",
  "ORDER_EXPIRED",
] as const;
export type PaymentFailureCode = (typeof PAYMENT_FAILURE_CODES)[number];

/**
 * One purchase attempt under a mandate, as the payer sees it: where the
 * delegate tried to spend, what the shop resolved to, what COMPAS decided and
 * what PayPal did. Line-item descriptions are not kept, because they can name
 * a medicine. Categories are enough to show whether the shop matched.
 */
export type SpendingRecord = {
  id: string;
  mandateId: string;
  purchaseIntentId: string;
  paypalMerchantId: string;
  /** The PayPal account the order pays, when it is not `paypalMerchantId` (see PurchaseIntent). */
  payeeMerchantId?: string;
  merchantDisplayName?: string;
  requestedAmount: MoneyAmount;
  decision: { outcome: PolicyOutcome; reasons: readonly PolicyReason[] };
  purposeCheck?: PurposeCheck;
  /** The merchant's resolved categories at decision time. */
  merchantCategories: readonly { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  /**
   * Distinct COMPAS categories on the cart's lines, and whether a line had
   * none. Kept so the paid purchase can join the merchant's history when the
   * payer approves it later. Never a description.
   */
  lineCategories: readonly CompasCategory[];
  hasUncategorizedLines: boolean;
  /** True when the payment went ahead only because the payer chose MONITORED. */
  monitoredException: boolean;
  paypal: {
    orderId?: string;
    /** Where the payer approves this exact order at PayPal. Shown to the payer only. */
    approvalUrl?: string;
    captureId?: string;
    state?: PaymentState;
    failureCode?: PaymentFailureCode;
  };
  recordedAt: string;
};
