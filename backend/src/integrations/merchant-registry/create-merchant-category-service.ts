import {
  ingestCategoryClaim,
  type IngestCategoryClaimInput,
  type IngestionResult,
} from "../../application/ingest-category-claim.ts";
import { normalizeWalletAddressUrl } from "../../domain/merchant-identifiers.ts";
import type { CategorySource } from "../../domain/merchant-category.ts";
import type { CategorySourceRegistry } from "../../ports/category-source-registry.ts";
import type { MerchantRegistry } from "../../ports/merchant-registry.ts";
import type { MerchantTrustLog } from "../../ports/merchant-trust-log.ts";
import type { Database } from "../postgres/database.ts";
import { PostgresTrustLog } from "../postgres/postgres-trust-log.ts";
import { verifyClaimSignature } from "./claim-signature.ts";
import { CATEGORY_MAPPINGS_DIR, DEMO_CATEGORY_SOURCES_FILE } from "./data-paths.ts";
import {
  DEMO_KEY_REF,
  generateDemoSigningKey,
  seedDemoMerchantCategories,
} from "./demo-category-seed.ts";
import { InMemoryTrustLog } from "./in-memory-trust-log.ts";
import { loadCategoryMappings } from "./json-category-mappings.ts";
import { loadCategorySources, StaticCategorySourceRegistry } from "./static-source-registry.ts";
import { createSubjectRefFn, subjectRefKey } from "./subject-ref.ts";
import { TrustLogMerchantRegistry } from "./trust-log-merchant-registry.ts";

export type MerchantCategoryService = {
  ingest(input: IngestCategoryClaimInput): Promise<IngestionResult>;
  registry: MerchantRegistry;
  sources: CategorySourceRegistry;
  /** Number of demo submissions ingested at startup. 0 when the seed is off. */
  demoSubmissions: number;
};

export type CreateMerchantCategoryServiceOptions = {
  env?: Record<string, string | undefined>;
  logWarning?: (message: string) => void;
  mappingsDir?: string;
  demoSourcesFile?: string;
  now?: () => Date;
  /** With a database, the trust log is compas.trust_log_entries. Without one, it is in memory. */
  database?: Database;
};

/**
 * Wires the merchant category service, on Postgres or in memory.
 * Mapping tables and source files are checked here, so a bad seed fails at startup.
 */
export async function createMerchantCategoryService(
  options: CreateMerchantCategoryServiceOptions = {},
): Promise<MerchantCategoryService> {
  const env = options.env ?? process.env;
  const warn = options.logWarning ?? (() => {});

  if (!options.database && !env.MERCHANT_SUBJECT_HMAC_KEY?.trim()) {
    warn(
      "MERCHANT_SUBJECT_HMAC_KEY is not set. Using a random key for this process. The trust log is in memory, so nothing outlives it anyway.",
    );
  }
  const subjectRef = createSubjectRefFn(subjectRefKey(env, { persistent: Boolean(options.database) }));

  const demoSeedEnabled = env.MERCHANT_CATEGORY_DEMO_SEED?.trim().toLowerCase() !== "false";
  const demoKey = demoSeedEnabled ? generateDemoSigningKey() : undefined;
  const sourceList: CategorySource[] = demoKey
    ? loadCategorySources(
        options.demoSourcesFile ?? DEMO_CATEGORY_SOURCES_FILE,
        new Map([[DEMO_KEY_REF, demoKey.publicKeyJwk]]),
      )
    : [];
  const sources = new StaticCategorySourceRegistry(sourceList);

  const trustLog: MerchantTrustLog = options.database
    ? new PostgresTrustLog(options.database)
    : new InMemoryTrustLog();
  const mappings = loadCategoryMappings(options.mappingsDir ?? CATEGORY_MAPPINGS_DIR);

  const ingest = (input: IngestCategoryClaimInput) =>
    ingestCategoryClaim(input, {
      sources,
      trustLog,
      verifySignature: verifyClaimSignature,
      subjectRef,
      ...(options.now ? { now: options.now } : {}),
    });

  let demoSubmissions = 0;
  if (demoKey) {
    const wallet = (name: string) => {
      const configured = env[name]?.trim();
      return configured ? normalizeWalletAddressUrl(configured) : undefined;
    };
    const testNetworkMerchantWallet = wallet("DEMO_MERCHANT_WALLET_ADDRESS");
    const testNetworkLiquorWallet = wallet("DEMO_LIQUOR_WALLET_ADDRESS");
    demoSubmissions = await seedDemoMerchantCategories({
      ingest,
      key: demoKey,
      ...(testNetworkMerchantWallet ? { testNetworkMerchantWallet } : {}),
      ...(testNetworkLiquorWallet ? { testNetworkLiquorWallet } : {}),
      ...(options.now ? { now: options.now() } : {}),
    });
  }

  return {
    ingest,
    registry: new TrustLogMerchantRegistry({
      trustLog,
      sources,
      mappings,
      ...(options.now ? { now: options.now } : {}),
    }),
    sources,
    demoSubmissions,
  };
}
