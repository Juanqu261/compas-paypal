import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DEMO_LIMITS, readDemoLimits } from "../../src/api/demo-limits.ts";
import { handleErrandRequest, readErrandDraftsMode } from "../../src/api/errands.ts";
import { InMemoryAgentRepository } from "../../src/integrations/agents/in-memory-agent-repository.ts";
import { createDemoWorkspace } from "../../src/integrations/demo-workspaces/create-demo-workspace.ts";
import { createDemoPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import type { PayPalGateway } from "../../src/ports/paypal-gateway.ts";

test("each limit can be changed by its variable; anything but a whole number keeps the default", () => {
  assert.deepEqual(readDemoLimits({}), DEFAULT_DEMO_LIMITS);
  const changed = readDemoLimits({ COMPAS_LIMIT_ORDERS_PER_DEMO: "3", COMPAS_LIMIT_ERRANDS_PER_DEMO: "-1", COMPAS_LIMIT_BUDGETS_PER_DEMO: "lots" });
  assert.equal(changed.ordersPerDemo, 3);
  assert.equal(changed.errandsPerDemo, DEFAULT_DEMO_LIMITS.errandsPerDemo);
  assert.equal(changed.budgetsPerDemo, DEFAULT_DEMO_LIMITS.budgetsPerDemo);
});

test("a demo stops creating PayPal orders at its limit, and says so before PayPal is asked", async () => {
  const unused = new Proxy({}, { get: () => () => { throw new Error("not used in this test"); } });
  let n = 0;
  const gateway = { createOrder: async () => ({ id: `ORDER${++n}`, status: "PAYER_ACTION_REQUIRED" }) } as unknown as PayPalGateway;
  const workspace = await createDemoWorkspace(
    {
      paypal: { gateway, configured: true },
      merchants: unused as never,
      registry: unused as never,
      catalogs: unused as never,
      mappings: unused as never,
      cumRegistry: unused as never,
      model: unused as never,
      search: unused as never,
      execution: { allowed: true },
      ordersPerDemo: 2,
      agents: new InMemoryAgentRepository(),
      publicUrl: "http://localhost:4000",
      mcpUrl: "http://localhost:4000/mcp",
    },
    createDemoPartyDirectory({}),
    { onOrder: () => {}, onAgentToken: () => {} },
  );
  workspace.accounts.set({ source: "PRESENTER" });
  assert.equal(workspace.purchases.execution.allowed, true);
  await workspace.payments.createOrder({} as never);
  await workspace.payments.createOrder({} as never);
  const blocked = workspace.purchases.execution;
  assert.equal(blocked.allowed, false);
  assert.equal("code" in blocked ? blocked.code : undefined, "DEMO_LIMIT_REACHED");
  assert.equal(workspace.usage.orders, 2);
});

test("errand drafts are a switch: off on the public deploy and in production, and then no model is called", async () => {
  assert.equal(readErrandDraftsMode({}).enabled, true);
  assert.equal(readErrandDraftsMode({ COMPAS_ERRAND_DRAFTS: "disabled" }).enabled, false);
  assert.equal(readErrandDraftsMode({ NODE_ENV: "production" }).enabled, false);

  const service = new Proxy({}, { get: () => () => { throw new Error("the model must not be called"); } });
  const response = await handleErrandRequest(
    { method: "POST", url: new URL("http://localhost:4000/errands/drafts"), body: { mandateId: "mandate-1", text: "losartán" } },
    { partyId: "demo-delegate-andrea" },
    { service: service as never, drafts: readErrandDraftsMode({ COMPAS_ERRAND_DRAFTS: "disabled" }) },
  );
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "ERRAND_DRAFTS_DISABLED");
});
