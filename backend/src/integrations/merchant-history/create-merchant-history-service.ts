import type { MerchantHistoryDeps } from "../../application/merchant-history.ts";
import { ephemeralSubjectRefKey } from "../merchant-registry/subject-ref.ts";
import { seedDemoMerchantHistory } from "./demo-history-seed.ts";
import { InMemoryObservationLog } from "./in-memory-observation-log.ts";
import { loadTrustMatrix } from "./json-trust-matrix.ts";
import { createPartyRefFn } from "./party-ref.ts";

export type MerchantHistoryService = MerchantHistoryDeps & {
  /** Number of demo observations seeded at startup. 0 when the seed is off. */
  demoObservations: number;
};

/**
 * Wires the in-memory observation log and the trust matrix. The matrix is
 * checked here, so a bad seed fails at startup. Party refs use the same key
 * as NIT subject refs, under a different prefix.
 */
export async function createMerchantHistoryService(
  options: {
    env?: Record<string, string | undefined>;
    matrixFile?: string;
    now?: () => Date;
  } = {},
): Promise<MerchantHistoryService> {
  const env = options.env ?? process.env;
  const key = env.MERCHANT_SUBJECT_HMAC_KEY?.trim();
  const partyRef = createPartyRefFn(key || ephemeralSubjectRefKey());
  const matrix = loadTrustMatrix(options.matrixFile);
  const observations = new InMemoryObservationLog();

  const demoSeedEnabled = env.MERCHANT_CATEGORY_DEMO_SEED?.trim().toLowerCase() !== "false";
  const demoObservations = demoSeedEnabled
    ? await seedDemoMerchantHistory({ observations, partyRef, ...(options.now ? { now: options.now() } : {}) })
    : 0;

  return { observations, matrix, partyRef, demoObservations };
}
