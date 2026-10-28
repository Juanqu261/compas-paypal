import { createHash, randomUUID } from "node:crypto";
import type { AnalystFinding, CumMappingPointer, ItemClass, Judgment, JudgmentKind } from "../domain/analyst.ts";
import { catalogItemText } from "../domain/merchant-catalog.ts";
import type { CompasCategory } from "../domain/merchant-category.ts";
import type { AnalystFindingRepository } from "../ports/analyst-finding-repository.ts";
import type { AnalystModel } from "../ports/analyst-model.ts";
import type { CatalogMappingRepository } from "../ports/catalog-mapping-repository.ts";
import type { CumCandidateSearch } from "../ports/cum-candidate-search.ts";
import type { CumRegistry } from "../ports/cum-registry.ts";
import type { MerchantCatalogRepository } from "../ports/merchant-catalog.ts";
import {
  type CatalogBatchItem,
  CATALOG_REVIEW_SYSTEM,
  CATALOG_REVIEW_TOOL,
  type CatalogReview,
  catalogReviewPrompt,
  parseCatalogReview,
} from "./analyst-output.ts";
import { verifyCatalogMapping } from "./catalog-mappings.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "./ingest-category-claim.ts";

/** The analyst's own trust-log source. It may submit FLAG entries only. */
export const ANALYST_SOURCE_ID = "compas-analyst";
/** Versions the deterministic rules that turn the model's item classes into a flag. */
export const ANALYST_RULES_VERSION = "analyst-rules.1";

const BATCH_SIZE = 10;
const CANDIDATES_PER_SKU = 5;
/** CATALOG_OFF_PURPOSE: at least this many SKUs, and at least a third of the catalog, are not medicines. */
const OFF_PURPOSE_MIN_ITEMS = 2;
const OFF_PURPOSE_RATIO = { numerator: 1, denominator: 3 };

export type MerchantAnalysisDeps = {
  catalogs: MerchantCatalogRepository;
  search: CumCandidateSearch;
  model: AnalystModel;
  /** The CUM source a pointer is verified against. Never the search index. */
  registry: CumRegistry;
  mappings: CatalogMappingRepository;
  findings: AnalystFindingRepository;
  /** The one ingestion path into the trust log. */
  ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
  now?: () => Date;
  newId?: () => string;
};

/**
 * One SKU as this run saw it, for the demo's view of the run. The class and
 * the CUM are the model's; the outcome is the verifier's. Merchant data only.
 */
export type AnalyzedSku = {
  skuId: string;
  name: string;
  /** How many CUM candidates the search index proposed. Proposals, not evidence. */
  candidates: number;
  itemClass: ItemClass;
  cum?: string;
  outcome?: "VERIFIED" | "REJECTED";
};

export type MerchantAnalysisResult = {
  runId: string;
  status: "COMPLETED" | "NO_CATALOG" | "NOT_APPLICABLE";
  items: number;
  verifiedMappings: number;
  rejectedMappings: number;
  /** Flags this run added to the trust log. A flag an earlier run raised is not counted again. */
  newFlags: number;
  skus: readonly AnalyzedSku[];
};

type PendingJudgment = { judgment: JudgmentKind; citedSkuIds: readonly string[]; note: string };

/**
 * The deterministic rule over the model's item classes. The classes are a
 * judgment, so the most this can do is flag.
 */
export function offPurposeJudgment(review: CatalogReview): PendingJudgment | undefined {
  const off = review.items.filter((item) => item.itemClass === "NOT_MEDICINE");
  const enough =
    off.length >= OFF_PURPOSE_MIN_ITEMS &&
    off.length * OFF_PURPOSE_RATIO.denominator >= review.items.length * OFF_PURPOSE_RATIO.numerator;
  if (!enough) return undefined;
  return {
    judgment: "CATALOG_OFF_PURPOSE",
    citedSkuIds: off.map((item) => item.skuId),
    note: `${off.length} of ${review.items.length} listed products are not medicines.`,
  };
}

/**
 * The AI analyst on one merchant's catalog, ahead of time and never inside a
 * checkout. It calls no PayPal port and sees no errand, payer or purchase.
 *
 * 1. For each batch of SKUs: CUM candidates from search, then one forced tool
 *    call. Every batch is parsed before anything is written, so malformed
 *    output writes nothing.
 * 2. Each proposed CUM (a pointer) is re-read from the CUM registry and checked
 *    by the deterministic verifier. Only VERIFIED mappings count.
 * 3. Judgments (too many non-medicines, lookalike signals) become FLAGs on the
 *    declared MEDICATION category through the one ingestion path. A flag turns
 *    the category into REVIEW. A judgment never adds support, and the analyst
 *    never withdraws a flag: a human reviewer does.
 */
export async function runMerchantAnalysis(
  input: { paypalMerchantId: string; declaredCategories: readonly CompasCategory[] },
  deps: MerchantAnalysisDeps,
): Promise<MerchantAnalysisResult> {
  const runId = `run-${(deps.newId ?? randomUUID)()}`;
  const now = () => deps.now?.() ?? new Date();
  const newId = deps.newId ?? randomUUID;
  const empty = { runId, items: 0, verifiedMappings: 0, rejectedMappings: 0, newFlags: 0, skus: [] };

  // CUM mapping and these judgments are about medicines. Other categories have no analyst yet.
  if (!input.declaredCategories.includes("MEDICATION")) return { ...empty, status: "NOT_APPLICABLE" };
  const catalog = await deps.catalogs.get(input.paypalMerchantId);
  if (!catalog || catalog.items.length === 0) return { ...empty, status: "NO_CATALOG" };

  // 1. Model calls. Nothing is written until every batch parsed.
  const reviews: { batch: CatalogBatchItem[]; review: CatalogReview }[] = [];
  for (let start = 0; start < catalog.items.length; start += BATCH_SIZE) {
    const batch: CatalogBatchItem[] = [];
    for (const item of catalog.items.slice(start, start + BATCH_SIZE)) {
      const text = catalogItemText(item);
      batch.push({ skuId: item.skuId, text, candidates: await deps.search.search(text, { limit: CANDIDATES_PER_SKU }) });
    }
    const raw = await deps.model.callTool({
      system: CATALOG_REVIEW_SYSTEM,
      user: catalogReviewPrompt(batch),
      tool: CATALOG_REVIEW_TOOL,
    });
    reviews.push({ batch, review: parseCatalogReview(raw, batch) });
  }
  const whole: CatalogReview = {
    items: reviews.flatMap(({ review }) => review.items),
    lookalikeSignals: reviews.flatMap(({ review }) => review.lookalikeSignals),
  };

  // 2. Pointers, each verified against the source.
  const findings: AnalystFinding[] = [];
  let verifiedMappings = 0;
  let rejectedMappings = 0;
  const items = new Map(catalog.items.map((item) => [item.skuId, item]));
  const outcomes = new Map<string, { cum: string; outcome: "VERIFIED" | "REJECTED" }>();
  for (const reviewed of whole.items) {
    if (!reviewed.cum) continue;
    const findingId = `finding-${newId()}`;
    const mapping = await verifyCatalogMapping(
      { paypalMerchantId: input.paypalMerchantId, item: items.get(reviewed.skuId)!, cum: reviewed.cum, findingId },
      { registry: deps.registry, mappings: deps.mappings, now },
    );
    if (mapping.status === "VERIFIED") verifiedMappings += 1;
    else rejectedMappings += 1;
    outcomes.set(reviewed.skuId, { cum: mapping.cum, outcome: mapping.status });
    findings.push({
      kind: "POINTER",
      pointer: "CUM_MAPPING",
      id: findingId,
      runId,
      paypalMerchantId: input.paypalMerchantId,
      skuId: reviewed.skuId,
      cum: mapping.cum,
      outcome: mapping.status,
      recordedAt: mapping.verifiedAt,
    } satisfies CumMappingPointer);
  }

  // 3. Judgments, each one FLAG on MEDICATION.
  const pending: PendingJudgment[] = [
    ...(offPurposeJudgment(whole) ? [offPurposeJudgment(whole)!] : []),
    ...whole.lookalikeSignals.map((signal) => ({ judgment: "LOOKALIKE_SIGNALS" as const, ...signal })),
  ];
  let newFlags = 0;
  for (const judgment of pending) {
    const flag = await raiseFlag(input.paypalMerchantId, "MEDICATION", judgment, deps);
    if (flag.duplicate && (await deps.findings.findJudgmentByFlag(flag.entryId))) continue;
    if (!flag.duplicate) newFlags += 1;
    findings.push({
      kind: "JUDGMENT",
      id: `finding-${newId()}`,
      runId,
      paypalMerchantId: input.paypalMerchantId,
      judgment: judgment.judgment,
      category: "MEDICATION",
      citedSkuIds: judgment.citedSkuIds,
      note: judgment.note,
      flagEntryId: flag.entryId,
      flagSubmissionId: flag.submissionId,
      status: "OPEN",
      recordedAt: now().toISOString(),
    } satisfies Judgment);
  }

  await deps.findings.append(findings);
  const candidates = new Map(reviews.flatMap(({ batch }) => batch.map((item) => [item.skuId, item.candidates.length] as const)));
  const skus = whole.items.map((reviewed): AnalyzedSku => ({
    skuId: reviewed.skuId,
    name: items.get(reviewed.skuId)!.name,
    candidates: candidates.get(reviewed.skuId) ?? 0,
    itemClass: reviewed.itemClass,
    ...outcomes.get(reviewed.skuId),
  }));
  return { runId, status: "COMPLETED", items: whole.items.length, verifiedMappings, rejectedMappings, newFlags, skus };
}

/**
 * One FLAG through the ingestion path. The submission id is a digest of what
 * the flag says, so a re-run that finds the same thing gets the same entry
 * back instead of a second flag, and a flag a reviewer withdrew is not raised
 * again on the same evidence.
 */
async function raiseFlag(
  paypalMerchantId: string,
  category: CompasCategory,
  judgment: PendingJudgment,
  deps: Pick<MerchantAnalysisDeps, "ingest">,
): Promise<{ entryId: string; submissionId: string; duplicate: boolean }> {
  const note = `${judgment.judgment}: ${judgment.note}`.slice(0, 280);
  const digest = createHash("sha256")
    .update(JSON.stringify([paypalMerchantId, category, judgment.judgment, [...judgment.citedSkuIds].sort(), note]))
    .digest("hex")
    .slice(0, 32);
  const submission = {
    schemaVersion: "1",
    sourceId: ANALYST_SOURCE_ID,
    submissionId: `analyst-flag-${digest}`,
    type: "FLAG",
    paypalMerchantId,
    category,
    note,
  };
  const result = await deps.ingest({ body: new TextEncoder().encode(JSON.stringify(submission)), transport: "PULL" });
  if (!result.ok) throw new Error(`The trust log refused the analyst's flag: ${result.code} ${result.message}`);
  return { entryId: result.entryId, submissionId: submission.submissionId, duplicate: result.duplicate };
}
