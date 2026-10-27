/**
 * Builds the CUM search index in Elastic from INVIMA's "Código Único de
 * Medicamentos Vigentes" on datos.gov.co (resource i7cb-raxc).
 *
 *   npm run cum:index              active CUMs only (about 120k rows)
 *   npm run cum:index -- --all     every CUM, inactive included
 *   npm run cum:index -- --recreate   drop and rebuild the index first
 *   npm run cum:index -- --demo    the committed subset in data/seeds/cum, no download
 *
 * The index proposes candidates only. A catalog mapping counts when a
 * verifier reads the CUM from the dataset itself (SocrataCumRegistry), so a
 * stale index can miss a CUM but cannot make one verify.
 *
 * Needs ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY. With
 * ELASTIC_CUM_EMBEDDING_INFERENCE_ID set, documents also get a semantic field.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CumRecord } from "../src/domain/cum.ts";
import { JsonCumRegistry } from "../src/integrations/cum/json-cum-registry.ts";
import { CUM_DATASET_URL, cumOfRow, type CumRow, groupCumRows } from "../src/integrations/cum/socrata-cum-rows.ts";
import { readElasticConfig } from "../src/integrations/elastic/config.ts";
import { cumDocument, cumIndexDefinition } from "../src/integrations/elastic/cum-index.ts";
import { ElasticRestClient } from "../src/integrations/elastic/rest-client.ts";
import { step } from "./lib/smoke-io.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEMO_FILE = join(repoRoot, "data/seeds/cum/demo-cum.json");
const PAGE_SIZE = 20_000;
const BULK_DOCS = 1_000;
const FIELDS = [
  "expedientecum", "consecutivocum", "producto", "principioactivo", "cantidad", "unidadmedida",
  "formafarmaceutica", "atc", "descripcioncomercial", "cantidadcum", "estadocum", "estadoregistro",
];

const args = new Set(process.argv.slice(2));
const result = readElasticConfig();
if (!result.configured) {
  console.error(`Elastic is not configured: set ${result.missing.join(", ")} in backend/.env.`);
  process.exit(1);
}
const { config } = result;
const client = new ElasticRestClient({ config, timeoutMs: 120_000 });
const semantic = Boolean(config.cumEmbeddingInferenceId);
const indexPath = `/${encodeURIComponent(config.cumIndex)}`;

async function pageOfRows(offset: number, activeOnly: boolean): Promise<CumRow[]> {
  const url = new URL(CUM_DATASET_URL);
  url.searchParams.set("$select", FIELDS.join(","));
  url.searchParams.set("$order", "expedientecum,consecutivocum");
  url.searchParams.set("$limit", String(PAGE_SIZE));
  url.searchParams.set("$offset", String(offset));
  if (activeOnly) url.searchParams.set("$where", "estadocum='Activo'");
  const token = process.env.SOCRATA_APP_TOKEN?.trim();
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: token ? { "x-app-token": token } : {} });
    if (response.ok) return (await response.json()) as CumRow[];
    if (attempt >= 4) throw new Error(`datos.gov.co answered ${response.status} at offset ${offset}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
  }
}

async function index(records: readonly CumRecord[]): Promise<number> {
  let indexed = 0;
  for (let start = 0; start < records.length; start += BULK_DOCS) {
    const lines = records.slice(start, start + BULK_DOCS).flatMap((record) => [
      { index: { _index: config.cumIndex, _id: record.cum } },
      cumDocument(record, { semantic }),
    ]);
    indexed += (await client.bulk("CUM bulk index", lines)).items;
  }
  return indexed;
}

step(`Index ${config.cumIndex}${semantic ? ` (semantic: ${config.cumEmbeddingInferenceId})` : " (lexical only)"}`);
if (args.has("--recreate") && (await client.exists("CUM index check", indexPath))) {
  await client.request("CUM index delete", "DELETE", indexPath);
  console.log("Dropped the existing index.");
}
if (!(await client.exists("CUM index check", indexPath))) {
  await client.request(
    "CUM index create",
    "PUT",
    indexPath,
    cumIndexDefinition(semantic ? { embeddingInferenceId: config.cumEmbeddingInferenceId } : {}),
  );
  console.log("Created the index.");
}

let total = 0;
if (args.has("--demo")) {
  step("Load the demo subset (demo/test data)");
  total = await index(JsonCumRegistry.fromFile(DEMO_FILE).list());
} else {
  const activeOnly = !args.has("--all");
  step(`Download from datos.gov.co (${activeOnly ? "active CUMs" : "every CUM"})`);
  // Rows come ordered by CUM. The last CUM of a page may continue on the next, so it waits for it.
  let carry: CumRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await pageOfRows(offset, activeOnly);
    const all = [...carry, ...rows];
    if (rows.length < PAGE_SIZE) {
      total += await index(groupCumRows(all));
      break;
    }
    const lastCum = cumOfRow(all[all.length - 1]);
    carry = all.filter((row) => cumOfRow(row) === lastCum);
    total += await index(groupCumRows(all.filter((row) => cumOfRow(row) !== lastCum)));
    console.log(`  ${offset + rows.length} rows read, ${total} CUMs indexed`);
  }
}
await client.request("CUM index refresh", "POST", `${indexPath}/_refresh`);
console.log(`Done: ${total} CUM documents in ${config.cumIndex}.`);
