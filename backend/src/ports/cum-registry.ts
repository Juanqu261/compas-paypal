import type { CumRecord } from "../domain/cum.ts";

/**
 * The source that attests a CUM: INVIMA's dataset as published. A verifier
 * reads the record here, never from the search index or a model, so a
 * mapping counts as INVIMA's evidence and not as "the AI said so".
 */
export interface CumRegistry {
  /** Every ingredient row of the presentation, grouped. Undefined when INVIMA has no such CUM. */
  getByCum(cum: string): Promise<CumRecord | undefined>;
  /** Where the record came from, for the mapping's audit trail. */
  readonly provenance: string;
}
