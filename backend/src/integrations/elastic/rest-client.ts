import type { FetchLike } from "../../lib/fetch-like.ts";
import { elapsed, logger } from "../../lib/log.ts";
import type { ElasticConfig } from "./config.ts";

const log = logger("elastic");

const DEFAULT_TIMEOUT_MS = 30_000;

/** The only error the Elastic adapters throw. The message never holds the API key. */
export class ElasticError extends Error {
  readonly status?: number;
  readonly type?: string;

  constructor(message: string, options: { status?: number; type?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ElasticError";
    this.status = options.status;
    this.type = options.type;
  }
}

/** Elastic's error body: `{ error: { type, reason }, status }`. */
function errorFrom(operation: string, status: number, body: unknown): ElasticError {
  const error = (body as { error?: { type?: unknown; reason?: unknown } } | null)?.error;
  const type = typeof error?.type === "string" ? error.type : undefined;
  const reason = typeof error?.reason === "string" ? error.reason : "no reason";
  return new ElasticError(`${operation} failed (${status}${type ? ` ${type}` : ""}): ${reason}`, {
    status,
    ...(type ? { type } : {}),
  });
}

/**
 * Elastic's REST API over fetch, with `Authorization: ApiKey`. The key stays
 * in this class: it is never logged, returned or put in an error.
 */
export class ElasticRestClient {
  readonly #config: Pick<ElasticConfig, "url" | "apiKey">;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(deps: { config: Pick<ElasticConfig, "url" | "apiKey">; fetch?: FetchLike; timeoutMs?: number }) {
    this.#config = deps.config;
    this.#fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.#timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async #send(operation: string, method: string, path: string, body?: string, contentType?: string): Promise<Response> {
    const start = performance.now();
    try {
      const response = await this.#fetch(`${this.#config.url}${path}`, {
        method,
        headers: {
          authorization: `ApiKey ${this.#config.apiKey}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": contentType ?? "application/json" } : {}),
        },
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      // One search per SKU during an analyst run, so successes show with LOG_LEVEL=debug.
      const fields = { method, path, status: response.status, ms: elapsed(start) };
      if (response.ok || (method === "HEAD" && response.status === 404)) log.debug(operation, fields);
      else log.warn(`${operation} rejected`, fields);
      return response;
    } catch (error) {
      log.error(`${operation} failed`, { method, path, error: error instanceof Error ? error.name : "error", ms: elapsed(start) });
      throw new ElasticError(`${operation} failed: ${error instanceof Error ? error.name : "network error"}`, {
        cause: error,
      });
    }
  }

  async #json(operation: string, response: Response): Promise<unknown> {
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ElasticError(`${operation} returned a body that is not JSON (${response.status})`, {
          status: response.status,
        });
      }
    }
    if (!response.ok) throw errorFrom(operation, response.status, body);
    return body;
  }

  async request(
    operation: string,
    method: "GET" | "PUT" | "POST" | "DELETE" | "HEAD",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.#send(operation, method, path, body === undefined ? undefined : JSON.stringify(body));
    return this.#json(operation, response);
  }

  /** True when the path exists (2xx), false on 404. Anything else throws. */
  async exists(operation: string, path: string): Promise<boolean> {
    const response = await this.#send(operation, "HEAD", path);
    if (response.status === 404) return false;
    if (!response.ok) throw new ElasticError(`${operation} failed (${response.status})`, { status: response.status });
    return true;
  }

  /** `_bulk` with one action line and one source line per document. Throws if any item failed. */
  async bulk(operation: string, lines: readonly unknown[]): Promise<{ items: number }> {
    const ndjson = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
    const response = await this.#send(operation, "POST", "/_bulk", ndjson, "application/x-ndjson");
    const body = (await this.#json(operation, response)) as { errors?: unknown; items?: unknown[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (body.errors === true) {
      const failed = items.find((item) => {
        const result = Object.values(item as Record<string, { error?: unknown }>)[0];
        return result?.error !== undefined;
      });
      const reason = failed ? JSON.stringify(Object.values(failed as object)[0]).slice(0, 300) : "unknown item";
      throw new ElasticError(`${operation}: at least one bulk item failed: ${reason}`);
    }
    return { items: items.length };
  }

  /**
   * A streaming POST that answers with server-sent events. Yields each
   * event's `data`, in order, until the stream ends or sends `[DONE]`.
   */
  async *stream(operation: string, path: string, body: unknown): AsyncGenerator<string> {
    const response = await this.#send(operation, "POST", path, JSON.stringify(body));
    if (!response.ok && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
      // An inference failure arrives as an `error` event, not a JSON body.
      for await (const data of readServerSentEvents(response.body)) {
        let message: string | undefined;
        try {
          const error = (JSON.parse(data) as { error?: { message?: unknown; reason?: unknown } }).error;
          message = typeof error?.message === "string" ? error.message : typeof error?.reason === "string" ? error.reason : undefined;
        } catch {
          // Not JSON: fall through to the status alone.
        }
        if (message) throw new ElasticError(`${operation} failed (${response.status}): ${message}`, { status: response.status });
      }
      throw new ElasticError(`${operation} failed (${response.status})`, { status: response.status });
    }
    if (!response.ok || !response.body) {
      await this.#json(operation, response);
      throw new ElasticError(`${operation} returned no stream (${response.status})`, { status: response.status });
    }
    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") return;
      yield data;
    }
  }
}

/**
 * Splits a server-sent event stream into the `data` of each event. Lines of
 * one event are joined with "\n". Comments and other fields are ignored.
 */
export async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  const flush = function* () {
    if (data.length > 0) yield data.join("\n");
    data = [];
  };
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.search(/\r?\n/);
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(buffer[newline] === "\r" ? newline + 2 : newline + 1);
      if (line === "") yield* flush();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      newline = buffer.search(/\r?\n/);
    }
  }
  buffer += decoder.decode();
  if (buffer.startsWith("data:")) data.push(buffer.slice(5).replace(/^ /, ""));
  yield* flush();
}
