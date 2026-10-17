import type { Mandate } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyReasonCode } from "../domain/policy-decision.ts";
import type { SpendingRecord } from "../domain/spending.ts";

/**
 * What happened to one attempt, as people read it:
 * - COMPLETED: the outgoing payment reached its debit amount.
 * - PENDING: an outgoing payment exists but has not completed. Not spent yet.
 * - FAILED: policy allowed it, but no payment completed.
 * - DENIED / REVIEW: policy stopped it. No outgoing payment exists.
 */
export const ACTIVITY_KINDS = ["COMPLETED", "PENDING", "FAILED", "DENIED", "REVIEW"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type MandateActivityEntry = {
  /** The policy decision id. */
  id: string;
  recordedAt: string;
  kind: ActivityKind;
  /** Display only. Never evidence. */
  merchantDisplayName?: string;
  /** What the merchant asked for, in the merchant wallet's asset. */
  requestedAmount: MoneyAmount;
  /** What leaves, or would leave, the payer wallet, from the Open Payments quote. Absent when no quote was made. */
  debitAmount?: MoneyAmount;
  /** Paid only because the payer chose MONITORED and the purpose check failed. */
  monitoredException: boolean;
  /** Whether the purpose checks alone passed. Absent when a mandate rule stopped the attempt first. */
  purposeMatched?: boolean;
  /** Policy reason codes. The UI words them. */
  reasonCodes: readonly PolicyReasonCode[];
};

export type MandateActivity = {
  mandateId: string;
  budget: MoneyAmount;
  totals: {
    /** Quoted debits of COMPLETED payments in the budget's asset. Nothing pending or failed is in here. */
    completed: MoneyAmount;
    /** Quoted debits of PENDING payments in the budget's asset. Kept apart from `completed`. */
    inProgress: MoneyAmount;
    attempts: number;
    completedCount: number;
    inProgressCount: number;
    failedCount: number;
    deniedCount: number;
    reviewCount: number;
    /** COMPLETED payments that went ahead as a monitored exception. */
    monitoredExceptions: number;
    /** Debits that were not in the budget's asset, so they are not in the totals. */
    excludedOtherAsset: number;
    /**
     * False when completed and pending debits exceed what the mandate's
     * capacity already accounts for (budget minus remaining). The purchase
     * flow does not reduce `remainingAuthorizedAmount` yet, so a screen must
     * not present that figure as reconciled when this is false.
     */
    capacityReconciled: boolean;
  };
  /** Newest first. */
  entries: readonly MandateActivityEntry[];
};

export function classifyAttempt(record: SpendingRecord): ActivityKind {
  if (record.decision.outcome === "DENY") return "DENIED";
  if (record.decision.outcome === "REVIEW") return "REVIEW";
  // ALLOW. Only an outgoing payment that reached its debit amount is spent.
  if (!record.openPayments.outgoingPaymentUrl) return "FAILED";
  if (record.openPayments.state === "COMPLETED") return "COMPLETED";
  if (record.openPayments.state === "FAILED") return "FAILED";
  return "PENDING";
}

function inBudgetAsset(amount: MoneyAmount | undefined, budget: MoneyAmount): amount is MoneyAmount {
  return Boolean(
    amount && amount.assetCode === budget.assetCode && amount.assetScale === budget.assetScale,
  );
}

/**
 * The mandate's activity for the payer's and the delegate's screens. It reads
 * the same spending log as `buildSpendingReport`, but it never counts a
 * pending or failed payment as spent. `buildSpendingReport` counts any record
 * with an outgoing payment URL, which includes PENDING ones.
 */
export function buildMandateActivity(
  mandate: Mandate,
  records: readonly SpendingRecord[],
): MandateActivity {
  let completed = 0n;
  let inProgress = 0n;
  let excludedOtherAsset = 0;
  const counts = { COMPLETED: 0, PENDING: 0, FAILED: 0, DENIED: 0, REVIEW: 0 } satisfies Record<ActivityKind, number>;
  let monitoredExceptions = 0;

  const entries = [...records]
    .filter((record) => record.mandateId === mandate.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((record): MandateActivityEntry => {
      const kind = classifyAttempt(record);
      counts[kind] += 1;
      if (kind === "COMPLETED" || kind === "PENDING") {
        if (inBudgetAsset(record.debitAmount, mandate.budget)) {
          if (kind === "COMPLETED") completed += BigInt(record.debitAmount.value);
          else inProgress += BigInt(record.debitAmount.value);
        } else {
          excludedOtherAsset += 1;
        }
      }
      if (kind === "COMPLETED" && record.monitoredException) monitoredExceptions += 1;

      return {
        id: record.id,
        recordedAt: record.recordedAt,
        kind,
        ...(record.merchantDisplayName ? { merchantDisplayName: record.merchantDisplayName } : {}),
        requestedAmount: record.requestedAmount,
        ...(record.debitAmount ? { debitAmount: record.debitAmount } : {}),
        monitoredException: record.monitoredException,
        ...(record.purposeCheck ? { purposeMatched: record.purposeCheck.outcome === "ALLOW" } : {}),
        reasonCodes: record.decision.reasons.map((reason) => reason.code),
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
      failedCount: counts.FAILED,
      deniedCount: counts.DENIED,
      reviewCount: counts.REVIEW,
      monitoredExceptions,
      excludedOtherAsset,
    },
    entries,
  };
}
