import { AnalystJobQueue, DEFAULT_RERUN_COOLDOWN_MS } from "../../application/analyst-jobs.ts";
import { respondToJudgment, withdrawJudgment } from "../../application/analyst-appeals.ts";
import { bindMerchantCertificate } from "../../application/bind-merchant-certificate.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "../../application/ingest-category-claim.ts";
import { InMemoryMerchantAccountVerifications, MerchantIdentityService } from "../../application/merchant-identity.ts";
import { verifyCatalogMapping } from "../../application/catalog-mappings.ts";
import { runMerchantAnalysis } from "../../application/run-merchant-analysis.ts";
import type { AnalystRunStore } from "../../ports/analyst-run-store.ts";
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
import { InMemoryAnalystRunStore } from "./in-memory-analyst-run-store.ts";
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

/** COMPAS_ANALYST_RERUN_HOURS: how long a real run is shown before a new live run of that merchant may start. 0 turns it off. */
export function readRerunCooldownMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.COMPAS_ANALYST_RERUN_HOURS?.trim();
  const hours = raw ? Number(raw) : NaN;
  return Number.isFinite(hours) && hours >= 0 ? hours * 60 * 60 * 1000 : DEFAULT_RERUN_COOLDOWN_MS;
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
  /** Where the latest real run per merchant is kept. In memory by default. */
  runs?: AnalystRunStore;
}) {
  const env = options.env ?? process.env;
  const warn = options.logWarning ?? (() => {});
  const elastic = options.elastic ?? createElastic({ env });
  const { model, vendor: modelVendor } = createAnalystModel(env, elastic);
  const cumRegistry = createCumRegistry(env);
  const catalogs = new InMemoryMerchantCatalogs();
  const mappings = new InMemoryCatalogMappings();
  const findings = new InMemoryAnalystFindings();
  const runs = options.runs ?? new InMemoryAnalystRunStore();
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

  const jobs = new AnalystJobQueue({
    run: analyze,
    logWarning: warn,
    cooldownMs: readRerunCooldownMs(env),
    onCompleted: async (job) => {
      const merchant = await options.merchants.getById(job.merchantId);
      if (!merchant) return;
      await runs.save({
        merchantId: job.merchantId,
        paypalMerchantId: merchant.paypalMerchantId,
        job,
        findings: await findings.listByMerchant(merchant.paypalMerchantId),
      });
    },
  });

  /**
   * Brings back each merchant's latest real run after a restart: the job (and
   * so its cooldown) and its findings. Its CUM pointers are verified again
   * against the CUM source by the deterministic verifier, as a fresh run's
   * are: a stored mapping is never trusted by itself. No model is called. A
   * run stored for another PayPal account than the merchant's current one is
   * stale and skipped. Returns how many runs came back.
   */
  const restoreRuns = async (): Promise<number> => {
    let stored;
    try {
      stored = await runs.list();
    } catch (error) {
      warn(`Analyst runs could not be read (${error instanceof Error ? error.message : "error"}). Starting without them.`);
      return 0;
    }
    let restored = 0;
    for (const run of stored) {
      const merchant = await options.merchants.getById(run.merchantId);
      if (!merchant || merchant.paypalMerchantId !== run.paypalMerchantId) continue;
      jobs.restore(run.job);
      const fresh = [];
      for (const finding of run.findings) if (!(await findings.get(finding.id))) fresh.push(finding);
      await findings.append(fresh);
      for (const finding of run.findings) {
        if (finding.kind !== "POINTER" || finding.pointer !== "CUM_MAPPING" || finding.runId !== run.job.result?.runId) continue;
        const item = await catalogs.getItem(merchant.paypalMerchantId, finding.skuId);
        if (!item) continue;
        try {
          await verifyCatalogMapping(
            { paypalMerchantId: merchant.paypalMerchantId, item, cum: finding.cum, findingId: finding.id },
            { registry: cumRegistry, mappings },
          );
        } catch (error) {
          warn(`CUM pointer ${finding.id} could not be verified again: ${error instanceof Error ? error.name : "error"}`);
        }
      }
      restored += 1;
    }
    return restored;
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
    jobs,
    restoreRuns,
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
