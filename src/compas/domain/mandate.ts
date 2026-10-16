import type { Beneficiary, Delegate, Payer } from "./party";
import type { MoneyAmount } from "./money";

export const MANDATE_STATUSES = [
  "DRAFT",
  "PENDING_AUTHORIZATION",
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/** COMPAS purpose policy. MEDICATION is not an Open Payments scope. */
export type PurposePolicy = {
  id: string;
  allowedPurposes: readonly string[];
  eligibleCategories: readonly string[];
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
