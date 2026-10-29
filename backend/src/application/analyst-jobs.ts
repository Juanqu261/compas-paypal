import { randomUUID } from "node:crypto";
import type { MerchantAnalysisResult } from "./run-merchant-analysis.ts";
import { logger } from "../lib/log.ts";

const log = logger("analyst");

export const ANALYST_JOB_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type AnalystJobStatus = (typeof ANALYST_JOB_STATUSES)[number];

const MINUTE_MS = 60 * 1000;
/** After a real run, the next live run of that merchant waits this long. Everyone sees the real run meanwhile. */
export const DEFAULT_RERUN_COOLDOWN_MS = 6 * 60 * MINUTE_MS;
/** After a failed run (no credits, a rate limit), the next try waits this long, not the whole cooldown. */
export const DEFAULT_RETRY_AFTER_FAILURE_MS = 15 * MINUTE_MS;

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

/** A merchant's runs as a screen shows them: the last real one, one in progress, the last failure, and when a live run may start. */
export type AnalystRunStatus = {
  merchantId: string;
  latest?: AnalystJob;
  running?: AnalystJob;
  failure?: AnalystJob;
  /** Absent: a live run may start now. */
  nextRunAt?: string;
};

export type EnqueueResult =
  | { ok: true; job: AnalystJob }
  | { ok: false; code: "ANALYST_COOLDOWN"; latest?: AnalystJob; nextRunAt: string };

/**
 * Analyst runs, one at a time, ahead of any checkout. Asking again for a
 * merchant that already has a queued or running job returns that job.
 *
 * A run that called the model (status COMPLETED) is shown to everyone for
 * the cooldown, and no new live run of that merchant starts before it ends:
 * the demo's model costs are bounded per merchant, not per visitor. A failed
 * run waits only a short retry delay. Jobs are in memory; `onCompleted`
 * keeps the latest real run elsewhere, and `restore` brings it back.
 */
export class AnalystJobQueue {
  readonly #run: (merchantId: string) => Promise<MerchantAnalysisResult>;
  readonly #onCompleted: (job: AnalystJob) => Promise<void>;
  readonly #now: () => Date;
  readonly #newId: () => string;
  readonly #logWarning: (message: string) => void;
  readonly #cooldownMs: number;
  readonly #retryMs: number;
  readonly #jobs = new Map<string, AnalystJob>();
  readonly #latest = new Map<string, AnalystJob>();
  readonly #failed = new Map<string, AnalystJob>();
  #tail: Promise<void> = Promise.resolve();

  constructor(deps: {
    run: (merchantId: string) => Promise<MerchantAnalysisResult>;
    /** Called once a real run completed, to keep it past a restart. A failure is logged, never thrown. */
    onCompleted?: (job: AnalystJob) => Promise<void>;
    now?: () => Date;
    newId?: () => string;
    logWarning?: (message: string) => void;
    cooldownMs?: number;
    retryAfterFailureMs?: number;
  }) {
    this.#run = deps.run;
    this.#onCompleted = deps.onCompleted ?? (async () => {});
    this.#now = deps.now ?? (() => new Date());
    this.#newId = deps.newId ?? randomUUID;
    this.#logWarning = deps.logWarning ?? (() => {});
    this.#cooldownMs = deps.cooldownMs ?? DEFAULT_RERUN_COOLDOWN_MS;
    this.#retryMs = deps.retryAfterFailureMs ?? DEFAULT_RETRY_AFTER_FAILURE_MS;
  }

  get cooldownMs(): number {
    return this.#cooldownMs;
  }

  enqueue(merchantId: string): EnqueueResult {
    const pending = this.#pending(merchantId);
    if (pending) return { ok: true, job: { ...pending } };
    const nextRunAt = this.#nextRunAt(merchantId);
    if (nextRunAt) {
      const latest = this.#latest.get(merchantId);
      return { ok: false, code: "ANALYST_COOLDOWN", ...(latest ? { latest: structuredClone(latest) } : {}), nextRunAt };
    }

    const job: AnalystJob = {
      id: `analyst-job-${this.#newId()}`,
      merchantId,
      status: "QUEUED",
      createdAt: this.#now().toISOString(),
    };
    this.#jobs.set(job.id, job);
    log.info("job queued", { jobId: job.id, merchantId });
    this.#tail = this.#tail.then(() => this.#execute(job));
    return { ok: true, job: { ...job } };
  }

  /** A real run kept from before a restart. The newer one wins. */
  restore(job: AnalystJob): void {
    if (job.status !== "COMPLETED" || job.result?.status !== "COMPLETED" || !job.finishedAt) return;
    const current = this.#latest.get(job.merchantId);
    if (current?.finishedAt && current.finishedAt >= job.finishedAt) return;
    this.#latest.set(job.merchantId, structuredClone(job));
    this.#jobs.set(job.id, structuredClone(job));
  }

  status(merchantId: string): AnalystRunStatus {
    const latest = this.#latest.get(merchantId);
    const running = this.#pending(merchantId);
    const failure = this.#failed.get(merchantId);
    const nextRunAt = running ? undefined : this.#nextRunAt(merchantId);
    return {
      merchantId,
      ...(latest ? { latest: structuredClone(latest) } : {}),
      ...(running ? { running: structuredClone(running) } : {}),
      ...(failure ? { failure: structuredClone(failure) } : {}),
      ...(nextRunAt ? { nextRunAt } : {}),
    };
  }

  #pending(merchantId: string): AnalystJob | undefined {
    return [...this.#jobs.values()].find(
      (job) => job.merchantId === merchantId && (job.status === "QUEUED" || job.status === "RUNNING"),
    );
  }

  /** When the next live run may start, if not now. */
  #nextRunAt(merchantId: string): string | undefined {
    const at = (job: AnalystJob | undefined, waitMs: number) =>
      job?.finishedAt ? new Date(job.finishedAt).getTime() + waitMs : 0;
    const next = Math.max(at(this.#latest.get(merchantId), this.#cooldownMs), at(this.#failed.get(merchantId), this.#retryMs));
    return next > this.#now().getTime() ? new Date(next).toISOString() : undefined;
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

    if (job.status === "FAILED") {
      this.#failed.set(job.merchantId, job);
    } else if (job.result?.status === "COMPLETED") {
      // Only a run that called the model starts the cooldown.
      this.#latest.set(job.merchantId, job);
      this.#failed.delete(job.merchantId);
      try {
        await this.#onCompleted(structuredClone(job));
      } catch (error) {
        this.#logWarning(`Analyst job ${job.id} completed but was not kept: ${error instanceof Error ? error.name : "error"}`);
      }
    }
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
