import { loadMerchantHistory } from "../../src/application/merchant-history.ts";
import type { CumCandidate } from "../../src/domain/cum.ts";
import type { AcceptableConfidence } from "../../src/domain/trust-matrix.ts";
import { InMemoryAnalystFindings } from "../../src/integrations/analyst/in-memory-finding-repository.ts";
import { JsonCumRegistry } from "../../src/integrations/cum/json-cum-registry.ts";
import { seedDemoCatalogs } from "../../src/integrations/merchant-catalog/demo-catalog-seed.ts";
import { InMemoryCatalogMappings, InMemoryMerchantCatalogs } from "../../src/integrations/merchant-catalog/in-memory-catalogs.ts";
import { createMerchantHistoryService } from "../../src/integrations/merchant-history/create-merchant-history-service.ts";
import { createMerchantCategoryService } from "../../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { DEMO_CATALOGS_DIR, DEMO_CUM_FILE } from "../../src/integrations/merchant-registry/data-paths.ts";
import { createDemoMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import type { AnalystModel, AnalystTool } from "../../src/ports/analyst-model.ts";
import type { CumCandidateSearch } from "../../src/ports/cum-candidate-search.ts";
import { categoriesNeedingHistory, evaluateMerchantCategoryEvidence } from "../../src/policy/merchant-category-evidence.ts";
import { foldText, verifyCumMapping } from "../../src/policy/cum-mapping-verifier.ts";

export const NOW = new Date("2026-10-27T15:00:00Z");
export const MERCHANT_EMAIL = "pharmacy-business@example.com";
const quiet = { logWarning: () => {} };

export type ModelCall = { system: string; user: string; tool: AnalystTool };

/** A model double: answers each forced tool call with `respond`, and records the calls. Test code only. */
export function fakeModel(respond: (call: ModelCall) => unknown): AnalystModel & { calls: ModelCall[] } {
  const calls: ModelCall[] = [];
  return {
    calls,
    async callTool(input) {
      calls.push(input);
      return respond(input);
    },
  };
}

/**
 * A search double over the demo CUM subset: a record is a candidate when the
 * first word of each ingredient appears in the text. Lexical, like the index.
 */
export function fakeSearch(registry: JsonCumRegistry): CumCandidateSearch & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async search(text, options = {}) {
      queries.push(text);
      const words = new Set(foldText(text).split(" "));
      const hits: CumCandidate[] = registry
        .list()
        .filter((record) => record.active && record.registrationValid)
        .filter((record) => record.ingredients.every((ingredient) => words.has(foldText(ingredient.name).split(" ")[0])))
        .map((record) => {
          // Ranked like a lexical index: how many of the record's words the text contains.
          const recordWords = new Set(
            foldText([record.product, ...record.ingredients.map((i) => `${i.name} ${i.amount}`), record.presentation ?? ""].join(" ")).split(" "),
          );
          return {
            cum: record.cum,
            product: record.product,
            ingredients: record.ingredients,
            form: record.form,
            ...(record.presentation ? { presentation: record.presentation } : {}),
            score: [...recordWords].filter((word) => words.has(word)).length,
          };
        })
        .sort((a, b) => b.score - a.score);
      return hits.slice(0, options.limit ?? 5);
    },
  };
}

type BatchItem = { skuId: string; merchantText: string; candidates: { cum: string; product: string }[] };

/** The catalog batch as the analyst sent it to the model. */
export function batchOf(call: ModelCall): BatchItem[] {
  const json = /<catalog_data>\n([\s\S]*)\n<\/catalog_data>/.exec(call.user)?.[1];
  if (!json) throw new Error("no catalog data in the prompt");
  return JSON.parse(json) as BatchItem[];
}

const NOT_MEDICINE = /tarjeta|recarga|perfume|protector|term[oó]metro/i;

const DEMO_CUMS = JsonCumRegistry.fromFile(DEMO_CUM_FILE);

/**
 * A competent, honest reviewer: gift cards, top-ups, perfume, sunscreen and
 * thermometers are not medicines, and for a medicine it picks the candidate
 * that really is the product (the one the verifier would confirm), or null.
 */
export function honestCatalogReview(call: ModelCall): unknown {
  return {
    items: batchOf(call).map((item) => {
      if (NOT_MEDICINE.test(item.merchantText)) return { skuId: item.skuId, class: "NOT_MEDICINE", cum: null };
      const right = item.candidates.find((candidate) => {
        const record = DEMO_CUMS.list().find((known) => known.cum === candidate.cum);
        return verifyCumMapping(item.merchantText, record).status === "VERIFIED";
      });
      return { skuId: item.skuId, class: "MEDICINE", cum: right?.cum ?? null };
    }),
    lookalikeSignals: [],
  };
}

/** A careless reviewer: every medicine gets its first candidate, right or not. */
export function carelessCatalogReview(call: ModelCall): unknown {
  return {
    items: batchOf(call).map((item) =>
      NOT_MEDICINE.test(item.merchantText)
        ? { skuId: item.skuId, class: "NOT_MEDICINE", cum: null }
        : { skuId: item.skuId, class: "MEDICINE", cum: item.candidates[0]?.cum ?? null },
    ),
    lookalikeSignals: [],
  };
}

/** The demo world, in memory: trust log with the demo seed, catalogs, an empty mapping store. */
export async function analystBench(env: Record<string, string> = {}) {
  const categories = await createMerchantCategoryService({ env, ...quiet, now: () => NOW });
  const history = await createMerchantHistoryService({ env: {}, now: () => NOW });
  const merchants = createDemoMerchantDirectory({});
  const catalogs = new InMemoryMerchantCatalogs();
  await seedDemoCatalogs({ file: `${DEMO_CATALOGS_DIR}/demo-catalogs.json`, merchants, catalogs, now: NOW });
  const cumRegistry = JsonCumRegistry.fromFile(DEMO_CUM_FILE);
  const mappings = new InMemoryCatalogMappings();
  const findings = new InMemoryAnalystFindings();

  /** The merchant step, as the purchase flow runs it, for a MEDICATION mandate. */
  async function medicationStep(paypalMerchantId: string, minimum: AcceptableConfidence = "HIGH") {
    const policy = { eligibleCategories: ["MEDICATION" as const], merchantConfidence: { minimum } };
    const resolution = await categories.registry.resolve(paypalMerchantId);
    const merchantHistory = await loadMerchantHistory(
      paypalMerchantId,
      categoriesNeedingHistory(resolution, policy),
      NOW,
      history,
    );
    return { resolution, step: evaluateMerchantCategoryEvidence(resolution, policy, merchantHistory) };
  }

  return { categories, merchants, catalogs, cumRegistry, mappings, findings, medicationStep };
}
