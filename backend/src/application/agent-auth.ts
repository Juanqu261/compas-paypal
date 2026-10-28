import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AGENT_SCOPE,
  type AgentAuthorizationRequest,
  type AgentClient,
  type AgentGrant,
  type AgentPrincipal,
  type AgentTokenKind,
  MAX_GRANT_ERRANDS,
} from "../domain/agent.ts";
import type { Errand } from "../domain/errand.ts";
import type { AgentRepository } from "../ports/agent-repository.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import { logger } from "../lib/log.ts";
import type { Actor, MandateService, ViewerRole } from "./mandates.ts";

// Ids and counts only: never a token, a code, a verifier or an errand's contents.
const log = logger("agent-auth");

const ERRAND_ID = /^errand-[A-Za-z0-9-]{1,80}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const ACCESS_TOKEN = /^Bearer (cmp_at_[A-Za-z0-9_-]{43})$/;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const ACCESS_TTL_MS = 60 * MINUTE_MS;
export const REFRESH_TTL_MS = 30 * DAY_MS;
export const CODE_TTL_MS = MINUTE_MS;
export const REQUEST_TTL_MS = 10 * MINUTE_MS;
export const MAX_AGENT_CLIENTS = 200;
export const MAX_PENDING_REQUESTS = 500;
const MAX_REDIRECT_URIS = 5;
const MAX_CLIENT_NAME = 80;
const MAX_STATE = 512;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const PREFIX: Record<AgentTokenKind, string> = { CODE: "cmp_ac_", ACCESS: "cmp_at_", REFRESH: "cmp_rt_" };

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** `error` is an OAuth error code (RFC 6749 section 5.2) or one of ours for the consent routes. */
export type AgentAuthFailure = { ok: false; error: string; description: string };
export type AgentAuthResult<T> = ({ ok: true } & T) | AgentAuthFailure;

function failure(error: string, description: string): AgentAuthFailure {
  return { ok: false, error, description };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** https, or http on the loopback interface (RFC 8252), with no fragment and no credentials. */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
}

/** Exact match, except that a loopback client may use any port (RFC 8252 section 7.3). */
export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return (
      a.protocol === "http:" &&
      b.protocol === "http:" &&
      LOOPBACK.has(a.hostname) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_CLIENT_NAME) : undefined;
}

function sameChallenge(verifier: string, challenge: string): boolean {
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export type AgentAuthDeps = {
  repo: AgentRepository;
  errands: Pick<ErrandRepository, "get" | "listByMandate">;
  mandates: Pick<MandateService, "list" | "forParticipant">;
  /** The MCP resource URL the tokens are for, e.g. https://compas.example/mcp. */
  resource: string;
  now?: () => Date;
  newSecret?: () => string;
};

/** What the consent screen shows the delegate about one of their open errands. */
export type ConsentErrand = {
  id: string;
  mandateId: string;
  kind: Errand["kind"];
  items: readonly { label: string; maxUnits: number }[];
  maxAmount: Errand["maxAmount"];
  expiresAt: string;
};

export type ConsentRequest = {
  requestId: string;
  client: { name: string; redirectHost: string };
  errands: readonly ConsentErrand[];
  expiresAt: string;
};

export type GrantView = {
  id: string;
  client: { name: string };
  errandIds: readonly string[];
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  viewerRole: ViewerRole;
  createdAt: string;
  expiresAt: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

/**
 * OAuth 2.1 for MCP agents: dynamic client registration, authorization code
 * with PKCE (S256 only), refresh rotation, revocation. What is unusual is the
 * consent step. The delegate, logged in to COMPAS, picks the errands the agent
 * may shop for, and the grant is bound to exactly those. Nothing here reaches
 * PayPal, and a token is good for the MCP endpoint only, never for the REST
 * routes a delegate session opens.
 */
export class AgentAuthService {
  readonly #deps: AgentAuthDeps;

  constructor(deps: AgentAuthDeps) {
    this.#deps = deps;
  }

  get resource(): string {
    return this.#deps.resource;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  #newSecret(): string {
    return this.#deps.newSecret?.() ?? randomBytes(32).toString("base64url");
  }

  // -------------------------------------------------------------------------
  // Registration (RFC 7591)
  // -------------------------------------------------------------------------

  async registerClient(body: unknown): Promise<AgentAuthResult<{ client: AgentClient }>> {
    if (!isRecord(body)) return failure("invalid_client_metadata", "A JSON object is required.");
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
      return failure("invalid_redirect_uri", `1 to ${MAX_REDIRECT_URIS} redirect_uris are required.`);
    }
    if (!uris.every((uri) => typeof uri === "string" && uri.length <= 512 && isAllowedRedirectUri(uri))) {
      return failure("invalid_redirect_uri", "A redirect URI must be https, or http on localhost, with no fragment.");
    }
    if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") {
      return failure("invalid_client_metadata", "Only public clients (token_endpoint_auth_method none) are registered.");
    }
    const grantTypes = body.grant_types;
    if (
      grantTypes !== undefined &&
      (!Array.isArray(grantTypes) || !grantTypes.every((type) => type === "authorization_code" || type === "refresh_token"))
    ) {
      return failure("invalid_client_metadata", "grant_types may be authorization_code and refresh_token.");
    }
    if (body.response_types !== undefined && (!Array.isArray(body.response_types) || !body.response_types.every((type) => type === "code"))) {
      return failure("invalid_client_metadata", "response_types may be code.");
    }
    if ((await this.#deps.repo.clientCount()) >= MAX_AGENT_CLIENTS) {
      return failure("temporarily_unavailable", "This server is not registering more clients now.");
    }
    const client: AgentClient = {
      id: `aclient-${randomUUID()}`,
      name: cleanName(body.client_name) ?? "An AI agent",
      redirectUris: [...new Set(uris as string[])],
      createdAt: this.#now().toISOString(),
    };
    await this.#deps.repo.putClient(client);
    log.info("client registered", { clientId: client.id, redirectUris: client.redirectUris.length });
    return { ok: true, client };
  }

  // -------------------------------------------------------------------------
  // Authorization request
  // -------------------------------------------------------------------------

  /**
   * Validates the browser request an MCP client sends. A problem with the
   * client or the redirect URI is shown to the user, never redirected to
   * (RFC 6749 section 4.1.2.1). Any other problem goes back to the client.
   */
  async beginAuthorization(
    params: URLSearchParams,
  ): Promise<{ ok: true; requestId: string } | { ok: false; message: string; redirectTo?: string }> {
    const client = await this.#deps.repo.getClient(params.get("client_id") ?? "");
    if (!client) return { ok: false, message: "Unknown client_id." };
    const requested = params.get("redirect_uri");
    const redirectUri = requested ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.some((registered) => redirectUriMatches(registered, redirectUri))) {
      return { ok: false, message: "redirect_uri is not one this client registered." };
    }
    const state = params.get("state") ?? undefined;
    const back = (error: string, description: string) => ({
      ok: false as const,
      message: description,
      redirectTo: redirectWith(redirectUri, { error, error_description: description, ...(state ? { state } : {}) }),
    });

    if (state && state.length > MAX_STATE) return back("invalid_request", "state is too long.");
    if (params.get("response_type") !== "code") return back("unsupported_response_type", "response_type must be code.");
    const challenge = params.get("code_challenge") ?? "";
    if (!CHALLENGE.test(challenge) || params.get("code_challenge_method") !== "S256") {
      return back("invalid_request", "PKCE with code_challenge_method S256 is required.");
    }
    const resource = params.get("resource");
    if (resource !== null && resource !== this.#deps.resource) {
      return back("invalid_target", "resource must be this server's MCP endpoint.");
    }
    if ((await this.#deps.repo.requestCount()) >= MAX_PENDING_REQUESTS) {
      return back("temporarily_unavailable", "Too many authorizations are waiting. Try again later.");
    }

    const request: AgentAuthorizationRequest = {
      id: `areq-${randomUUID()}`,
      clientId: client.id,
      redirectUri,
      ...(state ? { state } : {}),
      codeChallenge: challenge,
      resource: this.#deps.resource,
      expiresAt: new Date(this.#now().getTime() + REQUEST_TTL_MS).toISOString(),
    };
    await this.#deps.repo.putRequest(request);
    return { ok: true, requestId: request.id };
  }

  async #liveRequest(requestId: unknown): Promise<AgentAuthorizationRequest | undefined> {
    if (typeof requestId !== "string" || requestId.length > 128) return undefined;
    const request = await this.#deps.repo.getRequest(requestId);
    if (!request) return undefined;
    if (this.#now().getTime() >= Date.parse(request.expiresAt)) {
      await this.#deps.repo.deleteRequest(request.id);
      return undefined;
    }
    return request;
  }

  /** The delegate's errands that an agent could be granted: their own, ACTIVE, not expired, under a usable mandate. */
  async #openErrands(actor: Actor): Promise<Errand[]> {
    const now = this.#now().getTime();
    const open: Errand[] = [];
    for (const mandate of await this.#deps.mandates.list(actor, "DELEGATE")) {
      if (mandate.status !== "ACTIVE") continue;
      for (const errand of await this.#deps.errands.listByMandate(mandate.id)) {
        if (errand.delegateId === actor.partyId && errand.status === "ACTIVE" && now < Date.parse(errand.expiresAt)) {
          open.push(errand);
        }
      }
    }
    return open;
  }

  /** What the consent screen shows: who is asking, and which errands the delegate can give them. */
  async describeRequest(actor: Actor, requestId: unknown): Promise<AgentAuthResult<{ consent: ConsentRequest }>> {
    const request = await this.#liveRequest(requestId);
    if (!request) return failure("unknown_request", "This authorization request expired or does not exist.");
    const client = await this.#deps.repo.getClient(request.clientId);
    if (!client) return failure("unknown_request", "This authorization request expired or does not exist.");
    const errands = await this.#openErrands(actor);
    return {
      ok: true,
      consent: {
        requestId: request.id,
        client: { name: client.name, redirectHost: new URL(request.redirectUri).host },
        errands: errands.map((errand) => ({
          id: errand.id,
          mandateId: errand.mandateId,
          kind: errand.kind,
          items: errand.items.map((item) => ({ label: item.label, maxUnits: item.maxUnits })),
          maxAmount: errand.maxAmount,
          expiresAt: errand.expiresAt,
        })),
        expiresAt: request.expiresAt,
      },
    };
  }

  /**
   * The delegate gives the agent these errands and nothing else. Returns where
   * to send the browser: back to the client with a one-minute code.
   */
  async approve(actor: Actor, requestId: unknown, errandIds: unknown): Promise<AgentAuthResult<{ redirectTo: string }>> {
    const request = await this.#liveRequest(requestId);
    if (!request) return failure("unknown_request", "This authorization request expired or does not exist.");

    if (
      !Array.isArray(errandIds) ||
      errandIds.length === 0 ||
      errandIds.length > MAX_GRANT_ERRANDS ||
      !errandIds.every((id) => typeof id === "string" && ERRAND_ID.test(id))
    ) {
      return failure("invalid_errands", `Choose 1 to ${MAX_GRANT_ERRANDS} of your errands.`);
    }
    const chosen = new Set(errandIds as string[]);
    const open = new Map((await this.#openErrands(actor)).map((errand) => [errand.id, errand]));
    // Same answer for an unknown errand, someone else's and a cancelled one.
    if ([...chosen].some((id) => !open.has(id))) {
      return failure("invalid_errands", "One of those errands is not an open errand of yours.");
    }

    // One approval per request: the delete decides who won.
    if (!(await this.#deps.repo.deleteRequest(request.id))) {
      return failure("unknown_request", "This authorization request was already answered.");
    }
    const now = this.#now();
    const latestExpiry = Math.max(...[...chosen].map((id) => Date.parse(open.get(id)!.expiresAt)));
    const grant: AgentGrant = {
      id: `agrant-${randomUUID()}`,
      clientId: request.clientId,
      delegateId: actor.partyId,
      errandIds: [...chosen],
      resource: request.resource,
      createdAt: now.toISOString(),
      expiresAt: new Date(Math.min(now.getTime() + REFRESH_TTL_MS, latestExpiry)).toISOString(),
    };
    await this.#deps.repo.putGrant(grant);

    const code = this.#mint("CODE");
    await this.#deps.repo.putToken({
      hash: hashSecret(code),
      kind: "CODE",
      grantId: grant.id,
      clientId: request.clientId,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
    });
    log.info("agent authorized", { grantId: grant.id, clientId: grant.clientId, errands: grant.errandIds.length });
    return {
      ok: true,
      redirectTo: redirectWith(request.redirectUri, { code, ...(request.state ? { state: request.state } : {}) }),
    };
  }

  async deny(actor: Actor, requestId: unknown): Promise<AgentAuthResult<{ redirectTo: string }>> {
    const request = await this.#liveRequest(requestId);
    if (!request || !(await this.#deps.repo.deleteRequest(request.id))) {
      return failure("unknown_request", "This authorization request expired or does not exist.");
    }
    log.info("agent refused", { clientId: request.clientId, delegateId: actor.partyId });
    return {
      ok: true,
      redirectTo: redirectWith(request.redirectUri, {
        error: "access_denied",
        error_description: "The delegate refused.",
        ...(request.state ? { state: request.state } : {}),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Token endpoint
  // -------------------------------------------------------------------------

  #mint(kind: AgentTokenKind): string {
    return `${PREFIX[kind]}${this.#newSecret()}`;
  }

  async #issue(grant: AgentGrant): Promise<TokenResponse> {
    const now = this.#now().getTime();
    const access = this.#mint("ACCESS");
    const refresh = this.#mint("REFRESH");
    await this.#deps.repo.putToken({
      hash: hashSecret(access),
      kind: "ACCESS",
      grantId: grant.id,
      clientId: grant.clientId,
      expiresAt: new Date(Math.min(now + ACCESS_TTL_MS, Date.parse(grant.expiresAt))).toISOString(),
    });
    await this.#deps.repo.putToken({
      hash: hashSecret(refresh),
      kind: "REFRESH",
      grantId: grant.id,
      clientId: grant.clientId,
      expiresAt: new Date(Math.min(now + REFRESH_TTL_MS, Date.parse(grant.expiresAt))).toISOString(),
    });
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: Math.floor(Math.min(ACCESS_TTL_MS, Date.parse(grant.expiresAt) - now) / 1000),
      refresh_token: refresh,
      scope: AGENT_SCOPE,
    };
  }

  /** The grant a token record points at, if it can still be used. */
  async #usableGrant(grantId: string): Promise<AgentGrant | undefined> {
    const grant = await this.#deps.repo.getGrant(grantId);
    if (!grant || grant.revokedAt || this.#now().getTime() >= Date.parse(grant.expiresAt)) return undefined;
    return grant;
  }

  /** POST /oauth/token. `form` is the urlencoded body. */
  async token(form: URLSearchParams): Promise<AgentAuthResult<{ token: TokenResponse }>> {
    const resource = form.get("resource");
    if (resource !== null && resource !== this.#deps.resource) {
      return failure("invalid_target", "resource must be this server's MCP endpoint.");
    }
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") return this.#exchangeCode(form);
    if (grantType === "refresh_token") return this.#refresh(form);
    return failure("unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
  }

  async #exchangeCode(form: URLSearchParams): Promise<AgentAuthResult<{ token: TokenResponse }>> {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const invalid = failure("invalid_grant", "The authorization code is not valid.");
    if (!code.startsWith(PREFIX.CODE) || !VERIFIER.test(verifier)) return invalid;

    const record = await this.#deps.repo.getToken(hashSecret(code));
    if (!record || record.kind !== "CODE") return invalid;
    // A code is used once. Presenting it again means it leaked, so the grant it made is revoked (OAuth 2.1).
    if (!(await this.#deps.repo.markTokenUsed(record.hash, this.#now().toISOString()))) {
      await this.#deps.repo.revokeGrant(record.grantId, this.#now().toISOString());
      log.warn("authorization code replayed, grant revoked", { grantId: record.grantId });
      return invalid;
    }
    if (this.#now().getTime() >= Date.parse(record.expiresAt)) return invalid;
    if (record.clientId !== form.get("client_id") || record.redirectUri !== form.get("redirect_uri")) return invalid;
    if (!record.codeChallenge || !sameChallenge(verifier, record.codeChallenge)) return invalid;
    const grant = await this.#usableGrant(record.grantId);
    if (!grant) return invalid;
    return { ok: true, token: await this.#issue(grant) };
  }

  async #refresh(form: URLSearchParams): Promise<AgentAuthResult<{ token: TokenResponse }>> {
    const refresh = form.get("refresh_token") ?? "";
    const invalid = failure("invalid_grant", "The refresh token is not valid.");
    if (!refresh.startsWith(PREFIX.REFRESH)) return invalid;
    const record = await this.#deps.repo.getToken(hashSecret(refresh));
    if (!record || record.kind !== "REFRESH") return invalid;
    if (form.get("client_id") !== record.clientId) return invalid;
    // Rotation: each refresh token works once. A second use means two holders, so the grant ends.
    if (!(await this.#deps.repo.markTokenUsed(record.hash, this.#now().toISOString()))) {
      await this.#deps.repo.revokeGrant(record.grantId, this.#now().toISOString());
      log.warn("refresh token reused, grant revoked", { grantId: record.grantId });
      return invalid;
    }
    if (this.#now().getTime() >= Date.parse(record.expiresAt)) return invalid;
    const grant = await this.#usableGrant(record.grantId);
    if (!grant) return invalid;
    return { ok: true, token: await this.#issue(grant) };
  }

  // -------------------------------------------------------------------------
  // Authentication and revocation
  // -------------------------------------------------------------------------

  /** The agent behind `Authorization: Bearer cmp_at_…`, or undefined. */
  async authenticate(authorization: string | undefined): Promise<AgentPrincipal | undefined> {
    const match = authorization ? ACCESS_TOKEN.exec(authorization.trim()) : null;
    if (!match) return undefined;
    const record = await this.#deps.repo.getToken(hashSecret(match[1]));
    if (!record || record.kind !== "ACCESS" || this.#now().getTime() >= Date.parse(record.expiresAt)) return undefined;
    const grant = await this.#usableGrant(record.grantId);
    const client = grant ? await this.#deps.repo.getClient(grant.clientId) : undefined;
    return grant && client ? { grant, clientId: client.id, clientName: client.name } : undefined;
  }

  /** RFC 7009. The client revoking a token ends its whole grant. Always succeeds, so it reveals nothing. */
  async revokeToken(token: unknown): Promise<void> {
    if (typeof token !== "string" || token.length > 128) return;
    const record = await this.#deps.repo.getToken(hashSecret(token));
    if (record) await this.#deps.repo.revokeGrant(record.grantId, this.#now().toISOString());
  }

  async #roleIn(actor: Actor, grant: AgentGrant): Promise<ViewerRole | undefined> {
    if (grant.delegateId === actor.partyId) return "DELEGATE";
    for (const errandId of grant.errandIds) {
      const errand = await this.#deps.errands.get(errandId);
      if (!errand) continue;
      const access = await this.#deps.mandates.forParticipant(actor, errand.mandateId);
      if (access.ok && access.role === "PAYER") return "PAYER";
    }
    return undefined;
  }

  #view(grant: AgentGrant, clientName: string, viewerRole: ViewerRole): GrantView {
    const status = grant.revokedAt ? "REVOKED" : this.#now().getTime() >= Date.parse(grant.expiresAt) ? "EXPIRED" : "ACTIVE";
    return {
      id: grant.id,
      client: { name: clientName },
      errandIds: grant.errandIds,
      status,
      viewerRole,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
    };
  }

  /** The agents acting for the actor, or on a mandate the actor pays for. */
  async listGrants(actor: Actor): Promise<readonly GrantView[]> {
    const views: GrantView[] = [];
    for (const grant of await this.#deps.repo.listGrants()) {
      const role = await this.#roleIn(actor, grant);
      if (!role) continue;
      const client = await this.#deps.repo.getClient(grant.clientId);
      views.push(this.#view(grant, client?.name ?? "An AI agent", role));
    }
    return views;
  }

  /** The delegate, or a payer of one of its mandates, ends the agent's access at once. */
  async revokeGrant(actor: Actor, grantId: unknown): Promise<AgentAuthResult<{ grant: GrantView }>> {
    const grant = typeof grantId === "string" ? await this.#deps.repo.getGrant(grantId) : undefined;
    const role = grant ? await this.#roleIn(actor, grant) : undefined;
    // Same answer for a grant that does not exist and one that is not yours.
    if (!grant || !role) return failure("unknown_grant", "There is no such agent access.");
    const revoked = (await this.#deps.repo.revokeGrant(grant.id, this.#now().toISOString())) ?? grant;
    const client = await this.#deps.repo.getClient(grant.clientId);
    log.info("agent access revoked", { grantId: grant.id, by: role });
    return { ok: true, grant: this.#view(revoked, client?.name ?? "An AI agent", role) };
  }
}

function redirectWith(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
