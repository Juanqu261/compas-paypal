import type { AnalystRunStore, StoredAnalystRun } from "../../ports/analyst-run-store.ts";

/** In memory: a restart forgets the run, and the next visitor may start a live one. */
export class InMemoryAnalystRunStore implements AnalystRunStore {
  readonly #runs = new Map<string, StoredAnalystRun>();

  async save(run: StoredAnalystRun): Promise<void> {
    this.#runs.set(run.merchantId, structuredClone(run));
  }

  async list(): Promise<readonly StoredAnalystRun[]> {
    return [...this.#runs.values()].map((run) => structuredClone(run));
  }
}
