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
  "ERRAND_MISMATCH",
] as const;
export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export type PartyView = { id: string; displayName: string };

/** GRANTED: the payer confirmed the budget. Each purchase still needs their approval at PayPal. */
export type MandateAuthorizationView = {
  consent: "NOT_STARTED" | "GRANTED";
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

/** Where the PayPal side of an allowed purchase stands. Only COMPLETED means the merchant was paid. */
export type PaymentState = "AWAITING_PAYER_APPROVAL" | "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";

export type ActivityKind = "COMPLETED" | "PENDING" | "AWAITING_APPROVAL" | "CANCELLED" | "FAILED" | "DENIED" | "REVIEW";

export type PaymentFailureCode =
  | "MANDATE_NOT_USABLE"
  | "ORDER_MISMATCH"
  | "PAYER_ACCOUNT_MISMATCH"
  | "CAPTURE_DECLINED"
  | "ORDER_EXPIRED";

export type ActivityEntry = {
  id: string;
  recordedAt: string;
  kind: ActivityKind;
  merchantDisplayName?: string;
  /** What the merchant charged. An allowed purchase's PayPal order is for exactly this. */
  requestedAmount: Money;
  monitoredException: boolean;
  purposeMatched?: boolean;
  reasonCodes: readonly PolicyReasonCode[];
  /** Why a FAILED attempt was not paid. */
  failureCode?: PaymentFailureCode;
  /** The payer's view only: where to approve this order at PayPal, while it waits. */
  approvalUrl?: string;
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
    awaitingApprovalCount: number;
    cancelledCount: number;
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

export type SpendingResponse = { activity: MandateActivity };

export type MeResponse = {
  party: PartyView;
  identity: "DEMO";
  /** IN_MEMORY_DEMO: a backend restart loses every budget. POSTGRES: kept in the database. */
  persistence: "IN_MEMORY_DEMO" | "POSTGRES";
  /** COMPAS only ever talks to the PayPal sandbox. */
  paypal: "sandbox" | "not_configured";
  /** PINNED: only the payer's own PayPal account can approve an order COMPAS captures. */
  payerApproval: "PINNED" | "ANY_ACCOUNT";
  /** Whether this demo session may create PayPal orders through POST /purchases. */
  purchases: "enabled" | "disabled_for_demo" | "not_configured";
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

/** Authorizing activates the budget at once: nothing is asked of PayPal until a purchase. */
export type AuthorizeResponse = { mandateId: string; mandate: MandateView };

export type RevokeResponse = { mandate: MandateView; alreadyRevoked: boolean };

// ---------------------------------------------------------------------------
// Purchases (`contracts/purchases/README.md`) and merchant categories
// (`contracts/merchant-categories/README.md`). Views only: the backend decides.
// ---------------------------------------------------------------------------

export type PolicyOutcome = "ALLOW" | "DENY" | "REVIEW";
export type TrustLevel = "SELF_DECLARED" | "PROVIDER_VERIFIED" | "EXTERNAL_VERIFIED";
export type Corroboration = "CONTRADICTED" | "UNCORROBORATED" | "REGISTRY_UNBOUND" | "PROVIDER_VERIFIED" | "EXTERNAL_VERIFIED";

/** A charge as the delegate sends it. Categories and amounts only, never product names. */
export type PurchaseBody = {
  mandateId: string;
  /** An id from the backend's merchant directory. The PayPal payee never comes from the browser. */
  merchantId: string;
  amount: Money;
  lineItems: readonly { category?: CompasCategory; amount: Money }[];
  /** Required by POST /purchases. One per attempt: a retry with the same key never pays twice. */
  idempotencyKey?: string;
};

export type PurposeCheckView = {
  outcome: PolicyOutcome;
  reasonCodes: readonly PolicyReasonCode[];
  matchedCategories: readonly CompasCategory[];
  enforced: boolean;
  merchantConfidence?: string;
};

/** Every check before PayPal. Not a decision and not a payment. */
export type PurchasePreview = {
  mandateId: string;
  merchant: { id: string; displayName: string };
  requestedAmount: Money;
  mandateRules: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  budget?: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  purposeCheck?: PurposeCheckView;
  merchantCategories: readonly { category: CompasCategory; trustLevel: TrustLevel }[];
  /** ORDER: COMPAS would allow it and create a PayPal order for the payer to approve. */
  next: "STOP_DENY" | "STOP_REVIEW" | "ORDER";
  execution: "ENABLED" | "PURCHASES_DISABLED_FOR_DEMO" | "PAYPAL_NOT_CONFIGURED";
};

/** One recorded purchase attempt. ALLOW is a decision; `payment` says what PayPal did. */
export type PurchaseView = {
  decisionId: string;
  mandateId: string;
  merchant: { id: string; displayName: string };
  outcome: PolicyOutcome;
  reasonCodes: readonly PolicyReasonCode[];
  purposeCheck?: PurposeCheckView;
  monitoredException: boolean;
  requestedAmount: Money;
  payment: { status: "NOT_CREATED" } | { status: "CREATED"; state: PaymentState };
  recordedAt: string;
};

export type PurchaseResponse = { purchase: PurchaseView; replayed: boolean };

export type MerchantCategoriesView = {
  categories: readonly { category: CompasCategory; trustLevel: TrustLevel; sourceIds: readonly string[]; simulated: boolean }[];
  declarations: readonly { category: CompasCategory; corroboration: Corroboration }[];
  conflicts: readonly { categories: readonly CompasCategory[] }[];
  flaggedCategories: readonly CompasCategory[];
  resolvedAt: string;
};

export type DemoMerchant = MerchantCategoriesView & { id: string; displayName: string };

export type DemoMerchantsResponse = {
  dataLabel: string;
  /** NONE_REGISTERED: COMPAS ignores every trust-log entry, so no merchant has a category. */
  categorySources: "REGISTERED" | "NONE_REGISTERED";
  merchants: readonly DemoMerchant[];
};
