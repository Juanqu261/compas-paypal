/**
 * Shapes of the COMPAS mandate API, as documented in
 * `contracts/mandates/README.md`. The frontend never imports `backend/src`.
 * These are views: the backend owns every decision and every state change.
 */

export type Money = { value: string; assetCode: string; assetScale: number };

export const COMPAS_CATEGORIES = ["MEDICATION", "FOOD", "PERSONAL_CARE", "ALCOHOL", "TOBACCO"] as const;
export type CompasCategory = (typeof COMPAS_CATEGORIES)[number];

export const MANDATE_STATUSES = [
  "DRAFT",
  "PENDING_AUTHORIZATION",
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
  "REVOKED",
] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export type Enforcement = "ENFORCED" | "MONITORED";
/** CONTESTED is never acceptable as a minimum. */
export const CONFIDENCE_MINIMUMS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceMinimum = (typeof CONFIDENCE_MINIMUMS)[number];

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
] as const;
export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type PartyView = { id: string; displayName: string };

export type MandateAuthorizationView = {
  consent: "NOT_STARTED" | "WAITING_FOR_PAYER" | "GRANTED";
  grantCancellation?: "NOT_NEEDED" | "PENDING" | "DONE";
  lastError?: { operation: "AUTHORIZE" | "CANCEL"; code: string };
  canAuthorize: boolean;
  canRevoke: boolean;
};

export type MandateView = {
  id: string;
  status: MandateStatus;
  viewerRole: "PAYER" | "DELEGATE";
  payer: PartyView;
  delegate: PartyView;
  beneficiary: PartyView;
  budget: Money;
  /** Authorization capacity. Not money COMPAS holds. */
  remainingAuthorizedAmount: Money;
  purposePolicy: {
    eligibleCategories: readonly CompasCategory[];
    enforcement: Enforcement;
    merchantConfidence: { minimum: ConfidenceMinimum; maxDebitBelowHigh?: Money };
  };
  validFrom: string;
  expiresAt: string;
  createdAt: string;
  usable: boolean;
  /** Present for the payer only. */
  authorization?: MandateAuthorizationView;
};

export type ActivityKind = "COMPLETED" | "PENDING" | "FAILED" | "DENIED" | "REVIEW";

export type ActivityEntry = {
  id: string;
  recordedAt: string;
  kind: ActivityKind;
  merchantDisplayName?: string;
  requestedAmount: Money;
  debitAmount?: Money;
  monitoredException: boolean;
  purposeMatched?: boolean;
  reasonCodes: readonly PolicyReasonCode[];
};

export type MandateActivity = {
  mandateId: string;
  budget: Money;
  totals: {
    completed: Money;
    inProgress: Money;
    attempts: number;
    completedCount: number;
    inProgressCount: number;
    failedCount: number;
    deniedCount: number;
    reviewCount: number;
    monitoredExceptions: number;
    excludedOtherAsset: number;
    /** False when recorded debits are not yet reflected in the remaining capacity. */
    capacityReconciled: boolean;
  };
  entries: readonly ActivityEntry[];
};

export type SpendingResponse = {
  activity: MandateActivity;
  providerSpentAvailable: boolean;
  providerSpent?: Money;
};

export type PayerWallet =
  | { status: "RESOLVED"; assetCode: string; assetScale: number }
  | { status: "NOT_CONFIGURED" | "OPEN_PAYMENTS_NOT_CONFIGURED" | "UNAVAILABLE" };

export type MeResponse = {
  party: PartyView;
  payerWallet: PayerWallet;
  identity: "DEMO";
  persistence: "IN_MEMORY_DEMO";
  openPayments: "configured" | "not_configured";
};

export type ParticipantsResponse = { dataLabel: string; participants: readonly PartyView[] };

export type CreateMandateBody = {
  delegateId: string;
  beneficiaryId: string;
  categories: readonly CompasCategory[];
  budget: Money;
  validFrom: string;
  expiresAt: string;
  enforcement: Enforcement;
  monitoredAcknowledged?: boolean;
  merchantConfidence: { minimum: ConfidenceMinimum; maxDebitBelowHigh?: Money };
};

export type FieldError = { field: string; code: string; message: string };

export type AuthorizeResponse = { mandateId: string; redirectUrl: string; mandate: MandateView };

export type RevokeResponse = {
  mandate: MandateView;
  alreadyRevoked: boolean;
  grantCancellation: "NOT_NEEDED" | "PENDING" | "DONE";
};
