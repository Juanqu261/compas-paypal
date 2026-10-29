import assert from "node:assert/strict";
import test from "node:test";
import { DelegatePurchaseService } from "../../src/application/delegate-purchases.ts";
import { readDemoPurchasesMode } from "../../src/api/demo-identity.ts";
import {
  handleListDemoMerchants,
  handlePurchaseRequest,
  isPurchaseApiPath,
} from "../../src/api/purchases.ts";
import {
  createDemoMerchantDirectory,
  DEMO_MERCHANT_IDS,
  StaticMerchantDirectory,
} from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit } from "../application/mandate-test-kit.ts";
import {
  fakePayPal,
  historyDeps,
  LIQUOR_PAYPAL_ID,
  PHARMACY_PAYPAL_ID,
  resolution,
  stubRegistry,
} from "../application/purchase-test-kit.ts";

async function activeMandate(execution: ConstructorParameters<typeof DelegatePurchaseService>[0]["execution"]) {
  const kit = serviceKit();
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const id = created.mandate.id;
  assert.ok((await kit.service.authorize(PEDRO, id)).ok);
  const recording = fakePayPal();
  const service = new DelegatePurchaseService({
    mandates: kit.service,
    merchants: new StaticMerchantDirectory([
      { id: DEMO_MERCHANT_IDS.drogueria, displayName: "Droguería Central", paypalMerchantId: PHARMACY_PAYPAL_ID },
      { id: DEMO_MERCHANT_IDS.liquor, displayName: "Licorera de ejemplo", paypalMerchantId: LIQUOR_PAYPAL_ID },
    ]),
    registry: stubRegistry(),
    history: historyDeps(),
    payments: recording.gateway,
    spending: kit.spending,
    capacity: kit.mandates,
    execution,
    now: () => NOW,
  });
  return { id, recording, service };
}

const post = (service: DelegatePurchaseService, path: string, body: unknown) =>
  handlePurchaseRequest({ method: "POST", url: new URL(`http://localhost:4000${path}`), body }, ANDREA, { service });

function liquorCharge(mandateId: string) {
  const amount = { value: "1500", assetCode: "USD", assetScale: 2 };
  return {
    mandateId,
    merchantId: DEMO_MERCHANT_IDS.liquor,
    amount,
    lineItems: [{ category: "ALCOHOL", amount }],
    idempotencyKey: "demo-key-0000000001",
  };
}

test("purchase routes are recognized by path", () => {
  assert.equal(isPurchaseApiPath("/purchases"), true);
  assert.equal(isPurchaseApiPath("/purchases/preview"), true);
  assert.equal(isPurchaseApiPath("/purchases/1"), false);
});

test("a recorded DENY is a 201 result, a replay is a 200, and GET is refused", async () => {
  const { id, recording, service } = await activeMandate({ allowed: true });
  const denied = await post(service, "/purchases", liquorCharge(id));
  assert.equal(denied.status, 201);
  assert.equal((denied.body.purchase as { outcome: string }).outcome, "DENY");
  const replay = await post(service, "/purchases", liquorCharge(id));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(recording.totalCalls(), 0);

  const get = await handlePurchaseRequest({ method: "GET", url: new URL("http://localhost:4000/purchases") }, ANDREA, { service });
  assert.equal(get.status, 405);
});

test("with purchases off, POST /purchases answers 403 and the preview still works", async () => {
  const { id, service } = await activeMandate({ allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: "off" });
  const refused = await post(service, "/purchases", liquorCharge(id));
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, "PURCHASES_DISABLED_FOR_DEMO");
  const preview = await post(service, "/purchases/preview", liquorCharge(id));
  assert.equal(preview.status, 200);
  assert.equal((preview.body.preview as { next: string }).next, "STOP_DENY");
});

test("an invalid body answers 400 with field errors", async () => {
  const { id, service } = await activeMandate({ allowed: true });
  const invalid = await post(service, "/purchases", { ...liquorCharge(id), idempotencyKey: "short" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "INVALID_PURCHASE");
  assert.ok(Array.isArray(invalid.body.fieldErrors));
});

test("demo purchases are off by default and in production", () => {
  const sandbox = { COMPAS_DEMO_PURCHASES: "enabled", DEMO_MERCHANT_PAYPAL_ID: "SANDBXPHARMA2" };
  assert.equal(readDemoPurchasesMode({}).enabled, false);
  assert.equal(readDemoPurchasesMode({ DEMO_MERCHANT_PAYPAL_ID: "SANDBXPHARMA2" }).enabled, false, "off unless opted in");
  assert.equal(readDemoPurchasesMode(sandbox).enabled, true);
  assert.equal(readDemoPurchasesMode({ ...sandbox, NODE_ENV: "production" }).enabled, false);
  // Each visitor's demo brings its own business account, so the presenter's is not required.
  assert.equal(readDemoPurchasesMode({ COMPAS_DEMO_PURCHASES: "enabled" }).enabled, true);
});

test("an allowed purchase answers with an order waiting for the payer, and no approval link", async () => {
  const { id, recording, service } = await activeMandate({ allowed: true });
  const amount = { value: "1120", assetCode: "USD", assetScale: 2 };
  const allowed = await post(service, "/purchases", {
    mandateId: id,
    merchantId: DEMO_MERCHANT_IDS.drogueria,
    amount,
    lineItems: [{ category: "MEDICATION", amount }],
    idempotencyKey: "demo-key-0000000002",
  });
  assert.equal(allowed.status, 201);
  assert.deepEqual((allowed.body.purchase as { payment: unknown }).payment, { status: "CREATED", state: "AWAITING_PAYER_APPROVAL" });
  assert.equal(recording.calls.create.length, 1);
  assert.equal(JSON.stringify(allowed.body).includes("paypal.com"), false);
  assert.equal(JSON.stringify(allowed.body).includes(PHARMACY_PAYPAL_ID), false);
});

test("the demo merchant list hides PayPal ids and says when no evidence source is registered", async () => {
  const listed = await handleListDemoMerchants({
    merchants: createDemoMerchantDirectory({}),
    registry: stubRegistry({ DEMPHARMACY22: resolution("DEMPHARMACY22", [["MEDICATION", "PROVIDER_VERIFIED"]]) }),
    sources: { getById: async () => undefined },
    sourceCount: 0,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.categorySources, "NONE_REGISTERED");
  const merchants = listed.body.merchants as Record<string, unknown>[];
  assert.deepEqual(
    merchants.map((merchant) => merchant.id),
    [DEMO_MERCHANT_IDS.drogueria, DEMO_MERCHANT_IDS.liquor, DEMO_MERCHANT_IDS.lookalike],
  );
  assert.ok(merchants.every((merchant) => !("paypalMerchantId" in merchant)));
  assert.equal((merchants[0].categories as unknown[]).length, 1);
});
