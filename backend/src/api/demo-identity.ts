import { randomBytes } from "node:crypto";
import type { Actor, PartyView } from "../application/mandates.ts";
import type { PartyDirectory } from "../ports/party-directory.ts";
import type { JsonResponse } from "./merchant-categories.ts";

/**
 * DEMO IDENTITY. COMPAS has no user authentication yet. For the hackathon
 * demo, the ARQ and Nequi simulations start a session as one of the demo
 * parties and send its opaque token as `Authorization: Bearer <token>`. The
 * backend resolves the actor from the token, so the browser never sends a
 * payer or delegate id that COMPAS trusts.
 *
 * Anyone who can reach this backend can start a session as any demo party.
 * That is acceptable only because no money moves on a COMPAS session alone:
 * a budget becomes ACTIVE only after the payer consents at their own Open
 * Payments wallet, and the demo wallets are on the test network. It is never
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

/** The Interledger test network. Wallets here hold test money only. */
const TEST_NETWORK_HOST = "interledger-test.dev";

function onTestNetwork(walletAddress: string | undefined): boolean {
  const raw = walletAddress?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw.startsWith("$") ? `https://${raw.slice(1)}` : raw).hostname;
    return host === TEST_NETWORK_HOST || host.endsWith(`.${TEST_NETWORK_HOST}`);
  } catch {
    return false;
  }
}

/**
 * Whether a DEMO session may ask a payer's wallet for a real Open Payments
 * grant. Off by default: anyone can start a demo session as Pedro, so a demo
 * session alone must not reach a real wallet. The operator turns it on with
 * `COMPAS_DEMO_PAYER_GRANTS=enabled` for a supervised demo, and only when the
 * COMPAS client and Pedro's wallet are on the Interledger test network.
 * Never in production. The payer still consents at their own wallet.
 */
export function readDemoPayerGrantsMode(env: NodeJS.ProcessEnv = process.env): DemoIdentityMode {
  if (env.NODE_ENV?.trim() === "production") {
    return { enabled: false, reason: "Demo sessions never ask a wallet for a grant in production." };
  }
  if (env.COMPAS_DEMO_PAYER_GRANTS?.trim().toLowerCase() !== "enabled") {
    return {
      enabled: false,
      reason: "Demo sessions can't ask a real wallet for a grant. Set COMPAS_DEMO_PAYER_GRANTS=enabled for a supervised test-network demo.",
    };
  }
  if (!onTestNetwork(env.CLIENT_WALLET_ADDRESS) || !onTestNetwork(env.DEMO_PAYER_WALLET_ADDRESS)) {
    return {
      enabled: false,
      reason: `COMPAS_DEMO_PAYER_GRANTS needs CLIENT_WALLET_ADDRESS and DEMO_PAYER_WALLET_ADDRESS on ${TEST_NETWORK_HOST}.`,
    };
  }
  return { enabled: true };
}

export type DemoSession = { token: string; party: PartyView; expiresAt: string };

export class DemoIdentityProvider {
  readonly #parties: PartyDirectory;
  readonly #ttlMs: number;
  readonly #now: () => Date;
  readonly #newToken: () => string;
  readonly #sessions = new Map<string, { partyId: string; expiresAt: number }>();

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

  /** Starts a session for a known demo party. Unknown ids get nothing. */
  async start(partyId: unknown): Promise<DemoSession | undefined> {
    if (typeof partyId !== "string" || partyId.length === 0 || partyId.length > 128) return undefined;
    const party = await this.#parties.getById(partyId);
    if (!party) return undefined;
    const token = this.#newToken();
    const expiresAt = this.#now().getTime() + this.#ttlMs;
    this.#sessions.set(token, { partyId: party.id, expiresAt });
    return {
      token,
      party: { id: party.id, displayName: party.displayName },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** The actor behind `Authorization: Bearer <token>`, or undefined. */
  authenticate(authorization: string | undefined): Actor | undefined {
    const match = authorization ? BEARER.exec(authorization.trim()) : null;
    if (!match) return undefined;
    const session = this.#sessions.get(match[1]);
    if (!session) return undefined;
    if (this.#now().getTime() >= session.expiresAt) {
      this.#sessions.delete(match[1]);
      return undefined;
    }
    return { partyId: session.partyId };
  }
}

/** POST /demo/sessions with `{ "partyId": "…" }`. */
export async function handleStartDemoSession(
  body: Uint8Array,
  provider: Pick<DemoIdentityProvider, "start">,
): Promise<JsonResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return { status: 400, body: { error: "INVALID_BODY", message: "body is not UTF-8 JSON" } };
  }
  const session = await provider.start((parsed as { partyId?: unknown } | null)?.partyId);
  if (!session) {
    return { status: 404, body: { error: "UNKNOWN_PARTY", message: "not a demo party" } };
  }
  return { status: 201, body: { ...session, identity: "DEMO" } };
}
