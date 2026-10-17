import type { MerchantHistoryDeps } from "../../application/merchant-history.ts";
import type { MerchantObservationLog } from "../../ports/merchant-observation-log.ts";
import { subjectRefKey } from "../merchant-registry/subject-ref.ts";
import type { Database } from "../postgres/database.ts";
import { PostgresObservationLog } from "../postgres/postgres-observation-log.ts";
import { seedDemoMerchantHistory } from "./demo-history-seed.ts";
import { InMemoryObservationLog } from "./in-memory-observation-log.ts";
import { loadTrustMatrix } from "./json-trust-matrix.ts";
import { createPartyRefFn } from "./party-ref.ts";

export type MerchantHistoryService = MerchantHistoryDeps & {
  /** Number of demo observations seeded at startup. 0 when the seed is off. */
  demoObservations: number;
};

/**
 * Wires the observation log, on Postgres or in memory, and the trust matrix. The matrix is
 * checked here, so a bad seed fails at startup. Party refs use the same key
 * as NIT subject refs, under a different prefix.
 */
export async function createMerchantHistoryService(
  options: {
    env?: Record<string, string | undefined>;
    matrixFile?: string;
    now?: () => Date;
    /** With a database, the log is compas.merchant_observations. Without one, it is in memory. */
    database?: Database;
  } = {},
): Promise<MerchantHistoryService> {
  const env = options.env ?? process.env;
  const partyRef = createPartyRefFn(subjectRefKey(env, { persistent: Boolean(options.database) }));
  const matrix = loadTrustMatrix(options.matrixFile);
  const observations: MerchantObservationLog = options.database
    ? new PostgresObservationLog(options.database)
    : new InMemoryObservationLog();

  // The seeded purchases have no spending record, and compas.merchant_observations
  // requires one. Until the team decides how to seed history in Postgres, it is memory only.
  const demoSeedEnabled =
    !options.database && env.MERCHANT_CATEGORY_DEMO_SEED?.trim().toLowerCase() !== "false";
  const demoObservations = demoSeedEnabled
    ? await seedDemoMerchantHistory({ observations, partyRef, ...(options.now ? { now: options.now() } : {}) })
    : 0;

  return { observations, matrix, partyRef, demoObservations };
}
