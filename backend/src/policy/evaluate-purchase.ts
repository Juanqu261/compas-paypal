import type { Mandate } from "../domain/mandate.ts";
import type { MerchantCategoryResolution } from "../domain/merchant-category.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type {
  PolicyDecision,
  PolicyOutcome,
  PolicyReason,
  PurposeCheck,
} from "../domain/policy-decision.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import {
  evaluateMerchantCategoryEvidence,
  type MerchantHistoryInput,
} from "./merchant-category-evidence.ts";

/**
 * Deterministic purchase policy. No AI and no I/O.
 *
 * Mandate rules always deny, whatever the enforcement mode.
 * Purpose checks (merchant category and line items) deny or hold in ENFORCED
 * mode. In MONITORED mode they are recorded on the decision and the outcome
 * is ALLOW. Open Payments still caps the spend through the payer's grant.
 */

/** Status, validity window and delegate. Each failure is a hard DENY. */
export function checkMandateRules(
  mandate: Mandate,
  intent: PurchaseIntent,
  now: Date,
): PolicyReason[] {
  const reasons: PolicyReason[] = [];
  if (intent.mandateId !== mandate.id) {
    reasons.push({ code: "MANDATE_INACTIVE", message: "The purchase intent names another mandate." });
  } else if (mandate.status !== "ACTIVE") {
    reasons.push({ code: "MANDATE_INACTIVE", message: `The mandate is ${mandate.status}.` });
  }
  const time = now.getTime();
  if (time < Date.parse(mandate.validFrom) || time >= Date.parse(mandate.expiresAt)) {
    reasons.push({ code: "MANDATE_EXPIRED", message: "The purchase is outside the mandate's validity window." });
  }
  if (intent.delegateId !== mandate.delegate.id) {
    reasons.push({ code: "DELEGATE_NOT_AUTHORIZED", message: "Only the mandate's delegate may spend under it." });
  }
  return reasons;
}

/**
 * Compares the quoted debit with the remaining authorization capacity.
 * Different assets cannot be compared, so they fail closed. Never a balance check.
 */
export function checkBudget(mandate: Mandate, debitAmount: MoneyAmount): PolicyReason[] {
  const remaining = mandate.remainingAuthorizedAmount;
  if (debitAmount.assetCode !== remaining.assetCode || debitAmount.assetScale !== remaining.assetScale) {
    return [{
      code: "BUDGET_EXCEEDED",
      message: `The debit is in ${debitAmount.assetCode}/${debitAmount.assetScale}, the mandate in ${remaining.assetCode}/${remaining.assetScale}. COMPAS does not convert.`,
    }];
  }
  if (BigInt(debitAmount.value) > BigInt(remaining.value)) {
    return [{ code: "BUDGET_EXCEEDED", message: "The quoted debit exceeds the remaining authorized amount." }];
  }
  return [];
}

const OUTCOME_SEVERITY: Record<PolicyOutcome, number> = { ALLOW: 0, REVIEW: 1, DENY: 2 };

function worst(a: PolicyOutcome, b: PolicyOutcome): PolicyOutcome {
  return OUTCOME_SEVERITY[b] > OUTCOME_SEVERITY[a] ? b : a;
}

/**
 * Merchant category evidence through the trust matrix, then line items.
 * Line-item categories come from the merchant's point of sale and are weaker
 * than merchant evidence. A line without a category needs the classifier,
 * which is not wired, so it holds.
 */
export function evaluatePurposeCheck(
  mandate: Mandate,
  intent: PurchaseIntent,
  merchantResolution: MerchantCategoryResolution,
  merchantHistory: MerchantHistoryInput,
): PurposeCheck {
  const policy = mandate.purposePolicy;
  const reasons: PolicyReason[] = [];
  let outcome: PolicyOutcome = "ALLOW";

  const merchantStep = evaluateMerchantCategoryEvidence(merchantResolution, policy, merchantHistory);
  if (merchantStep.result !== "PASS") {
    outcome = worst(outcome, merchantStep.result);
    reasons.push(merchantStep.reason);
  }

  const eligible = new Set<string>(policy.eligibleCategories);
  if (intent.lineItems.some((line) => line.category !== undefined && !eligible.has(line.category))) {
    outcome = worst(outcome, "DENY");
    reasons.push({ code: "PURPOSE_MISMATCH", message: "At least one line item is outside the mandate's purpose." });
  }
  if (intent.lineItems.some((line) => line.category === undefined)) {
    outcome = worst(outcome, "REVIEW");
    reasons.push({ code: "CLASSIFICATION_UNCERTAIN", message: "At least one line item has no category." });
  }

  return {
    outcome,
    reasons,
    matchedCategories: merchantStep.result === "PASS" ? merchantStep.matchedCategories : [],
    ...(merchantStep.result !== "DENY" && merchantStep.confidence
      ? { merchantConfidence: merchantStep.confidence }
      : {}),
    enforced: policy.enforcement === "ENFORCED",
  };
}

/**
 * The mandate's optional per-purchase cap for a merchant that passed below
 * HIGH confidence. It reads the quoted debit, like the budget, because only
 * the quote knows the debit in the payer's asset. A different asset fails
 * closed. It is a purpose check, so MONITORED records it without blocking.
 */
export function applyConfidenceCap(
  mandate: Mandate,
  check: PurposeCheck,
  debitAmount: MoneyAmount,
): PurposeCheck {
  const cap = mandate.purposePolicy.merchantConfidence.maxDebitBelowHigh;
  const passedBelowHigh = check.matchedCategories.length > 0 && check.merchantConfidence?.confidence !== "HIGH";
  if (!cap || !passedBelowHigh) return check;

  const sameAsset = debitAmount.assetCode === cap.assetCode && debitAmount.assetScale === cap.assetScale;
  if (sameAsset && BigInt(debitAmount.value) <= BigInt(cap.value)) return check;
  return {
    ...check,
    outcome: worst(check.outcome, "REVIEW"),
    reasons: [
      ...check.reasons,
      {
        code: "MERCHANT_CONFIDENCE_LIMIT_EXCEEDED",
        message: sameAsset
          ? `The merchant has ${check.merchantConfidence?.confidence} confidence, and the debit exceeds this mandate's cap for such merchants.`
          : `The debit is in ${debitAmount.assetCode}/${debitAmount.assetScale}, the cap in ${cap.assetCode}/${cap.assetScale}. COMPAS does not convert.`,
      },
    ],
  };
}

/** Turns rule results into the one decision the payment gate reads. */
export function composeDecision(input: {
  decisionId: string;
  mandate: Mandate;
  intent: PurchaseIntent;
  hardReasons: readonly PolicyReason[];
  purposeCheck?: PurposeCheck;
  evaluatedAt: Date;
}): PolicyDecision {
  const base = {
    id: input.decisionId,
    mandateId: input.mandate.id,
    purchaseIntentId: input.intent.id,
    evaluatedAt: input.evaluatedAt.toISOString(),
  };

  if (input.hardReasons.length > 0) {
    return {
      ...base,
      outcome: "DENY",
      reasons: input.hardReasons,
      ...(input.purposeCheck ? { purposeCheck: input.purposeCheck } : {}),
    };
  }
  if (!input.purposeCheck) {
    throw new Error("A decision without a mandate failure needs a purpose check.");
  }

  const check = input.purposeCheck;
  if (check.enforced || check.outcome === "ALLOW") {
    return { ...base, outcome: check.outcome, reasons: check.reasons, purposeCheck: check };
  }
  return {
    ...base,
    outcome: "ALLOW",
    reasons: [
      ...check.reasons,
      {
        code: "PAYER_MONITORED_EXCEPTION",
        message: "The payer chose to allow purchases that fail the purpose checks and review them afterwards.",
      },
    ],
    purposeCheck: check,
  };
}

/** The whole policy in one pure call, for a caller that already holds the quote. */
export function evaluatePurchase(input: {
  decisionId: string;
  mandate: Mandate;
  intent: PurchaseIntent;
  /** From the Open Payments quote, in the payer wallet's asset. */
  debitAmount: MoneyAmount;
  merchantResolution: MerchantCategoryResolution;
  merchantHistory: MerchantHistoryInput;
  now: Date;
}): PolicyDecision {
  const hardReasons = [
    ...checkMandateRules(input.mandate, input.intent, input.now),
    ...checkBudget(input.mandate, input.debitAmount),
  ];
  return composeDecision({
    decisionId: input.decisionId,
    mandate: input.mandate,
    intent: input.intent,
    hardReasons,
    ...(hardReasons.length === 0
      ? {
          purposeCheck: applyConfidenceCap(
            input.mandate,
            evaluatePurposeCheck(input.mandate, input.intent, input.merchantResolution, input.merchantHistory),
            input.debitAmount,
          ),
        }
      : {}),
    evaluatedAt: input.now,
  });
}
