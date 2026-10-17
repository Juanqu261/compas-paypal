import { CORROBORATION_TIERS, type CorroborationTier } from "../domain/merchant-category.ts";
import {
  confidenceRank,
  HISTORY_GRADES,
  type HistoryGrade,
  MERCHANT_CONFIDENCE_LEVELS,
  type MerchantConfidence,
  type TrustMatrix,
} from "../domain/trust-matrix.ts";

export function merchantConfidence(
  matrix: TrustMatrix,
  corroboration: CorroborationTier,
  historyGrade: HistoryGrade,
): MerchantConfidence {
  return matrix.cells[corroboration][historyGrade];
}

/** Below an independent attester. History alone can never lift these to HIGH. */
const SELF_BACKED_TIERS: readonly CorroborationTier[] = ["UNCORROBORATED", "REGISTRY_UNBOUND"];
const ORDERED_TIERS = CORROBORATION_TIERS.filter((tier) => tier !== "CONTRADICTED");
const ORDERED_GRADES = HISTORY_GRADES.filter((grade) => grade !== "CONTRADICTED");

/**
 * The numbers in the matrix are data and can be tuned. These rules are code
 * and cannot be broken by a data file. Returns every broken rule.
 *
 * - A contradicted declaration or contradicted history is always CONTESTED.
 * - Only an independent attester reaches HIGH: a shop backed by its own
 *   declaration, even with a registry match through a self-typed NIT and long
 *   history, stays at MEDIUM or below. This keeps ADR 0005's protection
 *   against shops or fake customers manufacturing eligibility.
 * - Better evidence or better history never lowers confidence.
 * - Thresholds are positive integers, and ESTABLISHED asks at least as much as EMERGING.
 */
export function trustMatrixViolations(matrix: TrustMatrix): string[] {
  const problems: string[] = [];
  const cell = (tier: CorroborationTier, grade: HistoryGrade) => matrix.cells[tier]?.[grade];

  for (const tier of CORROBORATION_TIERS) {
    for (const grade of HISTORY_GRADES) {
      const value = cell(tier, grade);
      if (!(MERCHANT_CONFIDENCE_LEVELS as readonly unknown[]).includes(value)) {
        problems.push(`cells.${tier}.${grade} must be one of ${MERCHANT_CONFIDENCE_LEVELS.join(", ")}`);
      }
    }
  }
  if (problems.length > 0) return problems;

  for (const grade of HISTORY_GRADES) {
    if (cell("CONTRADICTED", grade) !== "CONTESTED") problems.push(`cells.CONTRADICTED.${grade} must be CONTESTED`);
  }
  for (const tier of CORROBORATION_TIERS) {
    if (cell(tier, "CONTRADICTED") !== "CONTESTED") problems.push(`cells.${tier}.CONTRADICTED must be CONTESTED`);
  }
  for (const tier of SELF_BACKED_TIERS) {
    for (const grade of HISTORY_GRADES) {
      if (cell(tier, grade) === "HIGH") problems.push(`cells.${tier}.${grade} may not be HIGH: only an independent attester reaches HIGH`);
    }
  }
  for (const tier of ORDERED_TIERS) {
    for (const grade of ORDERED_GRADES) {
      if (cell(tier, grade) === "CONTESTED") problems.push(`cells.${tier}.${grade} may be CONTESTED only when something contradicts it`);
    }
  }
  for (let t = 1; t < ORDERED_TIERS.length; t += 1) {
    for (const grade of ORDERED_GRADES) {
      if (confidenceRank(cell(ORDERED_TIERS[t], grade)) < confidenceRank(cell(ORDERED_TIERS[t - 1], grade))) {
        problems.push(`cells.${ORDERED_TIERS[t]}.${grade} is lower than cells.${ORDERED_TIERS[t - 1]}.${grade}`);
      }
    }
  }
  for (const tier of ORDERED_TIERS) {
    for (let g = 1; g < ORDERED_GRADES.length; g += 1) {
      if (confidenceRank(cell(tier, ORDERED_GRADES[g])) < confidenceRank(cell(tier, ORDERED_GRADES[g - 1]))) {
        problems.push(`cells.${tier}.${ORDERED_GRADES[g]} is lower than cells.${tier}.${ORDERED_GRADES[g - 1]}`);
      }
    }
  }

  const { windowDays, emerging, established, contradicted } = matrix.history;
  const positiveIntegers: [string, number][] = [
    ["history.windowDays", windowDays],
    ["history.emerging.minConfirmingPayers", emerging.minConfirmingPayers],
    ["history.established.minConfirmingPayers", established.minConfirmingPayers],
    ["history.contradicted.minPayers", contradicted.minPayers],
    ["history.contradicted.ratioNumerator", contradicted.ratioNumerator],
    ["history.contradicted.ratioDenominator", contradicted.ratioDenominator],
  ];
  for (const [name, value] of positiveIntegers) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} must be a positive integer`);
  }
  for (const [name, value] of [["history.emerging.minSpanDays", emerging.minSpanDays], ["history.established.minSpanDays", established.minSpanDays]] as const) {
    if (!Number.isInteger(value) || value < 0) problems.push(`${name} must be a non-negative integer`);
  }
  if (
    established.minConfirmingPayers < emerging.minConfirmingPayers ||
    established.minSpanDays < emerging.minSpanDays
  ) {
    problems.push("history.established must ask at least as much as history.emerging");
  }
  if (established.minSpanDays >= windowDays) {
    problems.push("history.established.minSpanDays must be shorter than history.windowDays");
  }
  return problems;
}
