import { randomBytes, randomUUID } from "node:crypto";
import { logger } from "../../lib/log.ts";
import type { DemoWorkspaceHooks } from "./create-demo-workspace.ts";

const log = logger("workspaces");

const MINUTE_MS = 60 * 1000;
/** A demo nobody has touched for this long ends, and its memory is freed. */
export const WORKSPACE_IDLE_MS = 120 * MINUTE_MS;
/** At most this many demos at once, to bound memory. A new one ends the least recently used. */
export const MAX_WORKSPACES = 300;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Entry<W> = { id: string; token: string; workspace: W; lastUsed: number };

export type WorkspaceCreation = { id: string; token: string; expiresAt: string };

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
  readonly #byId = new Map<string, Entry<W>>();
  readonly #byToken = new Map<string, Entry<W>>();
  readonly #byOrder = new Map<string, string>();
  readonly #byAgentSecret = new Map<string, string>();

  constructor(deps: {
    create: (hooks: DemoWorkspaceHooks) => Promise<W>;
    /** Called when a workspace ends, to end its sessions. */
    onEnd?: (id: string) => void;
    now?: () => number;
    newToken?: () => string;
    idleMs?: number;
    max?: number;
  }) {
    this.#create = deps.create;
    this.#onEnd = deps.onEnd ?? (() => {});
    this.#now = deps.now ?? Date.now;
    this.#newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
    this.#idleMs = deps.idleMs ?? WORKSPACE_IDLE_MS;
    this.#max = deps.max ?? MAX_WORKSPACES;
  }

  get size(): number {
    return this.#byId.size;
  }

  /** Starts a demo for a visitor. */
  async create(): Promise<WorkspaceCreation> {
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
    return { id, token: entry.token, expiresAt: new Date(entry.lastUsed + this.#idleMs).toISOString() };
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

  /** Ends a visitor's workspace now, as "Reset my demo" does. False for a token that names none. */
  end(token: unknown): boolean {
    if (typeof token !== "string" || !TOKEN.test(token)) return false;
    const entry = this.#byToken.get(token);
    if (!entry) return false;
    this.#end(entry, "reset");
    return true;
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

  #end(entry: Entry<W>, reason: "idle" | "evicted" | "reset"): void {
    this.#byId.delete(entry.id);
    this.#byToken.delete(entry.token);
    for (const index of [this.#byOrder, this.#byAgentSecret]) {
      for (const [key, id] of index) if (id === entry.id) index.delete(key);
    }
    this.#onEnd(entry.id);
    log.info("workspace ended", { workspace: entry.id, reason, live: this.#byId.size });
  }
}
