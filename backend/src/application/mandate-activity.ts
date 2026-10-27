import type { Mandate } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyReasonCode } from "../domain/policy-decision.ts";
import type { PaymentFailureCode, SpendingRecord } from "../domain/spending.ts";

/**
 * What happened to one attempt, as people read it:
 * - COMPLETED: PayPal captured the order. The merchant was paid.
 * - PENDING: PayPal accepted the capture but has not completed it. Not spent yet.
 * - AWAITING_APPROVAL: policy allowed it and the PayPal order waits for the payer. Nothing paid.
 * - CANCELLED: the payer cancelled the order at PayPal. Nothing paid.
 * - FAILED: policy allowed it, but no payment completed.
 * - DENIED / REVIEW: policy stopped it. No PayPal order exists.
 */
export const ACTIVITY_KINDS = [
  "COMPLETED",
  "PENDING",
  "AWAITING_APPROVAL",
  "CANCELLED",
  "FAILED",
  "DENIED",
  "REVIEW",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type MandateActivityEntry = {
  /** The policy decision id. */
  id: string;
  recordedAt: string;
  kind: ActivityKind;
  /** Display only. Never evidence. */
  merchantDisplayName?: string;
  /** What the merchant charged. An allowed attempt's PayPal order is for exactly this. */
  requestedAmount: MoneyAmount;
  /** Paid only because the payer chose MONITORED and the purpose check failed. */
  monitoredException: boolean;
  /** Whether the purpose checks alone passed. Absent when a mandate rule stopped the attempt first. */
  purposeMatched?: boolean;
  /** Policy reason codes. The UI words them. */
  reasonCodes: readonly PolicyReasonCode[];
  /** Why a FAILED attempt was not paid. */
  failureCode?: PaymentFailureCode;
  /**
   * Where the payer approves the order at PayPal. Only in the payer's view,
   * only while the order waits and the mandate can still pay it.
   */
  approvalUrl?: string;
};

export type MandateActivity = {
  mandateId: string;
  budget: MoneyAmount;
  totals: {
    /** Charges PayPal captured, in the budget's asset. Nothing waiting, pending or failed is in here. */
    completed: MoneyAmount;
    /** Charges reserved but not captured yet: waiting for the payer, or a pending capture. Kept apart from `completed`. */
    inProgress: MoneyAmount;
    attempts: number;
    completedCount: number;
    inProgressCount: number;
    awaitingApprovalCount: number;
    cancelledCount: number;
    failedCount: number;
    deniedCount: number;
    reviewCount: number;
    /** COMPLETED payments that went ahead as a monitored exception. */
    monitoredExceptions: number;
    /** Charges that were not in the budget's asset, so they are not in the totals. */
    excludedOtherAsset: number;
    /**
     * False when completed and in-progress charges exceed what the mandate's
     * capacity already accounts for (budget minus remaining). A screen must
     * not present the remaining figure as reconciled when this is false.
     */
    capacityReconciled: boolean;
  };
  /** Newest first. */
  entries: readonly MandateActivityEntry[];
};

export function classifyAttempt(record: SpendingRecord): ActivityKind {
  if (record.decision.outcome === "DENY") return "DENIED";
  if (record.decision.outcome === "REVIEW") return "REVIEW";
  // ALLOW. Only an order PayPal captured is spent.
  if (!record.paypal.orderId) return "FAILED";
  switch (record.paypal.state) {
    case "COMPLETED":
      return "COMPLETED";
    case "PENDING":
      return "PENDING";
    case "AWAITING_PAYER_APPROVAL":
      return "AWAITING_APPROVAL";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "FAILED";
  }
}

function inBudgetAsset(amount: MoneyAmount, budget: MoneyAmount): boolean {
  return amount.assetCode === budget.assetCode && amount.assetScale === budget.assetScale;
}

/**
 * The mandate's activity for the payer's and the delegate's screens. It reads
 * the same spending log as `buildSpendingReport`, but it never counts an
 * order the payer has not approved, or a capture PayPal has not completed, as spent.
 *
 * `options.approvalLinks` is for the payer's view only: the delegate never
 * receives the link that approves a payment from the payer's PayPal.
 */
export function buildMandateActivity(
  mandate: Mandate,
  records: readonly SpendingRecord[],
  options: { approvalLinks?: boolean; mandateUsable?: boolean } = {},
): MandateActivity {
  let completed = 0n;
  let inProgress = 0n;
  let excludedOtherAsset = 0;
  const counts = {
    COMPLETED: 0,
    PENDING: 0,
    AWAITING_APPROVAL: 0,
    CANCELLED: 0,
    FAILED: 0,
    DENIED: 0,
    REVIEW: 0,
  } satisfies Record<ActivityKind, number>;
  let monitoredExceptions = 0;

  const entries = [...records]
    .filter((record) => record.mandateId === mandate.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((record): MandateActivityEntry => {
      const kind = classifyAttempt(record);
      counts[kind] += 1;
      if (kind === "COMPLETED" || kind === "PENDING" || kind === "AWAITING_APPROVAL") {
        if (inBudgetAsset(record.requestedAmount, mandate.budget)) {
          if (kind === "COMPLETED") completed += BigInt(record.requestedAmount.value);
          else inProgress += BigInt(record.requestedAmount.value);
        } else {
          excludedOtherAsset += 1;
        }
      }
      if (kind === "COMPLETED" && record.monitoredException) monitoredExceptions += 1;
      const showApproval =
        kind === "AWAITING_APPROVAL" && options.approvalLinks && options.mandateUsable && record.paypal.approvalUrl;

      return {
        id: record.id,
        recordedAt: record.recordedAt,
        kind,
        ...(record.merchantDisplayName ? { merchantDisplayName: record.merchantDisplayName } : {}),
        requestedAmount: record.requestedAmount,
        monitoredException: record.monitoredException,
        ...(record.purposeCheck ? { purposeMatched: record.purposeCheck.outcome === "ALLOW" } : {}),
        reasonCodes: record.decision.reasons.map((reason) => reason.code),
        ...(kind === "FAILED" && record.paypal.failureCode ? { failureCode: record.paypal.failureCode } : {}),
        ...(showApproval ? { approvalUrl: record.paypal.approvalUrl } : {}),
      };
    });

  const remaining = mandate.remainingAuthorizedAmount;
  const capacityUsed =
    remaining.assetCode === mandate.budget.assetCode && remaining.assetScale === mandate.budget.assetScale
      ? BigInt(mandate.budget.value) - BigInt(remaining.value)
      : 0n;

  return {
    mandateId: mandate.id,
    budget: mandate.budget,
    totals: {
      capacityReconciled: completed + inProgress <= capacityUsed,
      completed: { ...mandate.budget, value: completed.toString() },
      inProgress: { ...mandate.budget, value: inProgress.toString() },
      attempts: entries.length,
      completedCount: counts.COMPLETED,
      inProgressCount: counts.PENDING,
      awaitingApprovalCount: counts.AWAITING_APPROVAL,
      cancelledCount: counts.CANCELLED,
      failedCount: counts.FAILED,
      deniedCount: counts.DENIED,
      reviewCount: counts.REVIEW,
      monitoredExceptions,
      excludedOtherAsset,
    },
    entries,
  };
}
