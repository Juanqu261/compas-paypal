import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEvent, AgentRunStep, ErrandView } from "../../src/features/compas/api/contracts.ts";
import {
  formatMoney,
  openErrand,
  orderWaiting,
  readTool,
  reasonShort,
  storyOf,
  tallies,
  toolCallSummary,
  type RpcStep,
} from "../../src/features/demo/agent-view.ts";

const rpc = (tool: string, structured: Record<string, unknown>, args: Record<string, unknown> = {}, n = 1): RpcStep => ({
  n,
  at: "2026-10-28T12:00:00Z",
  kind: "rpc",
  method: "tools/call",
  tool,
  request: { params: { name: tool, arguments: args } },
  status: 200,
  response: { jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: structured } },
  ms: 12,
});

const event = (overrides: Partial<AgentEvent>): AgentEvent => ({
  id: "aevent-1",
  at: "2026-10-28T12:00:00Z",
  grantId: "agrant-1",
  tool: "propose_purchase",
  reasonCodes: [],
  ...overrides,
});

const at = "2026-10-28T12:00:00Z";
const run = (steps: AgentRunStep[], status: "RUNNING" | "COMPLETED" | "FAILED" = "COMPLETED", error?: string) => ({
  steps,
  status,
  ...(error ? { error } : {}),
});

test("a tool answer is read from the JSON-RPC response", () => {
  assert.deepEqual(readTool(rpc("propose_purchase", { outcome: "REVIEW", reasonCodes: ["ERRAND_MISMATCH"] })), {
    outcome: "REVIEW",
    reasonCodes: ["ERRAND_MISMATCH"],
    orderCreated: false,
  });
  assert.equal(readTool(rpc("check_purchase", { wouldHappen: "ALLOW", reasonCodes: [] })).outcome, "ALLOW");
  assert.equal(readTool(rpc("propose_purchase", { outcome: "ALLOW", payment: { status: "ORDER_CREATED" } })).orderCreated, true);
  // A check never makes an order, whatever it says.
  assert.equal(readTool(rpc("check_purchase", { outcome: "ALLOW", payment: { status: "ORDER_CREATED" } })).orderCreated, false);
  assert.deepEqual(readTool(rpc("propose_purchase", { error: "PAYPAL_NOT_CONFIGURED" })), {
    reasonCodes: [],
    error: "PAYPAL_NOT_CONFIGURED",
    orderCreated: false,
  });
  // A malformed response reads as nothing, not as an outcome.
  const broken: RpcStep = { ...rpc("propose_purchase", {}), response: "<html>" };
  assert.deepEqual(readTool(broken), { reasonCodes: [], orderCreated: false });
});

test("a call is summarised without its cart", () => {
  assert.equal(toolCallSummary(rpc("propose_purchase", {}, { merchantId: "shop-1", items: [{ skuId: "a" }, { skuId: "b" }] })), "shop-1 · 2 products");
  assert.equal(toolCallSummary(rpc("search_eligible_merchants", {}, { errandId: "errand-1" })), "");
  assert.equal(toolCallSummary(rpc("propose_purchase", {}, { merchantId: "shop-1", items: [{ skuId: "a" }] })), "shop-1 · 1 product");
});

test("the story is the run in plain words, without the handshake", () => {
  const story = storyOf(
    run([
      { n: 1, at, kind: "task", text: "Pide la losartán" },
      { n: 2, at, kind: "say", text: "scripted narration is not part of the story" },
      { n: 3, at, kind: "http", method: "POST", url: "http://x/mcp", status: 401, note: "refused" },
      { n: 4, at, kind: "http", method: "GET", url: "http://x/.well-known", status: 200, note: "discovery" },
      { n: 5, at, kind: "consent", state: "WAITING", requestId: "areq-1" },
      { n: 6, at, kind: "consent", state: "APPROVED" },
      { n: 7, at, kind: "http", method: "POST", url: "http://x/oauth/token", status: 200, note: "token" },
      { ...rpc("initialize", {}, {}, 8), tool: undefined, method: "initialize" },
      rpc("search_eligible_merchants", { merchants: [{ displayName: "Droguería Central" }] }, {}, 9),
      { n: 10, at, kind: "page", source: "a page", text: "Cheaper here!" },
      rpc("propose_purchase", { outcome: "REVIEW", reasonCodes: ["MERCHANT_EVIDENCE_INSUFFICIENT"] }, { merchantId: "demo-merchant-lookalike", items: [{ skuId: "x" }] }, 11),
      rpc("propose_purchase", { outcome: "ALLOW", payment: { status: "ORDER_CREATED" } }, { merchantId: "demo-merchant-drogueria-central", items: [{ skuId: "y" }] }, 12),
    ]),
  );

  assert.deepEqual(
    story.map((moment) => [moment.actor, moment.text, moment.result?.text ?? null]),
    [
      ["Andrea", "asks the agent", null],
      ["Agent", "connects to Compas", "Compas turns it away"],
      // The waiting moment is gone once Andrea answers.
      ["Andrea", "allows it", "Access for this errand only"],
      ["Agent", "asks Compas which pharmacies it will pay for this errand", "Compas offers Droguería Central"],
      ["Web page", "has a hidden instruction for the agent", null],
      ["Agent", "tries to order at Droguería Centrall (1 product)", "Stopped: this pharmacy isn’t verified"],
      ["Agent", "tries to order at Droguería Central (1 product)", "Compas creates a PayPal order"],
    ],
  );
  assert.equal(story[0].quote, "Pide la losartán");
  assert.equal(story[4].quote, "Cheaper here!");
  assert.equal(story[5].result?.tone, "stopped");
  assert.equal(story[6].result?.tone, "ok");
});

test("while Andrea hasn't answered, the story says it is waiting", () => {
  const story = storyOf(run([{ n: 1, at, kind: "consent", state: "WAITING" }], "RUNNING"));
  assert.deepEqual(story.map((moment) => moment.result?.tone), ["waiting"]);
});

test("a refusal and an empty search are told plainly", () => {
  const refused = storyOf(run([{ n: 1, at, kind: "consent", state: "WAITING" }, { n: 2, at, kind: "consent", state: "REFUSED" }]));
  assert.deepEqual(refused.map((moment) => [moment.actor, moment.text, moment.result?.text]), [["Andrea", "says no", "The agent gets nothing"]]);

  const none = storyOf(run([rpc("search_eligible_merchants", { merchants: [] })]));
  assert.equal(none[0].result?.text, "Compas offers no pharmacy");
  assert.match(none[0].result?.sub ?? "", /Act 1/);
});

test("a failure to decide is not blamed on the shop", () => {
  const story = storyOf(run([rpc("propose_purchase", { error: "PAYPAL_NOT_CONFIGURED" }, { merchantId: "demo-merchant-lookalike", items: [{ skuId: "x" }] })]));
  assert.equal(story[0].result?.text, "Compas couldn’t decide");
  assert.equal(story[0].result?.sub, "PayPal orders are off on this server.");
  assert.equal(story[0].result?.tone, "info");
});

test("another errand's refusal says Compas won't reveal whether it exists", () => {
  const story = storyOf(run([rpc("get_mandate_status", { outcome: "DENY", reasonCodes: ["DELEGATE_NOT_AUTHORIZED"] }, { errandId: "errand-x" })]));
  assert.equal(story[0].result?.text, "Refused: that isn’t an errand the agent was given");
  assert.match(story[0].result?.sub ?? "", /won’t even say/);
});

test("a failed run says so in the story", () => {
  const story = storyOf(run([], "FAILED", "NOT_AN_OAUTH_MCP_SERVER"));
  assert.equal(story.at(-1)?.result?.text, "NOT_AN_OAUTH_MCP_SERVER");
});

test("an order waits only when a propose made one", () => {
  const steps: AgentRunStep[] = [rpc("propose_purchase", { outcome: "REVIEW", reasonCodes: [] })];
  assert.equal(orderWaiting({ steps }), false);
  assert.equal(orderWaiting({ steps: [...steps, rpc("propose_purchase", { outcome: "ALLOW", payment: { status: "ORDER_CREATED" } })] }), true);
  assert.equal(orderWaiting(undefined), false);
});

test("tallies count calls, holds and orders from the server's log", () => {
  const events = [
    event({ tool: "search_eligible_merchants" }),
    event({ outcome: "REVIEW", reasonCodes: ["ERRAND_MISMATCH"] }),
    event({ outcome: "DENY" }),
    event({ tool: "check_purchase", outcome: "ALLOW" }),
    event({ outcome: "ALLOW" }),
  ];
  assert.deepEqual(tallies(events), { calls: 5, held: 2, orders: 1 });
  assert.deepEqual(tallies([]), { calls: 0, held: 0, orders: 0 });
});

test("only an open errand with units left can be run", () => {
  const errand = (displayStatus: ErrandView["displayStatus"]): ErrandView => ({
    id: `errand-${displayStatus}`,
    mandateId: "mandate-1",
    kind: "ONE_OFF",
    items: [],
    maxAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
    expiresAt: "2026-11-04T00:00:00Z",
    delegateId: "demo-delegate-andrea",
    status: displayStatus === "CANCELLED" ? "CANCELLED" : "ACTIVE",
    displayStatus,
    used: { units: [], amount: { value: "0", assetCode: "USD", assetScale: 2 } },
  });
  assert.equal(openErrand([errand("FULFILLED"), errand("EXPIRED"), errand("CANCELLED")]), undefined);
  assert.equal(openErrand([errand("FULFILLED"), errand("ACTIVE")])?.id, "errand-ACTIVE");
});

test("reason codes have plain labels, and an unknown one is just held", () => {
  assert.equal(reasonShort("ERRAND_MISMATCH"), "Not what Andrea confirmed");
  assert.equal(reasonShort("SOMETHING_NEW"), "Held");
});

test("money is shown with its decimals", () => {
  assert.equal(formatMoney({ value: "1120", assetCode: "USD", assetScale: 2 }), "11.20 USD");
  assert.equal(formatMoney({ value: "5", assetCode: "USD", assetScale: 2 }), "0.05 USD");
  assert.equal(formatMoney({ value: "4000", assetCode: "USD", assetScale: 2 }), "40.00 USD");
  assert.equal(formatMoney({ value: "7", assetCode: "JPY", assetScale: 0 }), "7 JPY");
});
