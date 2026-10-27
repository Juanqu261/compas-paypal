import { notImplemented } from "../../lib/not-implemented.ts";
import type { FetchLike } from "../../lib/fetch-like.ts";
import type { AnalystModel } from "../../ports/analyst-model.ts";
import type { CumCandidateSearch } from "../../ports/cum-candidate-search.ts";
import { readElasticConfig } from "./config.ts";
import { ElasticCumSearch } from "./cum-index.ts";
import { ElasticInferenceAnalystModel } from "./inference-analyst-model.ts";
import { ElasticRestClient } from "./rest-client.ts";

/** Placeholder when Elastic is not configured. It never returns a pretend candidate. */
export class UnimplementedCumSearch implements CumCandidateSearch {
  search(): Promise<never> {
    return notImplemented("CumCandidateSearch.search (set ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY)");
  }
}

/** Placeholder when no inference endpoint is configured. It never returns a pretend finding. */
export class UnimplementedAnalystModel implements AnalystModel {
  callTool(): Promise<never> {
    return notImplemented("AnalystModel.callTool (set ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY)");
  }
}

export type ElasticSetup = {
  search: CumCandidateSearch;
  model: AnalystModel;
  /** Present when ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY are set. */
  client?: ElasticRestClient;
  cumIndex?: string;
  /** Env variables whose absence leaves a placeholder that throws. */
  missing: readonly string[];
};

/**
 * Composition root for Elastic. Configured parts get the REST adapters.
 * The rest get placeholders that throw, never fakes.
 */
export function createElastic(options: { env?: NodeJS.ProcessEnv; fetch?: FetchLike } = {}): ElasticSetup {
  const result = readElasticConfig(options.env);
  if (!result.configured) {
    return {
      search: new UnimplementedCumSearch(),
      model: new UnimplementedAnalystModel(),
      missing: result.missing,
    };
  }
  const { config } = result;
  const client = new ElasticRestClient({ config, ...(options.fetch ? { fetch: options.fetch } : {}) });
  return {
    client,
    cumIndex: config.cumIndex,
    search: new ElasticCumSearch({ client, index: config.cumIndex, semantic: Boolean(config.cumEmbeddingInferenceId) }),
    // Without ELASTIC_ANALYST_INFERENCE_ID the model finds the project's chat_completion endpoint itself.
    model: new ElasticInferenceAnalystModel({
      client,
      ...(config.analystInferenceId ? { inferenceId: config.analystInferenceId } : {}),
    }),
    missing: [],
  };
}
