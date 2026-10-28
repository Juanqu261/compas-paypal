import { elapsed, errorLabel, logger } from "../../lib/log.ts";
import { PayPalGatewayError, toPayPalError } from "./errors.ts";
import type { PayPalConfig } from "./config.ts";

const log = logger("paypal");

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Renew the access token this long before PayPal says it expires. */
const TOKEN_MARGIN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The PayPal REST API over fetch, with an OAuth client-credentials token
 * kept in memory. The token and the client secret stay in this class: they
 * are never logged, returned or put in an error.
 */
export class PayPalRestClient {
  readonly #config: Pick<PayPalConfig, "clientId" | "clientSecret" | "apiBaseUrl">;
  readonly #fetch: FetchLike;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  #token?: Promise<{ value: string; expiresAt: number }>;

  constructor(deps: {
    config: Pick<PayPalConfig, "clientId" | "clientSecret" | "apiBaseUrl">;
    fetch?: FetchLike;
    now?: () => number;
    timeoutMs?: number;
  }) {
    this.#config = deps.config;
    this.#fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.#now = deps.now ?? Date.now;
    this.#timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async #send(operation: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#fetch(url, { ...init, signal: AbortSignal.timeout(this.#timeoutMs) });
    } catch (error) {
      throw new PayPalGatewayError(
        "UPSTREAM",
        `${operation} failed: ${error instanceof Error ? error.name : "network error"}`,
        { cause: error },
      );
    }
  }

  async #readJson(operation: string, response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new PayPalGatewayError("UPSTREAM", `${operation} returned a body that is not JSON (${response.status})`);
    }
  }

  async #fetchToken(): Promise<{ value: string; expiresAt: number }> {
    const basic = Buffer.from(`${this.#config.clientId}:${this.#config.clientSecret}`).toString("base64");
    const response = await this.#send("PayPal token", `${this.#config.apiBaseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = await this.#readJson("PayPal token", response);
    if (!response.ok) {
      log.error("access token refused", { status: response.status });
      throw toPayPalError("PayPal token", response.status, body);
    }
    const { access_token: value, expires_in: expiresIn } = body as { access_token?: unknown; expires_in?: unknown };
    if (typeof value !== "string" || typeof expiresIn !== "number") {
      throw new PayPalGatewayError("UPSTREAM", "PayPal token response has no access_token or expires_in");
    }
    log.debug("access token renewed", { expiresInSeconds: expiresIn });
    return { value, expiresAt: this.#now() + expiresIn * 1000 - TOKEN_MARGIN_MS };
  }

  /** One token request at a time. A failed request is not cached. */
  async #accessToken(): Promise<string> {
    const current = this.#token ? await this.#token.catch(() => undefined) : undefined;
    if (current && current.expiresAt > this.#now()) return current.value;
    const next = this.#fetchToken();
    this.#token = next;
    next.catch(() => {
      if (this.#token === next) this.#token = undefined;
    });
    return (await next).value;
  }

  /**
   * One API call. `requestId` becomes PayPal-Request-Id, which makes a retried
   * POST return the first result. A 401 renews the token and retries once.
   */
  async request(
    operation: string,
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; requestId?: string } = {},
  ): Promise<unknown> {
    const call = async () => {
      const token = await this.#accessToken();
      return this.#send(operation, `${this.#config.apiBaseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          prefer: "return=representation",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(options.requestId ? { "paypal-request-id": options.requestId } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    };

    const start = performance.now();
    let response: Response;
    let body: unknown;
    try {
      response = await call();
      if (response.status === 401) {
        log.debug("access token rejected, renewing", { operation });
        this.#token = undefined;
        response = await call();
      }
      body = await this.#readJson(operation, response);
    } catch (error) {
      log.error(`${operation} failed`, { method, path, error: errorLabel(error), ms: elapsed(start) });
      throw error;
    }
    if (!response.ok) {
      const error = toPayPalError(operation, response.status, body);
      log.warn(`${operation} rejected`, {
        method,
        path,
        status: response.status,
        code: error.code,
        issue: error.issue,
        debugId: error.debugId,
        ms: elapsed(start),
      });
      throw error;
    }
    log.info(operation, { method, path, status: response.status, ms: elapsed(start) });
    return body;
  }
}
