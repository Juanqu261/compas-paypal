import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { handleMcpRequest } from "../../src/api/mcp.ts";
import { handleOAuthRequest } from "../../src/api/oauth.ts";
import { AgentAuthService } from "../../src/application/agent-auth.ts";
import { DemoAgentRuns, type DemoAgentFixtures, type DemoAgentRunView, type RunStep } from "../../src/application/demo-agent-run.ts";
import { createShoppingAgentModel } from "../../src/integrations/anthropic/claude-shopping-agent.ts";
import type { FetchLike } from "../../src/lib/fetch-like.ts";
import { ANDREA, NOW } from "./mandate-test-kit.ts";
import { agentKit, type AgentKit, IBUPROFEN, LOOKALIKE, LOSARTAN, PHARMACY } from "./agent-test-kit.ts";

/** npm test does not load backend/.env; pull ANTHROPIC_API_KEY only for this optional live E2E. */
function envWithLocalKey(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (env.ANTHROPIC_API_KEY?.trim()) return env;
  try {
    const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../.env"), "utf8");
    const line = text.split(/\r?\n/).find((row) => /^\s*ANTHROPIC_API_KEY\s*=/.test(row) && !row.trim().startsWith("#"));
    const value = line?.split("=", 2)[1]?.trim().replace(/^["']|["']$/g, "");
    if (value) env.ANTHROPIC_API_KEY = value;
  } catch {
    // no local .env
  }
  return env;
}

/**
 * Real Claude + real HTTP (loopback) MCP/OAuth. Fake PayPal only — no Sandbox
 * captures. Skips when ANTHROPIC_API_KEY is unset.
 */
const model = createShoppingAgentModel(envWithLocalKey());
const maybe = model ? test : test.skip;

const FIXTURES: DemoAgentFixtures = {
  pharmacyId: PHARMACY,
  errandSku: LOSARTAN.skuId,
  lure: { merchantId: LOOKALIKE, skuId: "fo-losartan-50", hiddenText: "x" },
  extra: { skuId: IBUPROFEN.skuId, hiddenText: "y" },
  foreignErrandId: "errand-00000000-0000-4000-8000-000000000000",
};

async function withHttpServer(
  kit: AgentKit,
): Promise<{ origin: string; mcpUrl: string; auth: AgentAuthService; fetch: FetchLike; close: () => Promise<void> }> {
  // Bind AgentAuth resource to the loopback MCP URL (not https://compas.test/mcp).
  let auth!: AgentAuthService;
  let origin = "";
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", origin);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const raw = Buffer.concat(chunks);
      const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
      const protocolVersion = typeof req.headers["mcp-protocol-version"] === "string" ? req.headers["mcp-protocol-version"] : undefined;
      const bodyText = raw.length ? raw.toString("utf8") : undefined;
      const answer =
        url.pathname === "/mcp"
          ? await handleMcpRequest(
              {
                method: req.method ?? "GET",
                ...(authorization ? { authorization } : {}),
                ...(protocolVersion ? { protocolVersion } : {}),
                body: bodyText ? JSON.parse(bodyText) : undefined,
              },
              {
                auth,
                shopping: kit.shopping,
                resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
                allowedOrigins: new Set(),
              },
            )
          : await handleOAuthRequest(
              { method: req.method ?? "GET", url, ...(raw.length ? { rawBody: raw } : {}) },
              { auth, issuer: origin, consentUrl: "https://app.test/agents/authorize" },
            );
      const headers: Record<string, string> = { ...(answer.headers ?? {}) };
      const location = (answer as unknown as { location?: string }).location;
      if (location) headers.location = location;
      if (answer.body !== undefined) headers["content-type"] = headers["content-type"] ?? "application/json";
      res.writeHead(answer.status, headers);
      res.end(answer.body === undefined ? undefined : JSON.stringify(answer.body));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  origin = `http://127.0.0.1:${port}`;
  const mcpUrl = `${origin}/mcp`;
  auth = new AgentAuthService({
    repo: kit.repo,
    errands: kit.errands,
    mandates: kit.mandates.service,
    resource: mcpUrl,
    now: () => NOW,
  });
  const fetchLike: FetchLike = (url, init) => fetch(url, init);
  return {
    origin,
    mcpUrl,
    auth,
    fetch: fetchLike,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function until(runs: DemoAgentRuns, id: string, done: (run: DemoAgentRunView) => boolean): Promise<DemoAgentRunView> {
  for (let tries = 0; tries < 800; tries++) {
    const read = runs.get(ANDREA, id);
    assert.ok(read.ok);
    if (done(read.run)) return read.run;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("timeout waiting for run");
}

maybe("HTTP E2E: real Claude chooses MCP tools over loopback OAuth; Compas ALLOW creates one fake PayPal order, no capture", async () => {
  assert.ok(model);
  const kit = await agentKit();
  const http = await withHttpServer(kit);
  try {
    const runs = new DemoAgentRuns({
      origin: http.origin,
      mcpUrl: http.mcpUrl,
      fetch: http.fetch,
      errands: kit.errands,
      mandates: kit.mandates.service,
      merchants: kit.merchants,
      catalogs: kit.catalogs,
      mappings: kit.mappings,
      grantIdOf: async (token) => (await http.auth.authenticate(`Bearer ${token}`))?.grant.id,
      liveAgent: model,
      pause: async () => {},
      fixtures: FIXTURES,
      liveLimits: { maxMcpToolCalls: 6, maxModelTurns: 8, maxOutputTokensPerTurn: 700, maxTotalTokens: 24_000, timeoutMs: 120_000 },
    });

    const started = await runs.start(ANDREA, { errandId: "errand-losartan", mode: "live" });
    assert.ok(started.ok, JSON.stringify(started));
    const waiting = await until(runs, started.run.id, (run) => run.status === "AWAITING_CONSENT");
    const approved = await http.auth.approve(ANDREA, waiting.consentRequestId, ["errand-losartan"]);
    assert.ok(approved.ok);
    assert.ok(runs.consent(ANDREA, started.run.id, approved.redirectTo).ok);

    const done = await until(runs, started.run.id, (run) => run.status !== "RUNNING" && run.status !== "AWAITING_CONSENT" && run.status !== "STARTING");
    assert.equal(done.status, "COMPLETED", done.error);
    assert.equal(done.mode, "live");

    const tools = done.steps
      .filter((step): step is Extract<RunStep, { kind: "rpc" }> => step.kind === "rpc" && Boolean(step.tool))
      .map((step) => step.tool);
    assert.ok(tools.includes("search_eligible_merchants") || tools.includes("get_mandate_status"));
    assert.ok(tools.includes("propose_purchase") || tools.includes("check_purchase") || done.stopReason === "NO_ELIGIBLE_PRODUCTS");
    assert.ok(!tools.some((name) => /capture|refund/i.test(name ?? "")));
    assert.ok(!JSON.stringify(done).includes("cmp_at_"));
    assert.ok(done.steps.some((step) => step.kind === "decide"));

    // Happy path should authorize a cart; still never capture.
    if (done.stopReason === "ORDER_PROPOSED") {
      assert.equal(kit.paypal.calls.create.length, 1);
      assert.equal(kit.paypal.calls.capture.length, 0);
      const propose = done.steps.find((step) => step.kind === "rpc" && step.tool === "propose_purchase");
      assert.ok(propose && propose.kind === "rpc");
      const structured = (propose.response as { result?: { structuredContent?: { outcome?: string; payment?: { status?: string } } } }).result
        ?.structuredContent;
      assert.equal(structured?.outcome, "ALLOW");
      assert.equal(structured?.payment?.status, "ORDER_CREATED");
    } else {
      // Model may stop earlier; still must not capture and must not invent PayPal success.
      assert.equal(kit.paypal.calls.capture.length, 0);
    }
  } finally {
    await http.close();
  }
});
