import { readFileSync } from "node:fs";
import { type CumRecord, normalizeCum } from "../../domain/cum.ts";
import type { CumRegistry } from "../../ports/cum-registry.ts";
import { type CumRow, groupCumRows } from "./socrata-cum-rows.ts";

/**
 * demo/test data: a small subset of INVIMA's CUM rows, as the dataset
 * publishes them, for tests and offline demos. Same grouping as the live
 * registry, so a mapping verified here is verified the same way there.
 */
export class JsonCumRegistry implements CumRegistry {
  readonly provenance: string;
  readonly #records: ReadonlyMap<string, CumRecord>;

  constructor(rows: readonly CumRow[], provenance = "demo/test data: INVIMA CUM subset") {
    this.provenance = provenance;
    this.#records = new Map(groupCumRows(rows).map((record) => [record.cum, record]));
  }

  static fromFile(file: string): JsonCumRegistry {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { rows?: unknown };
    if (!Array.isArray(parsed.rows)) throw new Error(`${file}: rows must be an array`);
    return new JsonCumRegistry(parsed.rows as CumRow[]);
  }

  async getByCum(cum: string): Promise<CumRecord | undefined> {
    const normalized = normalizeCum(cum);
    return normalized ? this.#records.get(normalized) : undefined;
  }

  list(): readonly CumRecord[] {
    return [...this.#records.values()];
  }
}
