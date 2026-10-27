/**
 * Elastic Cloud, over its REST API. COMPAS uses it for two things: finding
 * CUM candidates (search) and the analyst's model (the Inference API). Both
 * the URL and the API key are secrets for the backend only, never
 * NEXT_PUBLIC_* variables.
 */
export const REQUIRED_ELASTIC_ENV = ["ELASTICSEARCH_URL", "ELASTICSEARCH_API_KEY"] as const;
export const DEFAULT_CUM_INDEX = "compas-cum-v1";

export type ElasticConfig = {
  url: string;
  apiKey: string;
  cumIndex: string;
  /** A text_embedding endpoint for the CUM index's semantic field. Absent: lexical search only. */
  cumEmbeddingInferenceId?: string;
  /** A chat_completion endpoint with tool calling, for the analyst. Absent: the project's own is looked up. */
  analystInferenceId?: string;
};

export type ElasticConfigResult =
  | { configured: true; config: ElasticConfig }
  | { configured: false; missing: readonly string[] };

/** Missing values are reported, never invented. Never log the result: it holds the API key. */
export function readElasticConfig(env: NodeJS.ProcessEnv = process.env): ElasticConfigResult {
  const missing = REQUIRED_ELASTIC_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { configured: false, missing };

  const raw = env.ELASTICSEARCH_URL!.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ELASTICSEARCH_URL is not a URL");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("ELASTICSEARCH_URL must use https");
  }
  const embedding = env.ELASTIC_CUM_EMBEDDING_INFERENCE_ID?.trim();
  const analyst = env.ELASTIC_ANALYST_INFERENCE_ID?.trim();
  return {
    configured: true,
    config: {
      url: url.toString().replace(/\/$/, ""),
      apiKey: env.ELASTICSEARCH_API_KEY!.trim(),
      cumIndex: env.ELASTIC_CUM_INDEX?.trim() || DEFAULT_CUM_INDEX,
      ...(embedding ? { cumEmbeddingInferenceId: embedding } : {}),
      ...(analyst ? { analystInferenceId: analyst } : {}),
    },
  };
}
