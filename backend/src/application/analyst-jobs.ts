import { randomUUID } from "node:crypto";
import type { MerchantAnalysisResult } from "./run-merchant-analysis.ts";
import { logger } from "../lib/log.ts";

const log = logger("analyst");

export const ANALYST_JOB_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type AnalystJobStatus = (typeof ANALYST_JOB_STATUSES)[number];

export type AnalystJob = {
  id: string;
  /** The directory id the job was asked for. */
  merchantId: string;
  status: AnalystJobStatus;
  result?: MerchantAnalysisResult;
  /** The error's name only. Model output and merchant text never reach it. */
  error?: string;
  createdAt: string;
  finishedAt?: string;
};

/**
 * Analyst runs, one at a time, ahead of any checkout. Asking again for a
 * merchant that already has a queued or running job returns that job. In
 * memory: a restart forgets jobs, not their findings' FLAGs.
 */
export class AnalystJobQueue {
  readonly #run: (merchantId: string) => Promise<MerchantAnalysisResult>;
  readonly #now: () => Date;
  readonly #newId: () => string;
  readonly #logWarning: (message: string) => void;
  readonly #jobs = new Map<string, AnalystJob>();
  #tail: Promise<void> = Promise.resolve();

  constructor(deps: {
    run: (merchantId: string) => Promise<MerchantAnalysisResult>;
    now?: () => Date;
    newId?: () => string;
    logWarning?: (message: string) => void;
  }) {
    this.#run = deps.run;
    this.#now = deps.now ?? (() => new Date());
    this.#newId = deps.newId ?? randomUUID;
    this.#logWarning = deps.logWarning ?? (() => {});
  }

  enqueue(merchantId: string): AnalystJob {
    const pending = [...this.#jobs.values()].find(
      (job) => job.merchantId === merchantId && (job.status === "QUEUED" || job.status === "RUNNING"),
    );
    if (pending) return { ...pending };

    const job: AnalystJob = {
      id: `analyst-job-${this.#newId()}`,
      merchantId,
      status: "QUEUED",
      createdAt: this.#now().toISOString(),
    };
    this.#jobs.set(job.id, job);
    log.info("job queued", { jobId: job.id, merchantId });
    this.#tail = this.#tail.then(() => this.#execute(job));
    return { ...job };
  }

  async #execute(job: AnalystJob): Promise<void> {
    job.status = "RUNNING";
    log.debug("job running", { jobId: job.id, merchantId: job.merchantId });
    try {
      job.result = await this.#run(job.merchantId);
      job.status = "COMPLETED";
      log.info("job completed", { jobId: job.id, merchantId: job.merchantId, status: job.result.status });
    } catch (error) {
      job.status = "FAILED";
      job.error = error instanceof Error ? error.name : "Error";
      this.#logWarning(`Analyst job ${job.id} for ${job.merchantId} failed: ${job.error}`);
    }
    job.finishedAt = this.#now().toISOString();
  }

  get(id: string): AnalystJob | undefined {
    const job = this.#jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  /** Resolves when every job queued so far has finished. */
  whenIdle(): Promise<void> {
    return this.#tail;
  }
}
