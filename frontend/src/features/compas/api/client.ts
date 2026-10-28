import type {
  AgentConsentRequest,
  AgentEvent,
  AgentRun,
  AgentScenario,
  AnalystFindingsResponse,
  AnalystJob,
  AuthorizeResponse,
  CreateMandateBody,
  DemoMerchantsResponse,
  ErrandBody,
  ErrandSuggestion,
  ErrandView,
  FieldError,
  HealthResponse,
  MandateView,
  MerchantPayPalPaymentsResponse,
  MeResponse,
  ParticipantsResponse,
  PurchaseBody,
  PurchasePreview,
  PurchaseResponse,
  RevokeResponse,
  SpendingResponse,
} from "./contracts";

/**
 * Typed client for the COMPAS backend. Requests go to `/compas-api/*`, which
 * Next proxies to the backend (see `next.config.ts`).
 *
 * Identity: each host app starts a DEMO session for its demo person, and the
 * backend resolves the actor from the session token. This client never sends
 * a payer or delegate id that the backend trusts.
 */
const BASE = "/compas-api";

export class CompasApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: readonly FieldError[];
  readonly providerCode?: string;

  constructor(status: number, code: string, message: string, fieldErrors: readonly FieldError[] = [], providerCode?: string) {
    super(message);
    this.name = "CompasApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.providerCode = providerCode;
  }
}

/** One session per demo person and tab. A backend restart invalidates it, and the next call starts another. */
const sessions = new Map<string, Promise<string>>();

/**
 * Reads give up after this long. Writes have no client timeout: giving up on
 * a write the backend may still finish would only make its outcome unknown.
 */
const READ_TIMEOUT_MS = 15_000;

async function send(path: string, init: RequestInit): Promise<Response> {
  const read = (init.method ?? "GET") === "GET";
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      ...(read ? { signal: AbortSignal.timeout(READ_TIMEOUT_MS) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new CompasApiError(0, "TIMEOUT", "the backend did not answer in time");
    }
    throw new CompasApiError(0, "BACKEND_UNAVAILABLE", "network error");
  }
}

async function readError(response: Response): Promise<CompasApiError> {
  let body: { error?: unknown; message?: unknown; fieldErrors?: unknown; providerCode?: unknown } = {};
  try {
    body = await response.json();
  } catch {
    // The proxy answers with HTML when the backend is down.
  }
  const code = typeof body.error === "string" ? body.error : response.status >= 500 ? "BACKEND_UNAVAILABLE" : "UNKNOWN";
  return new CompasApiError(
    response.status,
    code,
    typeof body.message === "string" ? body.message : response.statusText,
    Array.isArray(body.fieldErrors) ? (body.fieldErrors as FieldError[]) : [],
    typeof body.providerCode === "string" ? body.providerCode : undefined,
  );
}

function sessionToken(partyId: string, fresh = false): Promise<string> {
  const existing = sessions.get(partyId);
  if (existing && !fresh) return existing;
  const started = (async () => {
    const response = await send("/demo/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partyId }),
    });
    if (!response.ok) throw await readError(response);
    const body = (await response.json()) as { token: string };
    return body.token;
  })();
  sessions.set(partyId, started);
  started.catch(() => sessions.delete(partyId));
  return started;
}

async function request<T>(partyId: string, path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const attempt = async (fresh: boolean) => {
    const token = await sessionToken(partyId, fresh);
    return send(path, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  };
  let response = await attempt(false);
  if (response.status === 401) response = await attempt(true);
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export const compasApi = {
  me: (partyId: string) => request<MeResponse>(partyId, "/me"),
  participants: (partyId: string) => request<ParticipantsResponse>(partyId, "/demo/participants"),
  listMandates: (partyId: string, role: "payer" | "delegate") =>
    request<{ mandates: MandateView[] }>(partyId, `/mandates?role=${role}`).then((body) => body.mandates),
  getMandate: (partyId: string, id: string) =>
    request<{ mandate: MandateView }>(partyId, `/mandates/${encodeURIComponent(id)}`).then((body) => body.mandate),
  createMandate: (partyId: string, body: CreateMandateBody) =>
    request<{ mandate: MandateView }>(partyId, "/mandates", { method: "POST", body }).then((result) => result.mandate),
  authorize: (partyId: string, id: string) =>
    request<AuthorizeResponse>(partyId, `/mandates/${encodeURIComponent(id)}/authorize`, { method: "POST" }),
  revoke: (partyId: string, id: string) =>
    request<RevokeResponse>(partyId, `/mandates/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
  spending: (partyId: string, id: string) =>
    request<SpendingResponse>(partyId, `/mandates/${encodeURIComponent(id)}/spending`),
  /** Every check before PayPal. Writes nothing and moves no money. */
  previewPurchase: (partyId: string, body: PurchaseBody) =>
    request<{ preview: PurchasePreview }>(partyId, "/purchases/preview", { method: "POST", body }).then((result) => result.preview),
  /**
   * One purchase attempt. Never retried here: the caller keeps the idempotency
   * key, and sending the same key again replays the first attempt.
   */
  purchase: (partyId: string, body: PurchaseBody & { idempotencyKey: string }) =>
    request<PurchaseResponse>(partyId, "/purchases", { method: "POST", body }),
  /** demo/test data: the demo merchants and the categories COMPAS resolves for them. No session needed. */
  demoMerchants: async () => {
    const response = await send("/demo/merchants", { method: "GET" });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as DemoMerchantsResponse;
  },
  /** What the backend runs with. Facts about configuration, not about any merchant. */
  health: async () => {
    const response = await send("/health", { method: "GET" });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as HealthResponse;
  },
  /** Queues an analyst run on a merchant's catalog, ahead of any checkout. Local demo only: the backend refuses it in production. */
  startAnalystJob: async (merchantId: string) => {
    const response = await send("/analyst/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId }),
    });
    if (!response.ok) throw await readError(response);
    return ((await response.json()) as { job: AnalystJob }).job;
  },
  analystJob: async (id: string) => {
    const response = await send(`/analyst/jobs/${encodeURIComponent(id)}`, { method: "GET" });
    if (!response.ok) throw await readError(response);
    return ((await response.json()) as { job: AnalystJob }).job;
  },
  /** demo/test data: a merchant's analyst findings. The backend shows them without a merchant session in demo mode only. */
  /** The merchant's COMPAS orders, each read live from the PayPal sandbox. */
  merchantPayPalPayments: async (merchantId: string) => {
    const response = await send(`/demo/merchants/${encodeURIComponent(merchantId)}/payments`, { method: "GET" });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as MerchantPayPalPaymentsResponse;
  },
  // ---- Act 3: agents over MCP ----
  /** The errand card, pre-filled from the analyst's verified CUM. Stores nothing. */
  suggestAgentErrand: (partyId: string, mandateId: string) =>
    request<ErrandSuggestion>(partyId, `/demo/agent-errand?mandateId=${encodeURIComponent(mandateId)}`),
  /** The delegate confirms an errand. `confirmed: true` is the delegate's own tap. */
  confirmErrand: (partyId: string, body: ErrandBody) =>
    request<{ errand: ErrandView }>(partyId, "/errands", { method: "POST", body: { ...body, confirmed: true } }).then((result) => result.errand),
  listErrands: (partyId: string, mandateId: string) =>
    request<{ errands: ErrandView[] }>(partyId, `/errands?mandateId=${encodeURIComponent(mandateId)}`).then((result) => result.errands),
  startAgentRun: (partyId: string, body: { errandId: string; scenario: AgentScenario }) =>
    request<{ run: AgentRun }>(partyId, "/demo/agent-runs", { method: "POST", body }).then((result) => result.run),
  agentRun: (partyId: string, id: string) =>
    request<{ run: AgentRun }>(partyId, `/demo/agent-runs/${encodeURIComponent(id)}`).then((result) => result.run),
  /** The browser's part of the OAuth redirect: hands the run the URL the consent answer produced. */
  deliverAgentConsent: (partyId: string, runId: string, redirectTo: string) =>
    request<{ run: AgentRun }>(partyId, `/demo/agent-runs/${encodeURIComponent(runId)}/consent`, { method: "POST", body: { redirectTo } }).then((result) => result.run),
  agentConsentRequest: (partyId: string, requestId: string) =>
    request<AgentConsentRequest>(partyId, `/agents/requests/${encodeURIComponent(requestId)}`),
  /** The delegate answers the agent's request: the errands they give it, or a refusal. */
  answerAgentConsent: (partyId: string, requestId: string, answer: { approve: true; errandIds: readonly string[] } | { approve: false }) =>
    request<{ redirectTo: string }>(partyId, `/agents/requests/${encodeURIComponent(requestId)}/${answer.approve ? "approve" : "deny"}`, {
      method: "POST",
      body: answer.approve ? { errandIds: answer.errandIds } : {},
    }).then((result) => result.redirectTo),
  /** What the server recorded about the agent's calls, for the delegate and the payer. */
  agentEvents: (partyId: string, grantId: string) =>
    request<{ events: AgentEvent[] }>(partyId, `/agents/grants/${encodeURIComponent(grantId)}/events`).then((result) => result.events),
  analystFindings: async (merchantId: string) => {
    const response = await send(`/analyst/findings?merchantId=${encodeURIComponent(merchantId)}`, { method: "GET" });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as AnalystFindingsResponse;
  },
};

/** A key for one purchase attempt. Reused only to ask again about that same attempt. */
export function newIdempotencyKey(): string {
  return `purchase-${crypto.randomUUID()}`;
}

export function errorCode(error: unknown): string {
  return error instanceof CompasApiError ? error.code : "UNKNOWN";
}
