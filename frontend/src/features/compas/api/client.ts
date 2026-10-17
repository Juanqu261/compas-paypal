import type {
  AuthorizeResponse,
  CreateMandateBody,
  FieldError,
  MandateView,
  MeResponse,
  ParticipantsResponse,
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

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, { ...init, cache: "no-store" });
  } catch {
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
};

export function errorCode(error: unknown): string {
  return error instanceof CompasApiError ? error.code : "UNKNOWN";
}
