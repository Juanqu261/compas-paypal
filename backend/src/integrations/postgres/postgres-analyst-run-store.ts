import type { AnalystJob } from "../../application/analyst-jobs.ts";
import type { AnalystFinding } from "../../domain/analyst.ts";
import type { AnalystRunStore, StoredAnalystRun } from "../../ports/analyst-run-store.ts";
import type { Database } from "./database.ts";

type RunRow = { merchant_id: string; paypal_merchant_id: string; job: AnalystJob; findings: AnalystFinding[] };

/** compas.analyst_runs: one row per merchant, the latest real run. */
export class PostgresAnalystRunStore implements AnalystRunStore {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async save(run: StoredAnalystRun): Promise<void> {
    const sql = this.#sql;
    await sql`
      insert into compas.analyst_runs (merchant_id, paypal_merchant_id, run_id, finished_at, job, findings)
      values (${run.merchantId}, ${run.paypalMerchantId}, ${run.job.result?.runId ?? run.job.id},
              ${run.job.finishedAt ?? new Date().toISOString()}, ${sql.json(run.job as never)}, ${sql.json(run.findings as never)})
      on conflict (merchant_id) do update set
        paypal_merchant_id = excluded.paypal_merchant_id, run_id = excluded.run_id,
        finished_at = excluded.finished_at, job = excluded.job, findings = excluded.findings`;
  }

  async list(): Promise<readonly StoredAnalystRun[]> {
    const rows = await this.#sql<RunRow[]>`
      select merchant_id, paypal_merchant_id, job, findings from compas.analyst_runs`;
    return rows.map((row) => ({
      merchantId: row.merchant_id,
      paypalMerchantId: row.paypal_merchant_id,
      job: row.job,
      findings: row.findings,
    }));
  }
}
