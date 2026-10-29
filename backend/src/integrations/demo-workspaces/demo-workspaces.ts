import { randomBytes, randomUUID } from "node:crypto";
import { logger } from "../../lib/log.ts";
import type { DemoWorkspaceHooks } from "./create-demo-workspace.ts";

const log = logger("workspaces");

const MINUTE_MS = 60 * 1000;
/** A demo nobody has touched for this long ends, and its memory is freed. */
export const WORKSPACE_IDLE_MS = 120 * MINUTE_MS;
/** At most this many demos at once. A new one ends the least recently used. */
export const MAX_WORKSPACES = 300;
/** New demos one address may start per window. */
export const MAX_CREATIONS_PER_ADDRESS = 20;
export const CREATION_WINDOW_MS = 60 * MINUTE_MS;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Entry<W> = { id: string; token: string; workspace: W; lastUsed: number };

export type WorkspaceCreation =
  | { ok: true; id: string; token: string; expiresAt: string }
  | { ok: false; code: "TOO_MANY_WORKSPACES"; message: string };

/**
 * The visitors' demo workspaces, in memory. A visitor holds a workspace
 * token, a secret like a session token. PayPal's return and an agent's call
 * carry no workspace token, so the orders and agent tokens a workspace
 * creates are indexed here. A restart, or a workspace's end, forgets it all:
 * PayPal's return for one of its orders then finds nothing, and nothing is
 * captured.
 */
export class DemoWorkspaces<W> {
  readonly #create: (hooks: DemoWorkspaceHooks) => Promise<W>;
  readonly #onEnd: (id: string) => void;
  readonly #now: () => number;
  readonly #newToken: () => string;
  readonly #idleMs: number;
  readonly #max: number;
  readonly #maxPerAddress: number;
  readonly #byId = new Map<string, Entry<W>>();
  readonly #byToken = new Map<string, Entry<W>>();
  readonly #byOrder = new Map<string, string>();
  readonly #byAgentSecret = new Map<string, string>();
  readonly #creations = new Map<string, number[]>();

  constructor(deps: {
    create: (hooks: DemoWorkspaceHooks) => Promise<W>;
    /** Called when a workspace ends, to end its sessions. */
    onEnd?: (id: string) => void;
    now?: () => number;
    newToken?: () => string;
    idleMs?: number;
    max?: number;
    maxPerAddress?: number;
  }) {
    this.#create = deps.create;
    this.#onEnd = deps.onEnd ?? (() => {});
    this.#now = deps.now ?? Date.now;
    this.#newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
    this.#idleMs = deps.idleMs ?? WORKSPACE_IDLE_MS;
    this.#max = deps.max ?? MAX_WORKSPACES;
    this.#maxPerAddress = deps.maxPerAddress ?? MAX_CREATIONS_PER_ADDRESS;
  }

  get size(): number {
    return this.#byId.size;
  }

  /** Starts a demo for a visitor. `address` is who asked, for the per-address limit. */
  async create(address: string): Promise<WorkspaceCreation> {
    const now = this.#now();
    const recent = (this.#creations.get(address) ?? []).filter((at) => now - at < CREATION_WINDOW_MS);
    if (recent.length >= this.#maxPerAddress) {
      this.#creations.set(address, recent);
      return { ok: false, code: "TOO_MANY_WORKSPACES", message: "Too many new demos from this address. Try again later." };
    }
    recent.push(now);
    this.#creations.set(address, recent);

    this.sweep();
    while (this.#byId.size >= this.#max) {
      const oldest = [...this.#byId.values()].reduce((a, b) => (b.lastUsed < a.lastUsed ? b : a));
      this.#end(oldest, "evicted");
    }

    const id = `ws-${randomUUID()}`;
    const workspace = await this.#create({
      onOrder: (orderId) => this.#byOrder.set(orderId, id),
      onAgentToken: (hash) => this.#byAgentSecret.set(hash, id),
    });
    const entry: Entry<W> = { id, token: this.#newToken(), workspace, lastUsed: this.#now() };
    this.#byId.set(id, entry);
    this.#byToken.set(entry.token, entry);
    log.info("workspace started", { workspace: id, live: this.#byId.size });
    return { ok: true, id, token: entry.token, expiresAt: new Date(entry.lastUsed + this.#idleMs).toISOString() };
  }

  /** The workspace id behind a visitor's workspace token. */
  idOf(token: unknown): string | undefined {
    if (typeof token !== "string" || !TOKEN.test(token)) return undefined;
    return this.#live(this.#byToken.get(token))?.id;
  }

  byToken(token: unknown): W | undefined {
    if (typeof token !== "string" || !TOKEN.test(token)) return undefined;
    return this.#live(this.#byToken.get(token))?.workspace;
  }

  byId(id: string | undefined): W | undefined {
    return id ? this.#live(this.#byId.get(id))?.workspace : undefined;
  }

  /** The workspace that created this PayPal order. */
  byOrder(orderId: string): W | undefined {
    return this.byId(this.#byOrder.get(orderId));
  }

  /** The workspace that issued the agent token with this hash. */
  byAgentSecret(hash: string): W | undefined {
    return this.byId(this.#byAgentSecret.get(hash));
  }

  /** Ends idle workspaces and forgets what pointed to them. */
  sweep(): void {
    const now = this.#now();
    for (const entry of [...this.#byId.values()]) {
      if (now - entry.lastUsed >= this.#idleMs) this.#end(entry, "idle");
    }
    for (const [address, times] of this.#creations) {
      if (times.every((at) => now - at >= CREATION_WINDOW_MS)) this.#creations.delete(address);
    }
  }

  #live(entry: Entry<W> | undefined): Entry<W> | undefined {
    if (!entry) return undefined;
    const now = this.#now();
    if (now - entry.lastUsed >= this.#idleMs) {
      this.#end(entry, "idle");
      return undefined;
    }
    entry.lastUsed = now;
    return entry;
  }

  #end(entry: Entry<W>, reason: "idle" | "evicted"): void {
    this.#byId.delete(entry.id);
    this.#byToken.delete(entry.token);
    for (const index of [this.#byOrder, this.#byAgentSecret]) {
      for (const [key, id] of index) if (id === entry.id) index.delete(key);
    }
    this.#onEnd(entry.id);
    log.info("workspace ended", { workspace: entry.id, reason, live: this.#byId.size });
  }
}
