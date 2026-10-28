import type { AgentAuthFailure, AgentAuthService } from "../application/agent-auth.ts";
import type { Actor } from "../application/mandates.ts";
import { AGENT_SCOPE } from "../domain/agent.ts";

export const PROTECTED_RESOURCE_PATHS = ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"];
export const AUTH_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
export const OAUTH_REGISTER_PATH = "/oauth/register";
export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_TOKEN_PATH = "/oauth/token";
export const OAUTH_REVOKE_PATH = "/oauth/revoke";
export const AGENT_GRANTS_PATH = "/agents/grants";
/** Registration, token and revoke bodies are small. Anything larger is refused before it is parsed. */
export const MAX_OAUTH_BODY_BYTES = 4 * 1024;
export const MAX_CONSENT_BODY_BYTES = 4 * 1024;

const CONSENT_ROUTE = /^\/agents\/requests\/(areq-[0-9a-f-]{36})(?:\/(approve|deny))?$/;
const GRANT_ROUTE = /^\/agents\/grants\/(agrant-[0-9a-f-]{36})\/revoke$/;
const EVENTS_ROUTE = /^\/agents\/grants\/(agrant-[0-9a-f-]{36})\/events$/;

export type ApiResponse = {
  status: number;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** A 302 to this URL. */
  location?: string;
};

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

export function isOAuthPath(pathname: string): boolean {
  return (
    PROTECTED_RESOURCE_PATHS.includes(pathname) ||
    pathname === AUTH_SERVER_METADATA_PATH ||
    pathname === OAUTH_REGISTER_PATH ||
    pathname === OAUTH_AUTHORIZE_PATH ||
    pathname === OAUTH_TOKEN_PATH ||
    pathname === OAUTH_REVOKE_PATH
  );
}

/** The delegate-session routes: the consent screen's reads and answers, and the grant list. */
export function isAgentConsentPath(pathname: string): boolean {
  return pathname === AGENT_GRANTS_PATH || CONSENT_ROUTE.test(pathname) || GRANT_ROUTE.test(pathname) || EVENTS_ROUTE.test(pathname);
}

const STATUS_BY_ERROR: Record<string, number> = {
  temporarily_unavailable: 503,
  unknown_request: 404,
  unknown_grant: 404,
};

function oauthError(result: AgentAuthFailure, fallback = 400): ApiResponse {
  return {
    status: STATUS_BY_ERROR[result.error] ?? fallback,
    headers: NO_STORE,
    body: { error: result.error, error_description: result.description },
  };
}

function parseJson(raw: Uint8Array | undefined): unknown {
  if (!raw || raw.length === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return undefined;
  }
}

function parseForm(raw: Uint8Array | undefined): URLSearchParams {
  try {
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(raw ?? new Uint8Array()));
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Discovery and the OAuth endpoints an MCP client talks to. No COMPAS session
 * is involved: a client proves itself with PKCE, and the human answers on the
 * consent screen (see `handleAgentConsentRequest`).
 */
export async function handleOAuthRequest(
  request: { method: string; url: URL; rawBody?: Uint8Array },
  deps: {
    auth: AgentAuthService;
    /** The origin clients reach this server at, e.g. https://compas.example. */
    issuer: string;
    /** The frontend screen where the delegate answers: `?request=<id>` is added. */
    consentUrl: string;
  },
): Promise<ApiResponse> {
  const { pathname } = request.url;
  const { auth, issuer } = deps;

  if (PROTECTED_RESOURCE_PATHS.includes(pathname)) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    return {
      status: 200,
      body: {
        resource: auth.resource,
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: [AGENT_SCOPE],
        resource_name: "Compas",
      },
    };
  }

  if (pathname === AUTH_SERVER_METADATA_PATH) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    return {
      status: 200,
      body: {
        issuer,
        authorization_endpoint: `${issuer}${OAUTH_AUTHORIZE_PATH}`,
        token_endpoint: `${issuer}${OAUTH_TOKEN_PATH}`,
        registration_endpoint: `${issuer}${OAUTH_REGISTER_PATH}`,
        revocation_endpoint: `${issuer}${OAUTH_REVOKE_PATH}`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        revocation_endpoint_auth_methods_supported: ["none"],
        scopes_supported: [AGENT_SCOPE],
      },
    };
  }

  if (pathname === OAUTH_REGISTER_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await auth.registerClient(parseJson(request.rawBody));
    if (!result.ok) return oauthError(result);
    return {
      status: 201,
      headers: NO_STORE,
      body: {
        client_id: result.client.id,
        client_id_issued_at: Math.floor(Date.parse(result.client.createdAt) / 1000),
        client_name: result.client.name,
        redirect_uris: result.client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    };
  }

  if (pathname === OAUTH_AUTHORIZE_PATH) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await auth.beginAuthorization(request.url.searchParams);
    if (result.ok) {
      const consent = new URL(deps.consentUrl);
      consent.searchParams.set("request", result.requestId);
      return { status: 302, location: consent.toString(), headers: NO_STORE };
    }
    // An unusable client or redirect URI is never redirected to; anything else goes back to the client.
    if (result.redirectTo) return { status: 302, location: result.redirectTo, headers: NO_STORE };
    return { status: 400, headers: NO_STORE, body: { error: "invalid_request", error_description: result.message } };
  }

  if (pathname === OAUTH_TOKEN_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await auth.token(parseForm(request.rawBody));
    return result.ok ? { status: 200, headers: NO_STORE, body: { ...result.token } } : oauthError(result);
  }

  if (pathname === OAUTH_REVOKE_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    await auth.revokeToken(parseForm(request.rawBody).get("token"));
    return { status: 200, headers: NO_STORE, body: {} };
  }

  return { status: 404, body: { error: "not_found" } };
}

/**
 * The delegate's side of the OAuth flow, and the grant list. The actor comes
 * from the COMPAS session. `redirectTo` goes back to the frontend, which sends
 * the browser there: it is the MCP client's registered redirect URI.
 */
export async function handleAgentConsentRequest(
  request: { method: string; url: URL; body?: unknown },
  actor: Actor,
  deps: { auth: AgentAuthService },
): Promise<ApiResponse> {
  const { pathname } = request.url;

  if (pathname === AGENT_GRANTS_PATH) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    return { status: 200, body: { grants: await deps.auth.listGrants(actor) } };
  }

  const events = EVENTS_ROUTE.exec(pathname);
  if (events) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await deps.auth.listEvents(actor, events[1]);
    return result.ok ? { status: 200, headers: NO_STORE, body: { events: result.events } } : oauthError(result);
  }

  const revoke = GRANT_ROUTE.exec(pathname);
  if (revoke) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await deps.auth.revokeGrant(actor, revoke[1]);
    return result.ok ? { status: 200, body: { grant: result.grant } } : oauthError(result);
  }

  const consent = CONSENT_ROUTE.exec(pathname);
  if (consent) {
    const [, requestId, action] = consent;
    if (!action) {
      if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
      const result = await deps.auth.describeRequest(actor, requestId);
      return result.ok ? { status: 200, headers: NO_STORE, body: { ...result.consent } } : oauthError(result);
    }
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const errandIds = action === "approve" && typeof request.body === "object" && request.body !== null
      ? (request.body as { errandIds?: unknown }).errandIds
      : undefined;
    const result = action === "approve" ? await deps.auth.approve(actor, requestId, errandIds) : await deps.auth.deny(actor, requestId);
    return result.ok ? { status: 200, headers: NO_STORE, body: { redirectTo: result.redirectTo } } : oauthError(result);
  }

  return { status: 404, body: { error: "not_found" } };
}
