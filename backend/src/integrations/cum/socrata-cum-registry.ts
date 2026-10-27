import { cumParts, type CumRecord } from "../../domain/cum.ts";
import type { FetchLike } from "../../lib/fetch-like.ts";
import type { CumRegistry } from "../../ports/cum-registry.ts";
import { CUM_DATASET_PROVENANCE, CUM_DATASET_URL, type CumRow, groupCumRows } from "./socrata-cum-rows.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Reads a CUM from INVIMA's published dataset at verification time. This is
 * the source that attests a catalog mapping. It is never the search index,
 * which only proposes candidates. An optional Socrata app token raises the
 * rate limit; the data is public either way.
 */
export class SocrataCumRegistry implements CumRegistry {
  readonly provenance = CUM_DATASET_PROVENANCE;
  readonly #fetch: FetchLike;
  readonly #appToken?: string;
  readonly #datasetUrl: string;

  constructor(deps: { fetch?: FetchLike; appToken?: string; datasetUrl?: string } = {}) {
    this.#fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.#appToken = deps.appToken;
    this.#datasetUrl = deps.datasetUrl ?? CUM_DATASET_URL;
  }

  async getByCum(cum: string): Promise<CumRecord | undefined> {
    const parts = cumParts(cum);
    if (!parts) return undefined;
    // By expediente only: consecutivos are compared as numbers, so "07" and "7" are one CUM.
    const url = new URL(this.#datasetUrl);
    url.searchParams.set("expedientecum", parts.expediente);
    url.searchParams.set("$limit", "1000");
    const response = await this.#fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json", ...(this.#appToken ? { "x-app-token": this.#appToken } : {}) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`CUM dataset lookup failed (${response.status})`);
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) throw new Error("CUM dataset lookup returned no row list");
    return groupCumRows(rows as CumRow[]).find((record) => record.cum === `${parts.expediente}-${parts.consecutivo}`);
  }
}
