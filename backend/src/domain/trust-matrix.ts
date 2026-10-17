import type { CompasCategory, CorroborationTier } from "./merchant-category.ts";
import type { MerchantHistorySummary } from "./merchant-history.ts";

/**
 * The merchant declares its categories. The trust matrix gives each declared
 * category a confidence, from two axes: how independent evidence (Cámara de
 * Comercio, wallet KYB) corroborates the declaration, and what the shop's
 * payment history shows. See docs/adr/0007-merchant-confidence-matrix.md.
 */

/** Ordered: CONTRADICTED first, then weakest to strongest. */
export const HISTORY_GRADES = ["CONTRADICTED", "NONE", "EMERGING", "ESTABLISHED"] as const;
export type HistoryGrade = (typeof HISTORY_GRADES)[number];

/** Ordered weakest to strongest. */
export const MERCHANT_CONFIDENCE_LEVELS = ["CONTESTED", "LOW", "MEDIUM", "HIGH"] as const;
export type MerchantConfidence = (typeof MERCHANT_CONFIDENCE_LEVELS)[number];

/** What a mandate may set as its minimum. CONTESTED never passes. */
export const ACCEPTABLE_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type AcceptableConfidence = (typeof ACCEPTABLE_CONFIDENCE_LEVELS)[number];

export function confidenceRank(level: MerchantConfidence): number {
  return MERCHANT_CONFIDENCE_LEVELS.indexOf(level);
}

export type HistoryThreshold = {
  /** Distinct payers who confirmed a purchase. Volume from one payer counts once. */
  minConfirmingPayers: number;
  /** Whole days from the first confirmed purchase to the decision. */
  minSpanDays: number;
};

/** Cells, thresholds and the incompatibility table. Versioned data, checked at load. */
export type TrustMatrix = {
  version: string;
  history: {
    windowDays: number;
    emerging: HistoryThreshold;
    established: HistoryThreshold;
    /** CONTRADICTED when contradictingPayers >= minPayers and contradictions / paid >= numerator / denominator. */
    contradicted: { minPayers: number; ratioNumerator: number; ratioDenominator: number };
  };
  /** A line in one of these categories contradicts the key category. */
  incompatible: Readonly<Partial<Record<CompasCategory, readonly CompasCategory[]>>>;
  cells: Readonly<Record<CorroborationTier, Readonly<Record<HistoryGrade, MerchantConfidence>>>>;
};

/** One declared category's confidence, with every input needed to replay it. */
export type MerchantConfidenceRecord = {
  category: CompasCategory;
  corroboration: CorroborationTier;
  historyGrade: HistoryGrade;
  confidence: MerchantConfidence;
  matrixVersion: string;
  history: MerchantHistorySummary;
};
