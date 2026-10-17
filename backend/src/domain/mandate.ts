import type { Beneficiary, Delegate, Payer } from "./party";
import type { MoneyAmount } from "./money";
import type { CompasCategory } from "./merchant-category";
import type { AcceptableConfidence } from "./trust-matrix";

export const MANDATE_STATUSES = [
  "DRAFT",
  "PENDING_AUTHORIZATION",
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/**
 * ENFORCED: a purchase that fails the purpose checks is not paid.
 * MONITORED: the payer ticked "allow even if not fully approved". Purpose
 * checks are still run and recorded for the payer's spending view, but they
 * do not stop the payment. Mandate rules (status, validity, delegate, budget)
 * and the Open Payments grant cap apply in both modes.
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
  /**
   * Optional per-purchase cap on the quoted debit, in the payer wallet's asset,
   * for a merchant that passed below HIGH. Over it, or in another asset: REVIEW.
   */
  maxDebitBelowHigh?: MoneyAmount;
};

/** COMPAS purpose policy. MEDICATION is not an Open Payments scope. */
export type PurposePolicy = {
  id: string;
  allowedPurposes: readonly string[];
  eligibleCategories: readonly CompasCategory[];
  merchantConfidence: MerchantConfidencePolicy;
  /** Set by the payer when the mandate is created. */
  enforcement: PurposeEnforcement;
};

export type Mandate = {
  id: string;
  payer: Payer;
  delegate: Delegate;
  beneficiary: Beneficiary;
  budget: MoneyAmount;
  /**
   * Remaining authorization capacity.
   * This is not a wallet balance and not funds transferred to the delegate.
   */
  remainingAuthorizedAmount: MoneyAmount;
  purposePolicy: PurposePolicy;
  status: MandateStatus;
  validFrom: string;
  expiresAt: string;
  createdAt: string;
};
