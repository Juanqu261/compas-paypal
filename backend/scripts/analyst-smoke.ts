/**
 * The AI analyst on the demo catalogs, live: real Elastic search, the real
 * model (Claude with ANTHROPIC_API_KEY, else Elastic's), and the CUM source (datos.gov.co, or the demo subset
 * with CUM_REGISTRY=demo). Everything it writes stays in this process: the
 * trust log here is in memory, so nothing reaches the team's database.
 *
 *   npm run analyst:smoke                         both demo pharmacies
 *   npm run analyst:smoke -- demo-merchant-lookalike
 *
 * Needs ELASTICSEARCH_URL, ELASTICSEARCH_API_KEY, ANTHROPIC_API_KEY and a
 * built CUM index (npm run cum:index).
 */
import { runMerchantAnalysis } from "../src/application/run-merchant-analysis.ts";
import { InMemoryAnalystFindings } from "../src/integrations/analyst/in-memory-finding-repository.ts";
import { createAnalystModel, createCumRegistry } from "../src/integrations/analyst/create-analyst-layer.ts";
import { createElastic } from "../src/integrations/elastic/create-elastic.ts";
import { seedDemoCatalogs } from "../src/integrations/merchant-catalog/demo-catalog-seed.ts";
import { InMemoryCatalogMappings, InMemoryMerchantCatalogs } from "../src/integrations/merchant-catalog/in-memory-catalogs.ts";
import { createMerchantCategoryService } from "../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { DEMO_CATALOGS_DIR } from "../src/integrations/merchant-registry/data-paths.ts";
import { createDemoMerchantDirectory, DEMO_MERCHANT_IDS } from "../src/integrations/merchants/demo-merchant-directory.ts";
import { step } from "./lib/smoke-io.ts";

const elastic = createElastic();
if (elastic.missing.length > 0) {
  console.error(`Elastic is not configured: set ${elastic.missing.join(", ")} in backend/.env.`);
  process.exit(1);
}
const { model, vendor } = createAnalystModel(process.env, elastic);
console.log(`Analyst model: ${vendor}`);

// No database passed: the trust log is in memory whatever DATABASE_URL says, so a smoke run never writes the team's.
const categories = await createMerchantCategoryService({ logWarning: () => {} });
const merchants = createDemoMerchantDirectory();
const catalogs = new InMemoryMerchantCatalogs();
await seedDemoCatalogs({ file: `${DEMO_CATALOGS_DIR}/demo-catalogs.json`, merchants, catalogs });
const registry = createCumRegistry();
const mappings = new InMemoryCatalogMappings();
const findings = new InMemoryAnalystFindings();

const requested = process.argv.slice(2);
const merchantIds = requested.length > 0 ? requested : [DEMO_MERCHANT_IDS.drogueria, DEMO_MERCHANT_IDS.lookalike];

for (const merchantId of merchantIds) {
  const merchant = await merchants.getById(merchantId);
  if (!merchant) throw new Error(`Unknown merchant ${merchantId}`);
  step(`${merchant.displayName} (${merchantId})`);
  const resolution = await categories.registry.resolve(merchant.paypalMerchantId);
  const result = await runMerchantAnalysis(
    { paypalMerchantId: merchant.paypalMerchantId, declaredCategories: resolution.declarations.map((declared) => declared.category) },
    { catalogs, search: elastic.search, model, registry, mappings, findings, ingest: categories.ingest },
  );
  console.log(`Run ${result.runId}: ${result.status}, ${result.items} SKUs, ${result.verifiedMappings} verified, ${result.rejectedMappings} rejected, ${result.newFlags} new flags.`);
  for (const mapping of await mappings.listByMerchant(merchant.paypalMerchantId)) {
    const failed = mapping.checks.filter((check) => !check.passed).map((check) => `${check.check}: ${check.detail}`);
    console.log(`  ${mapping.skuId.padEnd(22)} ${mapping.cum.padEnd(12)} ${mapping.status}${failed.length ? `  (${failed.join("; ")})` : ""}`);
  }
  for (const finding of await findings.listByMerchant(merchant.paypalMerchantId)) {
    if (finding.kind === "JUDGMENT") console.log(`  FLAG ${finding.judgment} on ${finding.category}: ${finding.note} [${finding.citedSkuIds.join(", ")}]`);
  }
  const after = await categories.registry.resolve(merchant.paypalMerchantId);
  console.log(`  Flags on the trust log now: ${after.flags.length}`);
}
