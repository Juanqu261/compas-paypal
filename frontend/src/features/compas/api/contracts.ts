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
  execution: "ENABLED" | PurchaseExecutionBlock;
};

/** Why this demo can't create PayPal orders. SANDBOX_ACCOUNTS_REQUIRED: no sandbox accounts chosen yet. */
export type PurchaseExecutionBlock =
  | "PURCHASES_DISABLED_FOR_DEMO"
  | "PAYPAL_NOT_CONFIGURED"
  | "SANDBOX_ACCOUNTS_REQUIRED"
  /** This demo created as many PayPal orders, budgets or errands as one demo may. */
  | "DEMO_LIMIT_REACHED";

/**
 * demo/test data: the PayPal sandbox accounts this browser's demo pays with.
 * Account IDs only, kept in the backend's memory for this demo and nowhere
 * else. VISITOR: the visitor's own. PRESENTER: the server's configured ones.
 */
export type DemoAccountsView = {
  accounts:
    | null
    | { source: "VISITOR"; payerPayPalId: string; payeeMerchantId: string }
    | { source: "PRESENTER"; payerPinned: boolean };
  /** Whether the presenter's accounts may be used: by anyone, with the presenter link, or not at all. */
  presenter: "OPEN" | "KEY" | "UNAVAILABLE";
  stored: "IN_THIS_DEMO_ONLY";
};

export type DemoAccountsBody =
  | { source: "VISITOR"; payerPayPalId: string; payeeMerchantId: string }
  | { source: "PRESENTER"; presenterKey?: string };

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

export type PayPalOrderStatus = "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
export type PayPalCaptureStatus = "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";

/** One COMPAS order to the merchant, as the PayPal sandbox reports it now. */
export type MerchantPayPalPayment = {
  orderId: string;
  compasState?: PaymentState;
  recordedAt: string;
  paypal:
    | {
        read: "OK";
        orderStatus: PayPalOrderStatus;
        payeeMerchantId?: string;
        amount?: Money;
        capture?: { id: string; status: PayPalCaptureStatus; amount?: Money };
      }
    | { read: "UNAVAILABLE"; error: string };
};

/** GET /demo/merchants/:id/payments. Real sandbox orders, read live from PayPal. */
export type MerchantPayPalPaymentsResponse = {
  environment: "sandbox";
  /** The real PayPal sandbox page where the merchant's test account sees its activity. */
  sandboxActivityUrl: string;
  merchant: { id: string; displayName: string; paypalMerchantId: string };
  payments: readonly MerchantPayPalPayment[];
};

// ---------------------------------------------------------------------------
// The AI analyst (`contracts/merchant-onboarding/README.md`). Merchant data
// only, never a payer, delegate or errand. A finding never decides a payment.
// ---------------------------------------------------------------------------

export type ItemClass = "MEDICINE" | "NOT_MEDICINE" | "UNSURE";

/** One SKU of a run. The class and the CUM are the model's; `outcome` is the verifier's. */
export type AnalyzedSku = {
  skuId: string;
  name: string;
  /** CUM candidates the search index proposed. Proposals, not evidence. */
  candidates: number;
  itemClass: ItemClass;
  cum?: string;
  outcome?: "VERIFIED" | "REJECTED";
};

export type AnalystJob = {
  id: string;
  merchantId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  result?: {
    runId: string;
    status: "COMPLETED" | "NO_CATALOG" | "NOT_APPLICABLE";
    items: number;
    verifiedMappings: number;
    rejectedMappings: number;
    newFlags: number;
    skus: readonly AnalyzedSku[];
  };
  /** The error's name only. */
  error?: string;
  createdAt: string;
  finishedAt?: string;
};

export type AnalystFinding =
  | { kind: "POINTER"; pointer: "CUM_MAPPING"; id: string; runId: string; skuId: string; cum: string; outcome: "VERIFIED" | "REJECTED"; recordedAt: string }
  | { kind: "POINTER"; pointer: "CAMARA_CERTIFICATE"; id: string; runId: string; outcome: "VERIFIED_BOUND" | "VERIFIED_UNBOUND" | "REJECTED"; detail: string; recordedAt: string }
  | {
      kind: "JUDGMENT";
      id: string;
      runId: string;
      judgment: "CATALOG_OFF_PURPOSE" | "LOOKALIKE_SIGNALS";
      category: CompasCategory;
      citedSkuIds: readonly string[];
      /** For LOOKALIKE_SIGNALS, the model's own sentence. Untrusted text. */
      note: string;
      status: "OPEN" | "RESPONDED" | "WITHDRAWN";
      recordedAt: string;
    };

export type AnalystFindingsResponse = { merchantId: string; findings: readonly AnalystFinding[] };

/**
 * A pharmacy's analyst runs, shared by every visitor: the last real run, one
 * in progress, the last failed try, and when a live run may start (absent: now).
 */
export type AnalystRunStatusResponse = {
  merchantId: string;
  latest?: AnalystJob;
  running?: AnalystJob;
  failure?: AnalystJob;
  nextRunAt?: string;
  cooldownHours: number;
};

/** `GET /health`, the fields the demo reads. */
export type HealthResponse = {
  status: string;
  elastic?: "configured" | "not_configured";
  /** Which model the analyst calls: Claude through the Claude API, or Elastic's Inference API. */
  analystModel?: "claude" | "elastic";
  /** Where the verifier re-reads a CUM: INVIMA's dataset on datos.gov.co, or the committed demo subset. */
  cumRegistry?: string;
  storage?: "postgres" | "memory";
  analystJobs?: "enabled" | "disabled";
  /** Whether a demo session may create PayPal orders. Act 3's clean cart needs "enabled". */
  purchases?: "enabled" | "disabled_for_demo" | "not_configured";
};

// ---------------------------------------------------------------------------
// Act 3: an AI agent over MCP (ADR 0011)
// ---------------------------------------------------------------------------

export const AGENT_SCENARIOS = ["arc", "lookalike", "extra-product", "extra-boxes", "other-errand"] as const;
export type AgentScenario = (typeof AGENT_SCENARIOS)[number];

/**
 * What the scripted demo agent did. `say` and `page` are the script's words;
 * `http`, `rpc` and `consent` are what crossed the wire to the MCP server.
 */
export type AgentRunStep =
  | { n: number; at: string; kind: "task"; text: string }
  | { n: number; at: string; kind: "say"; text: string }
  | { n: number; at: string; kind: "page"; source: string; text: string }
  | { n: number; at: string; kind: "http"; method: string; url: string; status: number; note: string }
  | { n: number; at: string; kind: "consent"; state: "WAITING" | "APPROVED" | "REFUSED"; requestId?: string }
  | { n: number; at: string; kind: "rpc"; method: string; tool?: string; request: unknown; status: number; response: unknown; ms: number };

export type AgentRunStatus = "STARTING" | "AWAITING_CONSENT" | "RUNNING" | "COMPLETED" | "REFUSED" | "FAILED";

export type AgentRun = {
  id: string;
  scenario: AgentScenario;
  errandId: string;
  status: AgentRunStatus;
  mcpUrl: string;
  consentRequestId?: string;
  grantId?: string;
  steps: readonly AgentRunStep[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

/** What COMPAS recorded on the server about one tool call. No cart, no SKUs. */
export type AgentEvent = {
  id: string;
  at: string;
  grantId: string;
  tool: string;
  errandId?: string;
  merchantId?: string;
  outcome?: PolicyOutcome;
  reasonCodes: readonly string[];
  error?: string;
};

export type ErrandKind = "ONE_OFF" | "STANDING";

export type ErrandItem = { label: string; acceptedCums: readonly string[]; maxUnits: number };

/** The body of `POST /errands`, without `confirmed`: the delegate's tap adds that. */
export type ErrandBody = {
  mandateId: string;
  kind: ErrandKind;
  items: readonly ErrandItem[];
  maxAmount: Money;
  expiresAt: string;
};

export type ErrandSuggestion =
  | { available: true; errand: ErrandBody; dataLabel: string }
  | { available: false; reason: string };

export type ErrandView = ErrandBody & {
  id: string;
  delegateId: string;
  status: "ACTIVE" | "CANCELLED";
  displayStatus: "ACTIVE" | "CANCELLED" | "EXPIRED" | "FULFILLED";
  used: { units: readonly number[]; amount: Money };
};

/** The consent screen: who is asking, and the delegate's own open errands. */
export type AgentConsentRequest = {
  requestId: string;
  client: { name: string; redirectHost: string };
  errands: readonly {
    id: string;
    mandateId: string;
    kind: ErrandKind;
    items: readonly { label: string; maxUnits: number }[];
    maxAmount: Money;
    expiresAt: string;
  }[];
  expiresAt: string;
};
