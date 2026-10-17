import assert from "node:assert/strict";
import test from "node:test";
import { DelegatePurchaseService } from "../../src/application/delegate-purchases.ts";
import { readDemoPurchasesMode } from "../../src/api/demo-identity.ts";
import {
  handleListDemoMerchants,
  handlePurchaseRequest,
  isPurchaseApiPath,
} from "../../src/api/purchases.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import {
  createDemoMerchantDirectory,
  DEMO_MERCHANT_IDS,
  StaticMerchantDirectory,
} from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit } from "../application/mandate-test-kit.ts";
import {
  historyDeps,
  LIQUOR_WALLET,
  PAYER_WALLET,
  PHARMACY_WALLET,
  recordingPayments,
  resolution,
  stubRegistry,
} from "../application/purchase-test-kit.ts";

async function activeMandate(execution: ConstructorParameters<typeof DelegatePurchaseService>[0]["execution"]) {
  const kit = serviceKit();
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const id = created.mandate.id;
  await kit.service.startAuthorization(PEDRO, id);
  await kit.gateway.finishGrant(id);
  await kit.service.completeAuthorization(id);
  const recording = recordingPayments();
  const service = new DelegatePurchaseService({
    mandates: kit.service,
    merchants: new StaticMerchantDirectory([
      { id: DEMO_MERCHANT_IDS.drogueria, displayName: "Droguería Central", walletAddressUrl: PHARMACY_WALLET },
      { id: DEMO_MERCHANT_IDS.liquor, displayName: "Licorera de ejemplo", walletAddressUrl: LIQUOR_WALLET },
    ]),
    registry: stubRegistry(),
    history: historyDeps(),
    parties: new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro", walletAddressUrl: PAYER_WALLET }]),
    grants: kit.gateway.grants,
    payments: recording.payments,
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

test("demo purchases are off by default, in production and off the test network", () => {
  const testNetwork = {
    COMPAS_DEMO_PURCHASES: "enabled",
    CLIENT_WALLET_ADDRESS: "https://ilp.interledger-test.dev/client-test",
    DEMO_PAYER_WALLET_ADDRESS: "https://ilp.interledger-test.dev/payer-test",
    DEMO_MERCHANT_WALLET_ADDRESS: "https://ilp.interledger-test.dev/merchant-test",
  };
  assert.equal(readDemoPurchasesMode({}).enabled, false);
  assert.equal(readDemoPurchasesMode(testNetwork).enabled, true);
  assert.equal(readDemoPurchasesMode({ ...testNetwork, NODE_ENV: "production" }).enabled, false);
  assert.equal(readDemoPurchasesMode({ ...testNetwork, DEMO_MERCHANT_WALLET_ADDRESS: "https://wallet.example/x" }).enabled, false);
});

test("the demo merchant list hides wallets and says when no evidence source is registered", async () => {
  const listed = await handleListDemoMerchants({
    merchants: createDemoMerchantDirectory({}),
    registry: stubRegistry({ "https://wallet.example/demo-drogueria-central": resolution("https://wallet.example/demo-drogueria-central", [["MEDICATION", "PROVIDER_VERIFIED"]]) }),
    sources: { getById: async () => undefined },
    sourceCount: 0,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.categorySources, "NONE_REGISTERED");
  const merchants = listed.body.merchants as Record<string, unknown>[];
  assert.deepEqual(merchants.map((merchant) => merchant.id), [DEMO_MERCHANT_IDS.drogueria, DEMO_MERCHANT_IDS.liquor]);
  assert.ok(merchants.every((merchant) => !("walletAddressUrl" in merchant)));
  assert.equal((merchants[0].categories as unknown[]).length, 1);
});
