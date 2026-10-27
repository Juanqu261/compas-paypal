import type { Beneficiary, Delegate, Payer } from "./party";
import type { MoneyAmount } from "./money";
import type { CompasCategory } from "./merchant-category";
import type { AcceptableConfidence } from "./trust-matrix";

export const MANDATE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/**
 * ENFORCED: a purchase that fails the purpose checks is not paid.
 * MONITORED: the payer ticked "allow even if not fully approved".
 */
export const PURPOSE_ENFORCEMENT_MODES = ["ENFORCED", "MONITORED"] as const;

export type PurposeEnforcement = (typeof PURPOSE_ENFORCEMENT_MODES)[number];

/** Which merchants this mandate trusts, by the trust matrix's confidence. */
export type MerchantConfidencePolicy = {
  /**
   * Lowest confidence that passes the merchant step. HIGH needs an independent
   * attester (wallet KYB, or a registry through a verified binding). LOW or
   * MEDIUM also lets in shops backed by their own declaration and history.
   */
  minimum: AcceptableConfidence;
  maxDebitBelowHigh?: MoneyAmount;
};

export type PurposePolicy = {
  id: string;
  allowedPurposes: readonly string[];
  eligibleCategories: readonly CompasCategory[];
  merchantConfidence: MerchantConfidencePolicy;
  enforcement: PurposeEnforcement;
};

export type Mandate = {
  id: string;
  payer: Payer;
  delegate: Delegate;
  beneficiary: Beneficiary;
  budget: MoneyAmount;
  remainingAuthorizedAmount: MoneyAmount;
  purposePolicy: PurposePolicy;
  status: MandateStatus;
  validFrom: string;
  expiresAt: string;
  createdAt: string;
};
