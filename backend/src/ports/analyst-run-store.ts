import type { AnalystJob } from "../application/analyst-jobs.ts";
import type { AnalystFinding } from "../domain/analyst.ts";

/**
 * A merchant's latest real analyst run and the findings shown with it. Kept
 * so that after a restart everyone still sees it, the cooldown still holds,
 * and its CUM pointers can be verified again without a model call. Merchant
 * data only: never a payer, a delegate or an errand.
 */
export type StoredAnalystRun = {
  /** The directory id. */
  merchantId: string;
  /** The PayPal account the findings name. A run for another account is stale. */
  paypalMerchantId: string;
  job: AnalystJob;
  findings: readonly AnalystFinding[];
};

export interface AnalystRunStore {
  /** Replaces the merchant's stored run. */
  save(run: StoredAnalystRun): Promise<void>;
  list(): Promise<readonly StoredAnalystRun[]>;
}
