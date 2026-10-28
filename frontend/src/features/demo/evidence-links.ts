/**
 * Links from Act 1 to where the evidence lives, for a presenter who is logged
 * in to those consoles. Configured with NEXT_PUBLIC_* variables because they
 * are public URLs, not secrets; a link without its variable is not shown.
 * INVIMA's dataset is public and always linked.
 */

export const CUM_DATASET_ID = "i7cb-raxc";
const CUM_DATASET_PAGE = `https://www.datos.gov.co/d/${CUM_DATASET_ID}`;
const CUM_DATASET_RESOURCE = `https://www.datos.gov.co/resource/${CUM_DATASET_ID}.json`;
/** The analyst's own trust-log source (backend `ANALYST_SOURCE_ID`). */
const ANALYST_SOURCE_ID = "compas-analyst";
const CUM = /^\d{1,12}-\d{1,4}$/;

export type EvidenceConfig = {
  /** Kibana of the Elastic project, e.g. https://….kb.us-central1.gcp.elastic.cloud */
  kibanaUrl?: string;
  cumIndex: string;
  /** The Supabase project ref, e.g. the id in supabase.com/dashboard/project/<ref>. */
  supabaseProjectRef?: string;
};

export function readEvidenceConfig(): EvidenceConfig {
  // Literal process.env reads: Next inlines NEXT_PUBLIC_* only when written out.
  const kibanaUrl = process.env.NEXT_PUBLIC_DEMO_KIBANA_URL?.trim().replace(/\/$/, "");
  const supabaseProjectRef = process.env.NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF?.trim();
  return {
    ...(kibanaUrl ? { kibanaUrl } : {}),
    cumIndex: process.env.NEXT_PUBLIC_DEMO_ELASTIC_CUM_INDEX?.trim() || "compas-cum-v1",
    ...(supabaseProjectRef ? { supabaseProjectRef } : {}),
  };
}

/** Rison's string escaping, for a value inside '…' in a Kibana URL. */
function risonString(value: string): string {
  return `'${value.replace(/!/g, "!!").replace(/'/g, "!'")}'`;
}

/** INVIMA's dataset page on datos.gov.co. */
export function invimaDatasetLink(): string {
  return CUM_DATASET_PAGE;
}

/** INVIMA's own rows for one CUM's expediente, straight from datos.gov.co. */
export function invimaRecordLink(cum: string): string | undefined {
  if (!CUM.test(cum)) return undefined;
  const url = new URL(CUM_DATASET_RESOURCE);
  url.searchParams.set("expedientecum", cum.split("-")[0]);
  return url.toString();
}

/** The CUM index in Kibana's index management. */
export function elasticIndexLink(config: EvidenceConfig): string | undefined {
  if (!config.kibanaUrl) return undefined;
  return `${config.kibanaUrl}/app/management/data/index_management/indices/index_details?indexName=${encodeURIComponent(config.cumIndex)}`;
}

/** An ES|QL query in Discover for the CUMs this run picked, as the index holds them. */
export function elasticQueryLink(config: EvidenceConfig, cums: readonly string[]): string | undefined {
  const picked = [...new Set(cums.filter((cum) => CUM.test(cum)))];
  if (!config.kibanaUrl || picked.length === 0) return undefined;
  const esql = `FROM ${config.cumIndex} | WHERE cum IN (${picked.map((cum) => `"${cum}"`).join(", ")}) | KEEP cum, product, form, presentation`;
  const state = `(dataSource:(type:esql),query:(esql:${risonString(esql)}))`;
  return `${config.kibanaUrl}/app/discover#/?_a=${encodeURIComponent(state)}`;
}

/** The COMPAS schema in Supabase's table editor. */
export function supabaseSchemaLink(config: EvidenceConfig): string | undefined {
  if (!config.supabaseProjectRef) return undefined;
  return `https://supabase.com/dashboard/project/${encodeURIComponent(config.supabaseProjectRef)}/editor?schema=compas`;
}

/** The analyst's flags in the trust log, as a query in Supabase's SQL editor. */
export function supabaseFlagsLink(config: EvidenceConfig): string | undefined {
  if (!config.supabaseProjectRef) return undefined;
  const sql = [
    "select recorded_at, type, details->>'category' as category, details->>'note' as note",
    "from compas.trust_log_entries",
    `where source_id = '${ANALYST_SOURCE_ID}'`,
    "order by recorded_at desc",
    "limit 20;",
  ].join("\n");
  return `https://supabase.com/dashboard/project/${encodeURIComponent(config.supabaseProjectRef)}/sql/new?content=${encodeURIComponent(sql)}`;
}
