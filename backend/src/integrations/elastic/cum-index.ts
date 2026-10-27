import type { CumCandidate, CumIngredient, CumRecord } from "../../domain/cum.ts";
import type { CumCandidateSearch } from "../../ports/cum-candidate-search.ts";
import type { ElasticRestClient } from "./rest-client.ts";

/**
 * The CUM search index: one document per CUM, built from INVIMA's public
 * dataset. It holds no merchant, payer, delegate or errand data. It only
 * proposes candidates. A verifier re-reads every CUM from the dataset itself.
 */

/** Product names are matched without accents or case: "Losartán" finds "LOSARTAN". */
const FOLDED = "compas_es_folded";

export function cumIndexDefinition(options: { embeddingInferenceId?: string } = {}) {
  const text = { type: "text", analyzer: FOLDED };
  return {
    settings: {
      analysis: {
        analyzer: { [FOLDED]: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] } },
      },
    },
    mappings: {
      dynamic: "strict",
      properties: {
        cum: { type: "keyword" },
        product: text,
        ingredients: {
          properties: {
            name: { ...text, fields: { keyword: { type: "keyword" } } },
            amount: { type: "keyword" },
            unit: { type: "keyword" },
          },
        },
        /** "LOSARTAN POTASICO 50 mg", one entry per ingredient, so strengths match as phrases. */
        ingredient_text: text,
        form: { ...text, fields: { keyword: { type: "keyword" } } },
        atc: { type: "keyword" },
        presentation: text,
        presentation_units: { type: "integer" },
        active: { type: "boolean" },
        registration_valid: { type: "boolean" },
        ...(options.embeddingInferenceId
          ? { semantic: { type: "semantic_text", inference_id: options.embeddingInferenceId } }
          : {}),
      },
    },
  };
}

function ingredientText(ingredient: CumIngredient): string {
  return `${ingredient.name} ${ingredient.amount} ${ingredient.unit}`.trim();
}

export function cumDocument(record: CumRecord, options: { semantic: boolean }) {
  return {
    cum: record.cum,
    product: record.product,
    ingredients: record.ingredients,
    ingredient_text: record.ingredients.map(ingredientText),
    form: record.form,
    ...(record.atc ? { atc: record.atc } : {}),
    ...(record.presentation ? { presentation: record.presentation } : {}),
    ...(record.presentationUnits ? { presentation_units: record.presentationUnits } : {}),
    active: record.active,
    registration_valid: record.registrationValid,
    ...(options.semantic
      ? { semantic: [record.product, ...record.ingredients.map(ingredientText), record.form].join(" · ") }
      : {}),
  };
}

type Hit = { _score?: number; _source?: Partial<ReturnType<typeof cumDocument>> };

function candidateOf(hit: Hit): CumCandidate | undefined {
  const source = hit._source;
  if (!source?.cum || !source.product || !Array.isArray(source.ingredients) || !source.form) return undefined;
  return {
    cum: source.cum,
    product: source.product,
    ingredients: source.ingredients,
    form: source.form,
    ...(source.presentation ? { presentation: source.presentation } : {}),
    score: typeof hit._score === "number" ? hit._score : 0,
  };
}

const MAX_QUERY_LENGTH = 300;

/**
 * Lexical search with accent folding and typo tolerance. With an embedding
 * endpoint, it fuses that with semantic search by reciprocal rank. Only
 * active CUMs with a valid registration are candidates.
 */
export class ElasticCumSearch implements CumCandidateSearch {
  readonly #client: Pick<ElasticRestClient, "request">;
  readonly #index: string;
  readonly #semantic: boolean;

  constructor(deps: { client: Pick<ElasticRestClient, "request">; index: string; semantic: boolean }) {
    this.#client = deps.client;
    this.#index = deps.index;
    this.#semantic = deps.semantic;
  }

  async search(text: string, options: { limit?: number } = {}): Promise<readonly CumCandidate[]> {
    const query = text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) return [];
    const size = Math.min(Math.max(options.limit ?? 5, 1), 20);
    const filter = [{ term: { active: true } }, { term: { registration_valid: true } }];
    const lexical = {
      bool: {
        must: [{
          multi_match: {
            query,
            fields: ["ingredients.name^4", "ingredient_text^3", "product^3", "form", "presentation"],
            fuzziness: "AUTO",
          },
        }],
        filter,
      },
    };
    const body = this.#semantic
      ? {
          size,
          retriever: {
            rrf: {
              retrievers: [
                { standard: { query: lexical } },
                { standard: { query: { bool: { must: [{ semantic: { field: "semantic", query } }], filter } } } },
              ],
            },
          },
          _source: { excludes: ["semantic"] },
        }
      : { size, query: lexical };
    const result = (await this.#client.request("CUM search", "POST", `/${encodeURIComponent(this.#index)}/_search`, body)) as {
      hits?: { hits?: Hit[] };
    };
    return (result.hits?.hits ?? []).flatMap((hit) => candidateOf(hit) ?? []);
  }
}
