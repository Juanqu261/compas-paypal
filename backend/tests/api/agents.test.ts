import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpRequest, MCP_TOOLS } from "../../src/api/mcp.ts";
import { handleAgentConsentRequest, handleOAuthRequest, isAgentConsentPath, isOAuthPath } from "../../src/api/oauth.ts";
import { ANDREA, PEDRO, STRANGER } from "../application/mandate-test-kit.ts";
import { agentKit, type AgentKit, LOSARTAN, pkce, PHARMACY, REDIRECT, RESOURCE } from "../application/agent-test-kit.ts";

const ISSUER = "https://compas.test";
const CONSENT = "https://app.test/agents/authorize";
const METADATA = `${ISSUER}/.well-known/oauth-protected-resource/mcp`;
const bytes = (value: string) => new TextEncoder().encode(value);

function oauth(kit: AgentKit, method: string, path: string, rawBody?: Uint8Array) {
  return handleOAuthRequest(
    { method, url: new URL(path, ISSUER), ...(rawBody ? { rawBody } : {}) },
    { auth: kit.auth, issuer: ISSUER, consentUrl: CONSENT },
  );
}

function consent(kit: AgentKit, actor: { partyId: string }, method: string, path: string, body?: unknown) {
  return handleAgentConsentRequest({ method, url: new URL(path, ISSUER), body }, actor, { auth: kit.auth });
}

function mcp(kit: AgentKit, body: unknown, extra: { authorization?: string; origin?: string; protocolVersion?: string; method?: string } = {}) {
  return handleMcpRequest(
    { method: extra.method ?? "POST", ...extra, body },
    { auth: kit.auth, shopping: kit.shopping, resourceMetadataUrl: METADATA, allowedOrigins: new Set([ISSUER]) },
  );
}

const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

test("discovery tells a client where to authorize, and that PKCE S256 is the only way", async () => {
  const kit = await agentKit();
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const resource = await oauth(kit, "GET", path);
    assert.deepEqual(resource.body?.authorization_servers, [ISSUER]);
    assert.equal(resource.body?.resource, RESOURCE);
  }
  const server = (await oauth(kit, "GET", "/.well-known/oauth-authorization-server")).body!;
  assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(server.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(server.registration_endpoint, `${ISSUER}/oauth/register`);
  assert.ok(isOAuthPath("/oauth/token") && !isOAuthPath("/mandates"));
  assert.ok(isAgentConsentPath("/agents/grants") && !isAgentConsentPath("/agents"));
  assert.equal((await oauth(kit, "POST", "/.well-known/oauth-authorization-server")).status, 405);
});

test("an agent goes from registration to a purchase through the HTTP handlers", async () => {
  const kit = await agentKit();

  const registered = await oauth(kit, "POST", "/oauth/register", bytes(JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT] })));
  assert.equal(registered.status, 201);
  assert.equal(registered.body?.token_endpoint_auth_method, "none");
  const clientId = String(registered.body?.client_id);

  const { verifier, challenge } = pkce();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
  });
  const authorize = await oauth(kit, "GET", `/oauth/authorize?${query}`);
  assert.equal(authorize.status, 302);
  const toConsent = new URL(authorize.location!);
  assert.equal(toConsent.origin + toConsent.pathname, CONSENT);
  const requestId = toConsent.searchParams.get("request")!;

  // The delegate sees who is asking and their own errands, and picks one.
  const shown = await consent(kit, ANDREA, "GET", `/agents/requests/${requestId}`);
  assert.equal(shown.status, 200);
  assert.equal((shown.body?.client as { name: string }).name, "Claude");
  const approved = await consent(kit, ANDREA, "POST", `/agents/requests/${requestId}/approve`, { errandIds: ["errand-losartan"] });
  assert.equal(approved.status, 200);
  const back = new URL(String(approved.body?.redirectTo));
  assert.equal(back.origin + back.pathname, REDIRECT);
  assert.equal(back.searchParams.get("state"), "xyz");

  const token = await oauth(
    kit,
    "POST",
    "/oauth/token",
    bytes(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code: back.searchParams.get("code")!,
        code_verifier: verifier,
      }).toString(),
    ),
  );
  assert.equal(token.status, 200);
  assert.equal(token.headers?.["cache-control"], "no-store");
  const authorization = `Bearer ${token.body?.access_token}`;

  const initialized = await mcp(kit, rpc("initialize", { protocolVersion: "2025-06-18" }), { authorization });
  assert.equal(initialized.status, 200);
  assert.equal((initialized.body as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");

  const called = await mcp(
    kit,
    rpc("tools/call", { name: "propose_purchase", arguments: { errandId: "errand-losartan", merchantId: PHARMACY, items: [{ skuId: LOSARTAN.skuId }] } }, 7),
    { authorization },
  );
  const result = (called.body as { id: number; result: { isError: boolean; content: { text: string }[]; structuredContent: { outcome: string } } });
  assert.equal(result.id, 7);
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.outcome, "ALLOW");
  assert.equal(JSON.parse(result.result.content[0].text).outcome, "ALLOW");
  assert.equal(kit.paypal.calls.create.length, 1);
});

test("authorize sends a bad redirect URI nowhere and a bad request back to the client", async () => {
  const kit = await agentKit();
  const registered = await oauth(kit, "POST", "/oauth/register", bytes(JSON.stringify({ redirect_uris: [REDIRECT] })));
  const clientId = String(registered.body?.client_id);
  const base = { client_id: clientId, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256" };

  const evil = await oauth(kit, "GET", `/oauth/authorize?${new URLSearchParams({ ...base, redirect_uri: "https://evil.test/cb" })}`);
  assert.equal(evil.status, 400);
  assert.equal(evil.location, undefined);
  const noPkce = await oauth(kit, "GET", `/oauth/authorize?${new URLSearchParams({ client_id: clientId, response_type: "code" })}`);
  assert.equal(noPkce.status, 302);
  assert.equal(new URL(noPkce.location!).searchParams.get("error"), "invalid_request");
});

test("registration and token errors are OAuth errors, and junk bodies do not crash", async () => {
  const kit = await agentKit();
  const bad = await oauth(kit, "POST", "/oauth/register", bytes(JSON.stringify({ redirect_uris: ["http://evil.test/cb"] })));
  assert.equal(bad.status, 400);
  assert.equal(bad.body?.error, "invalid_redirect_uri");
  assert.equal((await oauth(kit, "POST", "/oauth/register", bytes("not json"))).status, 400);
  assert.equal((await oauth(kit, "POST", "/oauth/register")).status, 400);

  const token = await oauth(kit, "POST", "/oauth/token", bytes("grant_type=password&username=a"));
  assert.equal(token.status, 400);
  assert.equal(token.body?.error, "unsupported_grant_type");
  assert.equal((await oauth(kit, "POST", "/oauth/token", new Uint8Array([0xff, 0xfe]))).status, 400);
  assert.equal((await oauth(kit, "GET", "/oauth/token")).status, 405);
  assert.equal((await oauth(kit, "POST", "/oauth/revoke", bytes("token=cmp_rt_nope"))).status, 200);
});

test("only the delegate answers an agent request, and only the delegate or payer lists and revokes grants", async () => {
  const kit = await agentKit();
  const { principal, requestId } = await kit.authorize();
  assert.equal((await consent(kit, ANDREA, "GET", `/agents/requests/${requestId}`)).status, 404);

  const mine = await consent(kit, ANDREA, "GET", "/agents/grants");
  assert.equal((mine.body?.grants as unknown[]).length, 1);
  assert.deepEqual((await consent(kit, STRANGER, "GET", "/agents/grants")).body?.grants, []);
  assert.equal((await consent(kit, STRANGER, "POST", `/agents/grants/${principal.grant.id}/revoke`)).status, 404);
  assert.equal((await consent(kit, ANDREA, "GET", `/agents/grants/${principal.grant.id}/revoke`)).status, 405);
  const revoked = await consent(kit, PEDRO, "POST", `/agents/grants/${principal.grant.id}/revoke`);
  assert.equal(revoked.status, 200);
  assert.equal((revoked.body?.grant as { status: string }).status, "REVOKED");
});

test("MCP: no token gets a 401 that points at the authorization server", async () => {
  const kit = await agentKit();
  for (const authorization of [undefined, "Bearer cmp_at_nope", "Basic abc", `Bearer ${"x".repeat(43)}`]) {
    const refused = await mcp(kit, rpc("tools/list"), authorization ? { authorization } : {});
    assert.equal(refused.status, 401);
    assert.equal(refused.headers?.["www-authenticate"], `Bearer resource_metadata="${METADATA}"`);
  }
});

test("MCP: the tools are exactly the four Compas ones, and none can pay", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  const authorization = `Bearer ${token.access_token}`;
  const listed = (await mcp(kit, rpc("tools/list"), { authorization })).body as { result: { tools: { name: string; description: string }[] } };
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    ["search_eligible_merchants", "check_purchase", "propose_purchase", "get_mandate_status"],
  );
  assert.deepEqual(listed.result.tools, JSON.parse(JSON.stringify(MCP_TOOLS)));
  // No tool takes an amount, a category, a payee or a payer: the schemas leave them out.
  const schemas = JSON.stringify(MCP_TOOLS.map((tool) => tool.inputSchema));
  for (const forbidden of ["amount", "category", "payee", "payer", "paypal", "approve", "confirm"]) {
    assert.ok(!schemas.toLowerCase().includes(`"${forbidden}`), `a tool schema mentions ${forbidden}`);
  }
});

test("MCP: protocol details a client relies on", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  const authorization = `Bearer ${token.access_token}`;

  const newer = (await mcp(kit, rpc("initialize", { protocolVersion: "2099-01-01" }), { authorization })).body as { result: { protocolVersion: string } };
  assert.equal(newer.result.protocolVersion, "2025-06-18");
  assert.deepEqual((await mcp(kit, rpc("ping"), { authorization })).body, { jsonrpc: "2.0", id: 1, result: {} });

  // A notification has no answer.
  const notification = await mcp(kit, { jsonrpc: "2.0", method: "notifications/initialized" }, { authorization });
  assert.equal(notification.status, 202);
  assert.equal(notification.body, undefined);

  const unknownMethod = (await mcp(kit, rpc("resources/list"), { authorization })).body as { error: { code: number } };
  assert.equal(unknownMethod.error.code, -32601);
  const unknownTool = (await mcp(kit, rpc("tools/call", { name: "pay_with_paypal", arguments: {} }), { authorization })).body as { error: { code: number } };
  assert.equal(unknownTool.error.code, -32602);
  const malformed = (await mcp(kit, { hello: "world" }, { authorization })).body as { error: { code: number } };
  assert.equal(malformed.error.code, -32600);

  const batch = (await mcp(kit, [rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc("ping", undefined, 2)], { authorization })).body as { id: number }[];
  assert.deepEqual(batch.map((answer) => answer.id), [1, 2]);

  assert.equal((await mcp(kit, undefined, { authorization })).status, 400);
  assert.equal((await mcp(kit, [], { authorization })).status, 400);
  assert.equal((await mcp(kit, rpc("ping"), { authorization, method: "GET" })).status, 405);
  assert.equal((await mcp(kit, rpc("ping"), { authorization, protocolVersion: "1999-01-01" })).status, 400);
  assert.equal((await mcp(kit, rpc("ping"), { authorization, protocolVersion: "2025-03-26" })).status, 200);
});

test("MCP: a page in a browser from another origin is refused, even with a valid token", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  const authorization = `Bearer ${token.access_token}`;
  assert.equal((await mcp(kit, rpc("ping"), { authorization, origin: "https://evil.test" })).status, 403);
  assert.equal((await mcp(kit, rpc("ping"), { authorization, origin: ISSUER })).status, 200);
});

test("MCP: a PayPal failure reaches the agent as Compas's own retryable message, with no upstream detail", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  kit.paypal.failures.create = Object.assign(new Error("PayPal said: secret detail"), { code: "UPSTREAM" });
  const called = await mcp(
    kit,
    rpc("tools/call", { name: "propose_purchase", arguments: { errandId: "errand-losartan", merchantId: PHARMACY, items: [{ skuId: LOSARTAN.skuId }] } }),
    { authorization: `Bearer ${token.access_token}` },
  );
  const result = (called.body as { result: { isError: boolean; structuredContent: { error: string } } }).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "PAYMENT_NOT_STARTED");
  assert.ok(!JSON.stringify(called.body).includes("secret detail"));
});

test("MCP: a tool that throws answers generically", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  const broken = {
    proposePurchase: async () => {
      throw new Error("PayPal said: secret detail");
    },
  };
  const called = await handleMcpRequest(
    {
      method: "POST",
      authorization: `Bearer ${token.access_token}`,
      body: rpc("tools/call", { name: "propose_purchase", arguments: {} }),
    },
    { auth: kit.auth, shopping: broken as never, resourceMetadataUrl: METADATA, allowedOrigins: new Set() },
  );
  const answer = called.body as { error: { code: number; message: string } };
  assert.equal(answer.error.code, -32603);
  assert.ok(!JSON.stringify(answer).includes("secret detail"));
});

test("MCP: revoking the grant stops the next call", async () => {
  const kit = await agentKit();
  const { token, principal } = await kit.authorize();
  const authorization = `Bearer ${token.access_token}`;
  assert.equal((await mcp(kit, rpc("ping"), { authorization })).status, 200);
  await consent(kit, ANDREA, "POST", `/agents/grants/${principal.grant.id}/revoke`);
  assert.equal((await mcp(kit, rpc("ping"), { authorization })).status, 401);
});
