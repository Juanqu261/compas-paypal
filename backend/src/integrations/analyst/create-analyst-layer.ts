import { AnalystJobQueue } from "../../application/analyst-jobs.ts";
import { respondToJudgment, withdrawJudgment } from "../../application/analyst-appeals.ts";
import { bindMerchantCertificate } from "../../application/bind-merchant-certificate.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "../../application/ingest-category-claim.ts";
import { InMemoryMerchantAccountVerifications, MerchantIdentityService } from "../../application/merchant-identity.ts";
import { runMerchantAnalysis } from "../../application/run-merchant-analysis.ts";
import { notImplemented } from "../../lib/not-implemented.ts";
import type { CamaraRecord, CamaraVerifier } from "../../ports/camara-verifier.ts";
import type { CumRegistry } from "../../ports/cum-registry.ts";
import type { MerchantDirectory } from "../../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../../ports/merchant-registry.ts";
import { FixtureCamaraVerifier } from "../camara/fixture-camara-verifier.ts";
import { JsonCumRegistry } from "../cum/json-cum-registry.ts";
import { SocrataCumRegistry } from "../cum/socrata-cum-registry.ts";
import type { AnalystModel } from "../../ports/analyst-model.ts";
import { ClaudeAnalystModel } from "../anthropic/claude-analyst-model.ts";
import { createElastic, type ElasticSetup } from "../elastic/create-elastic.ts";
import { seedDemoCatalogs } from "../merchant-catalog/demo-catalog-seed.ts";
import { InMemoryCatalogMappings, InMemoryMerchantCatalogs } from "../merchant-catalog/in-memory-catalogs.ts";
import { DEMO_CAMARA_DIR, DEMO_CATALOGS_DIR, DEMO_CUM_FILE } from "../merchant-registry/data-paths.ts";
import { createPayPalIdentityGateway } from "../paypal/paypal-identity-gateway.ts";
import { InMemoryAnalystFindings } from "./in-memory-finding-repository.ts";

/** Used when no Cámara is configured. It never confirms a certificate. */
export class UnimplementedCamaraVerifier implements CamaraVerifier {
  readonly simulated = false;
  verify(): Promise<CamaraRecord | undefined> {
    return notImplemented("CamaraVerifier.verify");
  }
}

/**
 * The CUM source: INVIMA's dataset on datos.gov.co, or with CUM_REGISTRY=demo
 * the committed subset (demo/test data) for offline demos and tests.
 */
export function createCumRegistry(env: NodeJS.ProcessEnv = process.env): CumRegistry {
  if (env.CUM_REGISTRY?.trim().toLowerCase() === "demo") return JsonCumRegistry.fromFile(DEMO_CUM_FILE);
  const appToken = env.SOCRATA_APP_TOKEN?.trim();
  return new SocrataCumRegistry(appToken ? { appToken } : {});
}

/**
 * The analyst's and the errand drafter's model: Claude through the Claude
 * API when ANTHROPIC_API_KEY is set, else Elastic's Inference API (which
 * throws when Elastic isn't configured).
 */
export function createAnalystModel(
  env: NodeJS.ProcessEnv,
  elastic: ElasticSetup,
): { model: AnalystModel; vendor: "claude" | "elastic" } {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { model: elastic.model, vendor: "elastic" };
  const model = env.ANTHROPIC_ANALYST_MODEL?.trim();
  return { model: new ClaudeAnalystModel({ apiKey, ...(model ? { model } : {}) }), vendor: "claude" };
}

/**
 * Wires the analyst, catalogs, CUM mapping and the Cámara binding with Log in
 * with PayPal. Stores are in memory. Errands belong to each visitor's demo
 * workspace, which drafts them with the `model` and `elastic.search` here. Elastic, the model and Log
 * in with PayPal throw when they are not configured, never fake.
 */
export async function createAnalystLayer(options: {
  env?: NodeJS.ProcessEnv;
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
  /** demo/test data: seed the demo catalogs and use the simulated Cámara. */
  demo: boolean;
  logWarning?: (message: string) => void;
  elastic?: ElasticSetup;
}) {
  const env = options.env ?? process.env;
  const warn = options.logWarning ?? (() => {});
  const elastic = options.elastic ?? createElastic({ env });
  const { model, vendor: modelVendor } = createAnalystModel(env, elastic);
  const cumRegistry = createCumRegistry(env);
  const catalogs = new InMemoryMerchantCatalogs();
  const mappings = new InMemoryCatalogMappings();
  const findings = new InMemoryAnalystFindings();
  const camara: CamaraVerifier & { certificateText?: (merchantId: string) => string | undefined } = options.demo
    ? new FixtureCamaraVerifier({ dir: DEMO_CAMARA_DIR, env })
    : new UnimplementedCamaraVerifier();

  let demoCatalogItems = 0;
  if (options.demo) {
    demoCatalogItems = await seedDemoCatalogs({
      file: `${DEMO_CATALOGS_DIR}/demo-catalogs.json`,
      merchants: options.merchants,
      catalogs,
    });
    if (!env.DEMO_MERCHANT_PAYPAL_EMAIL?.trim()) {
      warn("DEMO_MERCHANT_PAYPAL_EMAIL is not set: Droguería Central's demo certificate has no email, so it can never bind.");
    }
  }

  const analyze = async (merchantId: string) => {
    const merchant = await options.merchants.getById(merchantId);
    if (!merchant) throw new Error("Unknown merchant");
    const resolution = await options.registry.resolve(merchant.paypalMerchantId);
    return runMerchantAnalysis(
      {
        paypalMerchantId: merchant.paypalMerchantId,
        declaredCategories: resolution.declarations.map((declared) => declared.category),
      },
      { catalogs, search: elastic.search, model, registry: cumRegistry, mappings, findings, ingest: options.ingest },
    );
  };

  const paypalIdentity = createPayPalIdentityGateway({ env });
  const verifications = new InMemoryMerchantAccountVerifications();
  const identity = new MerchantIdentityService({ paypal: paypalIdentity.gateway, merchants: options.merchants, verifications });

  return {
    elastic,
    model,
    modelVendor,
    cumRegistry,
    catalogs,
    mappings,
    findings,
    camara,
    identity,
    identityConfigured: paypalIdentity.configured,
    demoCatalogItems,
    jobs: new AnalystJobQueue({ run: analyze, logWarning: warn }),
    bindCertificate: (paypalMerchantId: string, certificateText: unknown) =>
      bindMerchantCertificate(
        { paypalMerchantId, certificateText },
        { model, camara, verifications, findings, ingest: options.ingest },
      ),
    respond: (findingId: string, paypalMerchantId: string, text: unknown) =>
      respondToJudgment({ findingId, paypalMerchantId, text }, { findings }),
    withdraw: (findingId: string, reason: unknown) => withdrawJudgment({ findingId, reason }, { findings, ingest: options.ingest }),
  };
}
