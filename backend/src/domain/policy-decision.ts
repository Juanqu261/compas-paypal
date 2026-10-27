import type { CompasCategory } from "./merchant-category.ts";
import type { MerchantConfidenceRecord } from "./trust-matrix.ts";

export const POLICY_OUTCOMES = ["ALLOW", "DENY", "REVIEW"] as const;

export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number];

export const POLICY_REASON_CODES = [
  "MANDATE_INACTIVE",
  "MANDATE_EXPIRED",
  "BUDGET_EXCEEDED",
  "PURPOSE_MISMATCH",
  "MERCHANT_NOT_ELIGIBLE",
  "CLASSIFICATION_UNCERTAIN",
  "MERCHANT_EVIDENCE_INSUFFICIENT",
  "MERCHANT_EVIDENCE_CONFLICT",
  "MERCHANT_HISTORY_CONTRADICTS",
  "MERCHANT_CONFIDENCE_LIMIT_EXCEEDED",
  "DELEGATE_NOT_AUTHORIZED",
  "PAYER_MONITORED_EXCEPTION",
  /** The cart does not fit the errand the delegate confirmed. A hold: REVIEW even under MONITORED. */
  "ERRAND_MISMATCH",
] as const;

export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type PolicyReason = {
  code: PolicyReasonCode;
  message: string;
};

/**
 * What the purpose checks alone concluded: merchant category plus line items.
 * Kept on every decision that reached them, so the payer can see whether the
 * shop matched, even when the payment went ahead in MONITORED mode.
 */
export type PurposeCheck = {
  outcome: PolicyOutcome;
  reasons: readonly PolicyReason[];
  /** Eligible categories the merchant declared and holds at the mandate's minimum confidence or above. */
  matchedCategories: readonly CompasCategory[];
  /** The best eligible declared category's confidence. Absent when the merchant declared none. */
  merchantConfidence?: MerchantConfidenceRecord;
  /** False when the payer chose MONITORED and the result did not decide the payment. */
  enforced: boolean;
};

export type PolicyDecision = {
  id: string;
  outcome: PolicyOutcome;
  reasons: readonly PolicyReason[];
  /** Absent when a mandate rule stopped evaluation before the purpose checks. */
  purposeCheck?: PurposeCheck;
  mandateId: string;
  purchaseIntentId: string;
  evaluatedAt: string;
};
