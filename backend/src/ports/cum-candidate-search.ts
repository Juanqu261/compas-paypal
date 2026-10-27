import type { CumCandidate } from "../domain/cum.ts";

/**
 * Finds CUM records that might match a product text. A finder, not a
 * source: a candidate is never evidence until a verifier reads the CUM from
 * a CumRegistry and checks it against the text.
 */
export interface CumCandidateSearch {
  search(text: string, options?: { limit?: number }): Promise<readonly CumCandidate[]>;
}
