import type { PurposeEnforcement } from "./mandate.ts";
import type { CompasCategory } from "./merchant-category.ts";

/**
 * What COMPAS saw happen at a merchant. Observations are COMPAS's own events,
 * kept apart from the trust log so history never looks like an attestation.
 * Line-item descriptions, product names and amounts are never stored: a line
 * can name a medicine. Parties appear only as HMAC refs.
 */

export const PURCHASE_VERDICTS = ["MATCH", "MISMATCH"] as const;
export type PurchaseVerdict = (typeof PURCHASE_VERDICTS)[number];

/** PayPal captured an order at the merchant, or accepted its capture as pending. */
export type PaidObservation = {
  type: "PAID";
  /** `${spendingRecordId}:paid` */
  id: string;
  spendingRecordId: string;
  paypalMerchantId: string;
  payerRef: string;
  delegateRef: string;
  /** The mandate's eligible categories: what the purchase was for. */
  mandateCategories: readonly CompasCategory[];
  /** Distinct COMPAS categories on the merchant's line items. Merchant-supplied, so weak. */
  lineCategories: readonly CompasCategory[];
  /** A line with no category, or one that is not a COMPAS category. */
  hasUncategorizedLines: boolean;
  enforcement: PurposeEnforcement;
  paymentState: "PENDING" | "COMPLETED";
  observedAt: string;
};

/** The payer said whether a paid purchase fit the purpose. One per purchase. */
export type VerdictObservation = {
  type: "PAYER_VERDICT";
  /** `${spendingRecordId}:verdict` */
  id: string;
  spendingRecordId: string;
  paypalMerchantId: string;
  payerRef: string;
  verdict: PurchaseVerdict;
  observedAt: string;
};

export type MerchantObservation = PaidObservation | VerdictObservation;

/**
 * History of one merchant for one category, over a window ending at `asOf`.
 * The policy reads only this. It is stored on the decision, so an audit can
 * replay the confidence without the observation log.
 */
export type MerchantHistorySummary = {
  paypalMerchantId: string;
  category: CompasCategory;
  windowStart: string;
  asOf: string;
  /** Paid purchases in the window under a mandate for this category. */
  paidPurchases: number;
  /** Distinct payers who confirmed such a purchase, with no line incompatible with the category. */
  confirmingPayers: number;
  /** When the earliest confirmed purchase was paid. */
  firstConfirmedAt?: string;
  /** Paid purchases the payer reported as a mismatch, or with a line incompatible with the category. */
  contradictions: number;
  contradictingPayers: number;
  /** The trust matrix whose window and incompatibility table built this summary. */
  matrixVersion: string;
};
