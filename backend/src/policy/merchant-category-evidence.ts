import type { PurposePolicy } from "../domain/mandate.ts";
import type { CompasCategory, MerchantCategoryResolution } from "../domain/merchant-category.ts";
import type { MerchantHistorySummary } from "../domain/merchant-history.ts";
import type { PolicyReason } from "../domain/policy-decision.ts";
import {
  confidenceRank,
  type MerchantConfidenceRecord,
  type TrustMatrix,
} from "../domain/trust-matrix.ts";
import { gradeMerchantHistory } from "./merchant-history.ts";
import { merchantConfidence } from "./trust-matrix.ts";

/** The history side of the trust matrix, loaded by the caller at decision time. */
export type MerchantHistoryInput = {
  matrix: TrustMatrix;
  /** One summary per category from categoriesNeedingHistory, built with this matrix. */
  summaries: readonly MerchantHistorySummary[];
};

/**
 * Result of the `merchant_category_evidence` step. Not a PolicyDecision:
 * PASS only lets the policy engine go on to line items. It never means ALLOW.
 */
export type MerchantCategoryStepResult =
  | { result: "PASS"; matchedCategories: readonly CompasCategory[]; confidence: MerchantConfidenceRecord }
  | { result: "REVIEW"; reason: PolicyReason; confidence?: MerchantConfidenceRecord }
  | { result: "DENY"; reason: PolicyReason };

type StepPolicy = Pick<PurposePolicy, "eligibleCategories" | "merchantConfidence">;

/** Eligible categories the merchant declared. The caller loads a history summary for each. */
export function categoriesNeedingHistory(
  resolution: MerchantCategoryResolution,
  policy: Pick<PurposePolicy, "eligibleCategories">,
): CompasCategory[] {
  const eligible = new Set<CompasCategory>(policy.eligibleCategories);
  return resolution.declarations.flatMap((declared) => (eligible.has(declared.category) ? [declared.category] : []));
}

/**
 * Deterministic. Rows are checked top to bottom:
 * 1. a conflict or flag touches an eligible category        -> REVIEW, MERCHANT_EVIDENCE_CONFLICT
 * 2. the merchant declared no eligible category             -> DENY, MERCHANT_NOT_ELIGIBLE
 * 3. the best declared category's confidence is CONTESTED   -> REVIEW, MERCHANT_EVIDENCE_CONFLICT
 *    (independent evidence contradicts it) or MERCHANT_HISTORY_CONTRADICTS (history does)
 * 4. confidence at or above the mandate's minimum           -> PASS
 * 5. otherwise                                              -> REVIEW, MERCHANT_EVIDENCE_INSUFFICIENT
 *
 * The best category is the highest confidence, ties broken by COMPAS_CATEGORIES order.
 */
export function evaluateMerchantCategoryEvidence(
  resolution: MerchantCategoryResolution,
  policy: StepPolicy,
  history: MerchantHistoryInput,
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

  const candidates = resolution.declarations.filter((declared) => eligible.has(declared.category));
  if (candidates.length === 0) {
    return {
      result: "DENY",
      reason: {
        code: "MERCHANT_NOT_ELIGIBLE",
        message: "The merchant has not declared a category this mandate allows.",
      },
    };
  }

  const records = candidates.map((declared): MerchantConfidenceRecord => {
    const summary = history.summaries.find((candidate) => candidate.category === declared.category);
    if (!summary || summary.paypalMerchantId !== resolution.paypalMerchantId) {
      throw new Error(`No history summary for ${declared.category} at ${resolution.paypalMerchantId}.`);
    }
    const historyGrade = gradeMerchantHistory(summary, history.matrix);
    return {
      category: declared.category,
      corroboration: declared.corroboration,
      historyGrade,
      confidence: merchantConfidence(history.matrix, declared.corroboration, historyGrade),
      matrixVersion: history.matrix.version,
      history: summary,
    };
  });
  const best = records.reduce((top, record) =>
    confidenceRank(record.confidence) > confidenceRank(top.confidence) ? record : top,
  );

  if (best.confidence === "CONTESTED") {
    return {
      result: "REVIEW",
      reason:
        best.corroboration === "CONTRADICTED"
          ? {
              code: "MERCHANT_EVIDENCE_CONFLICT",
              message: "Independent evidence places the merchant outside the category it declared.",
            }
          : {
              code: "MERCHANT_HISTORY_CONTRADICTS",
              message: "Payers or the merchant's own sales contradict the category it declared.",
            },
      confidence: best,
    };
  }

  const minimum = confidenceRank(policy.merchantConfidence.minimum);
  const matched = records.filter((record) => confidenceRank(record.confidence) >= minimum);
  if (matched.length > 0) {
    return { result: "PASS", matchedCategories: matched.map((record) => record.category), confidence: best };
  }

  return {
    result: "REVIEW",
    reason: {
      code: "MERCHANT_EVIDENCE_INSUFFICIENT",
      message: `The merchant's declared category has ${best.confidence} confidence. This mandate needs ${policy.merchantConfidence.minimum}.`,
    },
    confidence: best,
  };
}
