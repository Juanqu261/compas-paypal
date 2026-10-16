export const POLICY_OUTCOMES = ["ALLOW", "DENY", "REVIEW"] as const;

export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number];

export const POLICY_REASON_CODES = [
  "MANDATE_INACTIVE",
  "MANDATE_EXPIRED",
  "BUDGET_EXCEEDED",
  "PURPOSE_MISMATCH",
  "MERCHANT_NOT_ELIGIBLE",
  "CLASSIFICATION_UNCERTAIN",
] as const;

export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type PolicyReason = {
  code: PolicyReasonCode;
  message: string;
};

export type PolicyDecision = {
  id: string;
  outcome: PolicyOutcome;
  reasons: readonly PolicyReason[];
  mandateId: string;
  purchaseIntentId: string;
  evaluatedAt: string;
};
