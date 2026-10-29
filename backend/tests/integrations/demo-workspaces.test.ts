import assert from "node:assert/strict";
import test from "node:test";
import { DemoIdentityProvider, handleStartDemoSession } from "../../src/api/demo-identity.ts";
import { bearerSecretHash, oauthSecretHash } from "../../src/api/demo-workspaces.ts";
import { hashSecret } from "../../src/application/agent-auth.ts";
import type { AgentClient, AgentGrant } from "../../src/domain/agent.ts";
import { InMemoryAgentRepository } from "../../src/integrations/agents/in-memory-agent-repository.ts";
import {
  createDemoWorkspace,
  type DemoWorkspaceHooks,
  type DemoWorkspaceShared,
} from "../../src/integrations/demo-workspaces/create-demo-workspace.ts";
import { DemoWorkspaces } from "../../src/integrations/demo-workspaces/demo-workspaces.ts";
import { WorkspaceAgentRepository } from "../../src/integrations/demo-workspaces/workspace-agent-repository.ts";
import { createDemoPartyDirectory, StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import type { PayPalGateway } from "../../src/ports/paypal-gateway.ts";
import { ANDREA, GLADYS, PEDRO } from "../application/mandate-test-kit.ts";

const MINUTE = 60 * 1000;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** A registry over plain objects, so only its own bookkeeping is under test. */
function registry(options: { max?: number; maxPerAddress?: number } = {}) {
  let now = 0;
  let n = 0;
  const ended: string[] = [];
  const workspaces = new DemoWorkspaces<{ name: string; hooks: DemoWorkspaceHooks }>({
    create: async (hooks) => ({ name: `ws${++n}`, hooks }),
    onEnd: (id) => ended.push(id),
    now: () => now,
    newToken: () => String(n + 1).padStart(43, "t"),
    ...options,
  });
  return { workspaces, ended, advance: (ms: number) => (now += ms) };
}

async function started(workspaces: DemoWorkspaces<unknown>, address = "198.51.100.7") {
  const created = await workspaces.create(address);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  return created;
}

test("a workspace token finds its workspace; a forged one finds nothing", async () => {
  const { workspaces } = registry();
  const a = await started(workspaces);
  assert.equal(workspaces.idOf(a.token), a.id);
  assert.equal(workspaces.byId(a.id), workspaces.byToken(a.token));
  assert.equal(workspaces.byToken("x".repeat(43)), undefined);
  assert.equal(workspaces.byToken(a.id), undefined, "the internal id is not a credential");
  assert.equal(workspaces.byToken(undefined), undefined);
});

test("PayPal's return and an agent's token find the workspace that created them, and no other", async () => {
  const { workspaces } = registry();
  const a = await started(workspaces);
  const b = await started(workspaces);
  const wa = workspaces.byId(a.id)!;
  const wb = workspaces.byId(b.id)!;
  wa.hooks.onOrder("5O190127TN364715T");
  wb.hooks.onAgentToken("hash-b");
  assert.equal(workspaces.byOrder("5O190127TN364715T"), wa);
  assert.equal(workspaces.byAgentSecret("hash-b"), wb);
  assert.equal(workspaces.byOrder("8AB12345CD678901E"), undefined);
  assert.equal(workspaces.byAgentSecret("hash-a"), undefined);
});

test("an idle workspace ends: its token, orders and agent tokens find nothing, and its sessions are ended", async () => {
  const { workspaces, ended, advance } = registry();
  const a = await started(workspaces);
  workspaces.byId(a.id)!.hooks.onOrder("5O190127TN364715T");
  advance(119 * MINUTE);
  assert.ok(workspaces.byToken(a.token), "still in use just before the idle limit");
  advance(119 * MINUTE);
  assert.ok(workspaces.byToken(a.token), "each use restarts the idle clock");
  advance(120 * MINUTE);
  assert.equal(workspaces.byOrder("5O190127TN364715T"), undefined);
  assert.equal(workspaces.byToken(a.token), undefined);
  assert.deepEqual(ended, [a.id]);
  assert.equal(workspaces.size, 0);
});

test("at the cap, a new workspace ends the least recently used one", async () => {
  const { workspaces, ended, advance } = registry({ max: 2 });
  const a = await started(workspaces);
  advance(MINUTE);
  const b = await started(workspaces);
  advance(MINUTE);
  workspaces.byToken(a.token);
  advance(MINUTE);
  const c = await started(workspaces);
  assert.deepEqual(ended, [b.id]);
  assert.ok(workspaces.byToken(a.token));
  assert.ok(workspaces.byToken(c.token));
  assert.equal(workspaces.size, 2);
});

test("one address may start only so many workspaces per hour", async () => {
  const { workspaces, advance } = registry({ maxPerAddress: 2 });
  await started(workspaces, "198.51.100.7");
  await started(workspaces, "198.51.100.7");
  const refused = await workspaces.create("198.51.100.7");
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? undefined : refused.code, "TOO_MANY_WORKSPACES");
  await started(workspaces, "203.0.113.9");
  advance(60 * MINUTE);
  await started(workspaces, "198.51.100.7");
});

test("a session starts only inside a live workspace, and ends with it", async () => {
  const identity = new DemoIdentityProvider({ parties: new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro" }]) });
  const scopes = new Map([["w".repeat(43), "ws-a"]]);
  const scopeOf = (token: unknown) => (typeof token === "string" ? scopes.get(token) : undefined);

  const ended = await handleStartDemoSession(encode({ partyId: PEDRO.partyId, workspace: "z".repeat(43) }), identity, scopeOf);
  assert.equal(ended.status, 404);
  assert.equal(ended.body.error, "UNKNOWN_WORKSPACE");
  const missing = await handleStartDemoSession(encode({ partyId: PEDRO.partyId }), identity, scopeOf);
  assert.equal(missing.body.error, "UNKNOWN_WORKSPACE");

  const response = await handleStartDemoSession(encode({ partyId: PEDRO.partyId, workspace: "w".repeat(43) }), identity, scopeOf);
  assert.equal(response.status, 201);
  const bearer = `Bearer ${String(response.body.token)}`;
  assert.deepEqual(identity.resolve(bearer), { actor: PEDRO, scope: "ws-a" });

  identity.endScope("ws-a");
  assert.equal(identity.resolve(bearer), undefined);
});

test("agent clients and pending requests are shared; grants and tokens stay in their workspace", async () => {
  const shared = new InMemoryAgentRepository();
  const announced: string[] = [];
  const a = new WorkspaceAgentRepository({ shared, own: new InMemoryAgentRepository(), onToken: (hash) => announced.push(hash) });
  const b = new WorkspaceAgentRepository({ shared, own: new InMemoryAgentRepository(), onToken: () => {} });

  await a.putClient({ id: "aclient-1" } as AgentClient);
  assert.ok(await b.getClient("aclient-1"), "a client registered once is known to every workspace");

  await a.putGrant({ id: "agrant-1", clientId: "aclient-1" } as AgentGrant);
  assert.ok(await a.getGrant("agrant-1"));
  assert.equal(await b.getGrant("agrant-1"), undefined);
  assert.deepEqual(await b.listGrants(), []);

  await a.putToken({ hash: "hash-1", kind: "ACCESS", grantId: "agrant-1", expiresAt: "2026-10-30T00:00:00Z" } as never);
  assert.deepEqual(announced, ["hash-1"]);
  assert.equal(await b.getToken("hash-1"), undefined);
});

test("an agent call is routed by the hash of the secret it carries", () => {
  assert.equal(bearerSecretHash("Bearer cmp_at_abc"), hashSecret("cmp_at_abc"));
  assert.equal(bearerSecretHash(undefined), undefined);
  const form = (body: string) => new TextEncoder().encode(body);
  assert.equal(oauthSecretHash("/oauth/token", form("grant_type=authorization_code&code=cmp_ac_x")), hashSecret("cmp_ac_x"));
  assert.equal(oauthSecretHash("/oauth/token", form("grant_type=refresh_token&refresh_token=cmp_rt_y")), hashSecret("cmp_rt_y"));
  assert.equal(oauthSecretHash("/oauth/revoke", form("token=cmp_at_z")), hashSecret("cmp_at_z"));
  assert.equal(oauthSecretHash("/oauth/register", form("code=cmp_ac_x")), undefined);
});

/** Shared deps no test here reaches: PayPal, the registry and the analyst throw if called. */
function sharedDeps(gateway: PayPalGateway): DemoWorkspaceShared {
  const unused = new Proxy({}, { get: () => () => { throw new Error("not used in this test"); } });
  return {
    paypal: { gateway, configured: true },
    merchants: unused as never,
    registry: unused as never,
    catalogs: unused as never,
    mappings: unused as never,
    cumRegistry: unused as never,
    model: unused as never,
    search: unused as never,
    execution: { allowed: true },
    agents: new InMemoryAgentRepository(),
    publicUrl: "http://localhost:4000",
    mcpUrl: "http://localhost:4000/mcp",
  };
}

const NO_HOOKS: DemoWorkspaceHooks = { onOrder: () => {}, onAgentToken: () => {} };

test("two visitors' Pedros don't see each other's budgets", async () => {
  const shared = sharedDeps({} as PayPalGateway);
  const a = await createDemoWorkspace(shared, createDemoPartyDirectory({}), NO_HOOKS);
  const b = await createDemoWorkspace(shared, createDemoPartyDirectory({}), NO_HOOKS);
  const now = Date.now();
  const created = await a.mandates.create(PEDRO, {
    delegateId: ANDREA.partyId,
    beneficiaryId: GLADYS.partyId,
    categories: ["MEDICATION"],
    budget: { value: "4000", assetCode: "USD", assetScale: 2 },
    validFrom: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * MINUTE).toISOString(),
  });
  assert.equal(created.ok, true);
  assert.equal((await a.mandates.list(PEDRO, "PAYER")).length, 1);
  assert.equal((await b.mandates.list(PEDRO, "PAYER")).length, 0);
  assert.equal((await b.mandates.list(ANDREA, "DELEGATE")).length, 0);
});

test("a workspace announces every PayPal order it creates", async () => {
  const announced: string[] = [];
  const gateway = {
    createOrder: async () => ({ id: "5O190127TN364715T", status: "PAYER_ACTION_REQUIRED" }),
  } as unknown as PayPalGateway;
  const workspace = await createDemoWorkspace(sharedDeps(gateway), createDemoPartyDirectory({}), {
    onOrder: (orderId) => announced.push(orderId),
    onAgentToken: () => {},
  });
  await workspace.payments.createOrder({} as never);
  assert.deepEqual(announced, ["5O190127TN364715T"]);
});
