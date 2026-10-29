import { randomBytes } from "node:crypto";
import type { Actor, PartyView } from "../application/mandates.ts";
import type { PartyDirectory } from "../ports/party-directory.ts";
import type { JsonResponse } from "./merchant-categories.ts";

/**
 * DEMO IDENTITY. COMPAS has no user authentication yet. For the hackathon
 * demo, the PayPal app simulations (Pedro's and Andrea's) start a session as one of the
 * demo parties and send its opaque token as `Authorization: Bearer <token>`. The
 * backend resolves the actor from the token, so the browser never sends a
 * payer or delegate id that COMPAS trusts.
 *
 * Anyone who can reach this backend can start a session as any demo party,
 * inside their own demo workspace: no session reaches another visitor's.
 * That is acceptable only because no money moves on a COMPAS session alone:
 * every payment is a PayPal order the payer approves while logged in to
 * their own PayPal, and COMPAS talks only to the PayPal sandbox. It is never
 * enabled with NODE_ENV=production, and `COMPAS_DEMO_IDENTITY=disabled`
 * turns it off. Replace it with the host wallet's real authentication.
 */
export const DEMO_SESSIONS_PATH = "/demo/sessions";
export const DEMO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SESSION_BODY_BYTES = 1024;

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export type DemoIdentityMode = { enabled: true } | { enabled: false; reason: string };

export function readDemoIdentityMode(env: NodeJS.ProcessEnv = process.env): DemoIdentityMode {
  if (env.NODE_ENV?.trim() === "production") {
    return { enabled: false, reason: "NODE_ENV is production" };
  }
  if (env.COMPAS_DEMO_IDENTITY?.trim().toLowerCase() === "disabled") {
    return { enabled: false, reason: "COMPAS_DEMO_IDENTITY is disabled" };
  }
  return { enabled: true };
}

/**
 * Whether a DEMO session may create PayPal orders through `POST /purchases`.
 * Off by default: anyone can start a demo session as Andrea, so a demo
 * session alone must not put orders in front of a real PayPal account. The
 * operator turns it on with `COMPAS_DEMO_PURCHASES=enabled` for a supervised
 * demo. Each visitor's demo still pays only once it has sandbox accounts:
 * the visitor's own, or the presenter's (`DEMO_MERCHANT_PAYPAL_ID`). COMPAS
 * talks to the PayPal sandbox only, and never in production. The policy
 * still decides, and the payer still approves every order at PayPal.
 */
export function readDemoPurchasesMode(env: NodeJS.ProcessEnv = process.env): DemoIdentityMode {
  if (env.NODE_ENV?.trim() === "production") {
    return { enabled: false, reason: "Demo sessions never create PayPal orders in production." };
  }
  if (env.COMPAS_DEMO_PURCHASES?.trim().toLowerCase() !== "enabled") {
    return {
      enabled: false,
      reason: "Demo sessions can't create PayPal orders. Set COMPAS_DEMO_PURCHASES=enabled for a supervised sandbox demo.",
    };
  }
  return { enabled: true };
}

export type DemoSession = { token: string; party: PartyView; expiresAt: string };

/** The actor behind a session, and the visitor's demo workspace it was started in. */
export type ResolvedSession = { actor: Actor; scope?: string };

export class DemoIdentityProvider {
  readonly #parties: PartyDirectory;
  readonly #ttlMs: number;
  readonly #now: () => Date;
  readonly #newToken: () => string;
  readonly #sessions = new Map<string, { partyId: string; scope?: string; expiresAt: number }>();

  constructor(deps: {
    parties: PartyDirectory;
    ttlMs?: number;
    now?: () => Date;
    newToken?: () => string;
  }) {
    this.#parties = deps.parties;
    this.#ttlMs = deps.ttlMs ?? DEMO_SESSION_TTL_MS;
    this.#now = deps.now ?? (() => new Date());
    this.#newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
  }

  /**
   * Starts a session for a known demo party. Unknown ids get nothing. With a
   * scope, the session acts only inside that visitor's demo workspace.
   */
  async start(partyId: unknown, scope?: string): Promise<DemoSession | undefined> {
    if (typeof partyId !== "string" || partyId.length === 0 || partyId.length > 128) return undefined;
    const party = await this.#parties.getById(partyId);
    if (!party) return undefined;
    const token = this.#newToken();
    const expiresAt = this.#now().getTime() + this.#ttlMs;
    this.#sessions.set(token, { partyId: party.id, ...(scope ? { scope } : {}), expiresAt });
    return {
      token,
      party: { id: party.id, displayName: party.displayName },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** The session behind `Authorization: Bearer <token>`, or undefined. */
  resolve(authorization: string | undefined): ResolvedSession | undefined {
    const match = authorization ? BEARER.exec(authorization.trim()) : null;
    if (!match) return undefined;
    const session = this.#sessions.get(match[1]);
    if (!session) return undefined;
    if (this.#now().getTime() >= session.expiresAt) {
      this.#sessions.delete(match[1]);
      return undefined;
    }
    return { actor: { partyId: session.partyId }, ...(session.scope ? { scope: session.scope } : {}) };
  }

  /** The actor behind `Authorization: Bearer <token>`, or undefined. */
  authenticate(authorization: string | undefined): Actor | undefined {
    return this.resolve(authorization)?.actor;
  }

  /** Ends every session of a scope, and drops expired ones. */
  endScope(scope: string): void {
    const now = this.#now().getTime();
    for (const [token, session] of this.#sessions) {
      if (session.scope === scope || now >= session.expiresAt) this.#sessions.delete(token);
    }
  }
}

/**
 * POST /demo/sessions with `{ "partyId": "…", "workspace": "…" }`. With
 * `scopeOf`, the workspace token is required and names the visitor's demo
 * workspace; an ended one answers UNKNOWN_WORKSPACE, so the browser starts
 * another.
 */
export async function handleStartDemoSession(
  body: Uint8Array,
  provider: Pick<DemoIdentityProvider, "start">,
  scopeOf?: (workspaceToken: unknown) => string | undefined,
): Promise<JsonResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return { status: 400, body: { error: "INVALID_BODY", message: "body is not UTF-8 JSON" } };
  }
  const request = parsed as { partyId?: unknown; workspace?: unknown } | null;
  let scope: string | undefined;
  if (scopeOf) {
    scope = scopeOf(request?.workspace);
    if (!scope) {
      return { status: 404, body: { error: "UNKNOWN_WORKSPACE", message: "This demo ended. Start a new one." } };
    }
  }
  const session = await provider.start(request?.partyId, scope);
  if (!session) {
    return { status: 404, body: { error: "UNKNOWN_PARTY", message: "not a demo party" } };
  }
  return { status: 201, body: { ...session, identity: "DEMO" } };
}
