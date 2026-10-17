import type { PurposePolicy } from "../domain/mandate.ts";
import type { CompasCategory, MerchantCategoryResolution } from "../domain/merchant-category.ts";
import type { PolicyReason } from "../domain/policy-decision.ts";

/**
 * Result of the `merchant_category_evidence` step. Not a PolicyDecision:
 * PASS only lets the policy engine go on to line items. It never means ALLOW.
 */
export type MerchantCategoryStepResult =
  | { result: "PASS"; matchedCategories: readonly CompasCategory[] }
  | { result: "REVIEW"; reason: PolicyReason }
  | { result: "DENY"; reason: PolicyReason };

/**
 * Deterministic. Rows are checked top to bottom:
 * 1. a conflict or flag touches an eligible category  -> REVIEW, MERCHANT_EVIDENCE_CONFLICT
 * 2. an eligible category at an accepted trust level  -> PASS
 * 3. an eligible category below the accepted levels   -> REVIEW, MERCHANT_EVIDENCE_INSUFFICIENT
 * 4. no eligible category                             -> DENY, MERCHANT_NOT_ELIGIBLE
 */
export function evaluateMerchantCategoryEvidence(
  resolution: MerchantCategoryResolution,
  policy: Pick<PurposePolicy, "eligibleCategories" | "acceptedTrustLevels">,
): MerchantCategoryStepResult {
  const eligible = new Set<CompasCategory>(policy.eligibleCategories);

  const contested =
    resolution.conflicts.some((conflict) => conflict.categories.some((category) => eligible.has(category))) ||
    resolution.flags.some((flag) => eligible.has(flag.category));
  if (contested) {
    return {
      result: "REVIEW",
      reason: {
        code: "MERCHANT_EVIDENCE_CONFLICT",
        message: "Merchant evidence is contradictory or flagged for an eligible category.",
      },
    };
  }

  const eligibleResolved = resolution.categories.filter((resolved) => eligible.has(resolved.category));
  const accepted = eligibleResolved.filter((resolved) =>
    policy.acceptedTrustLevels.includes(resolved.trustLevel),
  );
  if (accepted.length > 0) {
    return { result: "PASS", matchedCategories: accepted.map((resolved) => resolved.category) };
  }

  if (eligibleResolved.length > 0) {
    return {
      result: "REVIEW",
      reason: {
        code: "MERCHANT_EVIDENCE_INSUFFICIENT",
        message: "The merchant's eligible category is backed only by evidence this mandate does not accept.",
      },
    };
  }

  return {
    result: "DENY",
    reason: {
      code: "MERCHANT_NOT_ELIGIBLE",
      message: "No evidence places the merchant in a category this mandate allows.",
    },
  };
}
