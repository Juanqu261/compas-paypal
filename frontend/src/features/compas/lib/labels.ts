import type {
  ActivityKind,
  CompasCategory,
  ConfidenceMinimum,
  Corroboration,
  Enforcement,
  MandateStatus,
  MandateView,
  PaymentFailureCode,
  PolicyReasonCode,
  PurchaseView,
  TrustLevel,
} from "../api/contracts";

/**
 * Plain English for everything the backend says in codes. The codes stay the
 * backend's. Nothing here decides a payment.
 */

export const STATUS_LABEL: Record<MandateStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  EXHAUSTED: "Used up",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

/** A tone for the badge. The label always carries the meaning too. */
export function statusTone(status: MandateStatus): "ok" | "wait" | "off" | "draft" {
  if (status === "ACTIVE") return "ok";
  if (status === "DRAFT") return "draft";
  return "off";
}

/**
 * Whether the payer ever confirmed this permission. A draft authorizes
 * nothing yet, so its amount is "to authorize", never "authorized". A
 * delegate only ever sees confirmed ones.
 */
export function isAuthorized(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): boolean {
  if (mandate.status === "ACTIVE" || mandate.status === "EXHAUSTED") return true;
  if (mandate.status === "DRAFT") return false;
  return mandate.viewerRole === "DELEGATE" || mandate.authorization?.consent === "GRANTED";
}

/** What the capacity figure means in this state. */
export function capacityLabel(mandate: Pick<MandateView, "status" | "viewerRole" | "authorization">): string {
  switch (mandate.status) {
    case "ACTIVE":
      return "Available to spend";
    case "DRAFT":
      return "Amount to authorize";
    case "EXHAUSTED":
      return "Budget used up";
    case "EXPIRED":
      return isAuthorized(mandate) ? "Expired unused" : "Expired without authorization";
    case "REVOKED":
      return isAuthorized(mandate) ? "Revoked unused" : "Discarded without authorization";
  }
}

/** The status as the payer reads it. */
export function payerStatusLabel(mandate: Pick<MandateView, "status">): string {
  return STATUS_LABEL[mandate.status];
}

export const CATEGORY_LABEL: Record<CompasCategory, string> = {
  MEDICATION: "Medication",
  FOOD: "Groceries",
  PERSONAL_CARE: "Personal care",
  ALCOHOL: "Alcohol",
  TOBACCO: "Tobacco",
};

export const CATEGORY_DESCRIPTION: Record<CompasCategory, string> = {
  MEDICATION: "Prescription or over-the-counter, at pharmacies.",
  FOOD: "Groceries at stores and supermarkets.",
  PERSONAL_CARE: "Personal hygiene and toiletries.",
  ALCOHOL: "Alcoholic drinks.",
  TOBACCO: "Cigarettes and tobacco.",
};

/** "Medication", "Medication and groceries", "Medication, groceries, and tobacco". */
export function categoryList(categories: readonly CompasCategory[]): string {
  const labels = categories.map((category, index) =>
    index === 0 ? CATEGORY_LABEL[category] : CATEGORY_LABEL[category].toLowerCase(),
  );
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** The budget's name in lists: what it is for and for whom. */
export function purposeTitle(mandate: Pick<MandateView, "purposePolicy" | "beneficiary">): string {
  return `${categoryList(mandate.purposePolicy.eligibleCategories)} for ${mandate.beneficiary.displayName}`;
}

export const ENFORCEMENT_LABEL: Record<Enforcement, string> = {
  ENFORCED: "Allowed purchases only",
  MONITORED: "Allow and notify me",
};

export const ENFORCEMENT_DESCRIPTION: Record<Enforcement, string> = {
  ENFORCED: "If a purchase breaks your rules, it does not get paid.",
  MONITORED: "It still gets paid even when it misses the purpose, and it is flagged for you to review.",
};

export const MONITORED_WARNING =
  "A purchase outside the purpose will still be paid, up to the budget amount. The window, the person, and the maximum always apply.";

export const CONFIDENCE_LABEL: Record<ConfidenceMinimum, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Basic",
};

export const CONFIDENCE_DESCRIPTION: Record<ConfidenceMinimum, string> = {
  HIGH: "Merchants verified by their wallet or an official registry.",
  MEDIUM: "Also merchants with partial verification.",
  LOW: "Also merchants that only self-declare. Set a per-purchase cap.",
};

export const REASON_TEXT: Record<PolicyReasonCode, string> = {
  MANDATE_INACTIVE: "The authorization was not active",
  MANDATE_EXPIRED: "The authorization had expired",
  BUDGET_EXCEEDED: "The purchase exceeds the authorized budget",
  PURPOSE_MISMATCH: "The items do not match the purpose",
  MERCHANT_NOT_ELIGIBLE: "The merchant does not match the allowed categories",
  CLASSIFICATION_UNCERTAIN: "Not enough information to check the purchase",
  MERCHANT_EVIDENCE_INSUFFICIENT: "The merchant does not meet the confidence you require",
  MERCHANT_EVIDENCE_CONFLICT: "We found conflicting information about the merchant",
  MERCHANT_HISTORY_CONTRADICTS: "Earlier purchases contradict what the merchant declares",
  MERCHANT_CONFIDENCE_LIMIT_EXCEEDED: "The purchase exceeds your limit for lower-confidence merchants",
  DELEGATE_NOT_AUTHORIZED: "This authorization belongs to someone else",
  PAYER_MONITORED_EXCEPTION: "Purchase made under supervision",
  ERRAND_MISMATCH: "The purchase does not match the confirmed errand",
};

export function reasonText(code: string): string {
  return (REASON_TEXT as Record<string, string>)[code] ?? "Unrecognized reason";
}

export function activityLabel(kind: ActivityKind, monitoredException: boolean): string {
  switch (kind) {
    case "COMPLETED":
      return monitoredException ? "Paid, with a notice" : "Paid";
    case "PENDING":
      return "Payment in progress";
    case "AWAITING_APPROVAL":
      return "Awaiting PayPal approval";
    case "CANCELLED":
      return "Cancelled at PayPal";
    case "FAILED":
      return "Not paid";
    case "DENIED":
      return "Purchase not allowed";
    case "REVIEW":
      return "Held for review";
  }
}

/** Why COMPAS did not, or PayPal could not, capture an allowed purchase. Nothing was charged in any of them. */
export const FAILURE_TEXT: Record<PaymentFailureCode, string> = {
  MANDATE_NOT_USABLE: "The budget was no longer active when it was approved. Nothing was charged.",
  ORDER_MISMATCH: "The PayPal order did not match the purchase. Nothing was charged.",
  PAYER_ACCOUNT_MISMATCH: "A different PayPal account approved it. Nothing was charged.",
  CAPTURE_DECLINED: "PayPal declined the charge. Nothing was charged.",
  ORDER_EXPIRED: "The order expired without approval. Nothing was charged.",
};

/** The one reason worth showing next to an attempt that did not pay normally. */
export function activityReason(kind: ActivityKind, codes: readonly string[], failureCode?: PaymentFailureCode): string | undefined {
  if (kind === "COMPLETED" || kind === "PENDING" || kind === "AWAITING_APPROVAL") {
    const purposeCode = codes.find((code) => code !== "PAYER_MONITORED_EXCEPTION");
    if (codes.includes("PAYER_MONITORED_EXCEPTION") && purposeCode) return reasonText(purposeCode);
    return kind === "AWAITING_APPROVAL" ? "Nothing is charged until it is approved at PayPal." : undefined;
  }
  if (kind === "CANCELLED") return "Cancelled at PayPal. Nothing was charged.";
  if (kind === "FAILED") return failureCode ? FAILURE_TEXT[failureCode] : "PayPal did not complete the payment. Nothing was charged.";
  return codes.length > 0 ? reasonText(codes[0]) : undefined;
}

/**
 * Only a PayPal page is ever opened for the payer: https on paypal.com or one
 * of its subdomains, such as www.sandbox.paypal.com. Anything else is dropped.
 */
export function payPalApprovalUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    const host = url.hostname;
    return url.protocol === "https:" && (host === "paypal.com" || host.endsWith(".paypal.com")) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** API error codes, said plainly with what to do next. */
export function errorText(code: string): string {
  switch (code) {
    case "PAYPAL_NOT_CONFIGURED":
    case "NOT_CONFIGURED":
      return "This environment has no PayPal configured, so payments cannot be created.";
    case "UPSTREAM":
      return "PayPal did not respond. Try again in a few minutes.";
    case "INVALID_STATE":
      return "This budget no longer allows that action.";
    case "NOT_THE_PAYER":
      return "Only the person who created the budget can do this.";
    case "NOT_FOUND":
      return "We could not find this budget.";
    case "INVALID_MANDATE":
      return "Check the budget details.";
    case "UNAUTHENTICATED":
    case "IDENTITY_NOT_CONFIGURED":
      return "The demo session is not available on the backend.";
    case "BACKEND_UNAVAILABLE":
      return "We could not reach COMPAS. Check that the backend is running.";
    case "TIMEOUT":
      return "COMPAS took too long to respond. Try again.";
    case "NOT_THE_DELEGATE":
      return "Only the authorized person can pay with this budget.";
    case "PURCHASES_DISABLED_FOR_DEMO":
      return "Payments are turned off in this demo. Nothing was charged.";
    case "SANDBOX_ACCOUNTS_REQUIRED":
      return "Choose the PayPal sandbox accounts this demo pays with first. Nothing was charged.";
    case "DEMO_LIMIT_REACHED":
      return "This demo reached its limit. Use “Reset my demo” at the top to start over. Nothing was charged.";
    case "PAYEE_ACCOUNT_INVALID":
      return "PayPal doesn't know the business account this demo pays. Check its account ID. Nothing was charged.";
    case "UNKNOWN_MERCHANT":
      return "This merchant does not take COMPAS payments in this environment.";
    case "INVALID_PURCHASE":
      return "The charge is not valid. Ask the merchant to create it again.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "This attempt was already used for another purchase. Create the charge again.";
    case "PAYMENT_NOT_STARTED":
      return "The purchase stopped before a PayPal payment was created. Nothing was charged. Create the charge again.";
    default:
      return "Something went wrong. Try again.";
  }
}

export const TRUST_LEVEL_LABEL: Record<TrustLevel, string> = {
  SELF_DECLARED: "Declared by the merchant",
  PROVIDER_VERIFIED: "Verified by the wallet",
  EXTERNAL_VERIFIED: "Verified in an official registry",
};

export const CORROBORATION_LABEL: Record<Corroboration, string> = {
  CONTRADICTED: "Contradicted by another source",
  UNCORROBORATED: "Not corroborated",
  REGISTRY_UNBOUND: "Matches a registry, without a verified link",
  PROVIDER_VERIFIED: "Corroborated by the wallet",
  EXTERNAL_VERIFIED: "Corroborated in an official registry",
};

export type PurchaseTone = "ok" | "wait" | "stop";

/**
 * Where a purchase stands, without ever calling a decision a payment: only a
 * payment PayPal captured is "paid".
 */
export function purchaseStatus(purchase: Pick<PurchaseView, "outcome" | "payment">): { title: string; tone: PurchaseTone } {
  if (purchase.outcome === "DENY") return { title: "Purchase not allowed", tone: "stop" };
  if (purchase.outcome === "REVIEW") return { title: "Purchase held for review", tone: "wait" };
  if (purchase.payment.status === "NOT_CREATED") return { title: "Payment could not be created", tone: "stop" };
  switch (purchase.payment.state) {
    case "COMPLETED":
      return { title: "Paid", tone: "ok" };
    case "AWAITING_PAYER_APPROVAL":
      return { title: "Waiting for PayPal approval", tone: "wait" };
    case "CANCELLED":
      return { title: "Payment cancelled at PayPal", tone: "stop" };
    case "FAILED":
      return { title: "Not paid", tone: "stop" };
    case "PENDING":
      return { title: "Payment in progress", tone: "wait" };
  }
}

export function purchaseStatusLabel(purchase: Pick<PurchaseView, "outcome" | "payment">): string {
  return purchaseStatus(purchase).title;
}
