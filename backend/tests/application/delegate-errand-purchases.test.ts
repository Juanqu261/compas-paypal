import assert from "node:assert/strict";
import test from "node:test";
import { DelegatePurchaseService, parsePurchaseRequest } from "../../src/application/delegate-purchases.ts";
import { catalogItemDigest, type CatalogItem } from "../../src/domain/merchant-catalog.ts";
import { InMemoryErrandRepository } from "../../src/integrations/errands/in-memory-errand-repository.ts";
import { InMemoryCatalogMappings, InMemoryMerchantCatalogs } from "../../src/integrations/merchant-catalog/in-memory-catalogs.ts";
import { StaticMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit } from "./mandate-test-kit.ts";
import { fakePayPal, historyDeps, PHARMACY_PAYPAL_ID, stubRegistry } from "./purchase-test-kit.ts";

const PHARMACY = "demo-merchant-drogueria-central";
const LOSARTAN_CUM = "20062603-28";
const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
const LOSARTAN: CatalogItem = { skuId: "dc-losartan-50", name: "Losartán potásico 50 mg x 30 tabletas", price: usd("1120") };
const SUNSCREEN: CatalogItem = { skuId: "dc-protector-solar", name: "Protector solar facial SPF 50" };

async function kit() {
  const mandates = serviceKit();
  const created = await mandates.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  assert.ok((await mandates.service.authorize(PEDRO, created.mandate.id)).ok);
  const mandateId = created.mandate.id;

  const catalogs = new InMemoryMerchantCatalogs();
  await catalogs.replace({ paypalMerchantId: PHARMACY_PAYPAL_ID, items: [LOSARTAN, SUNSCREEN], updatedAt: NOW.toISOString() });
  const mappings = new InMemoryCatalogMappings();
  await mappings.put({
    paypalMerchantId: PHARMACY_PAYPAL_ID,
    skuId: LOSARTAN.skuId,
    cum: LOSARTAN_CUM,
    status: "VERIFIED",
    verifierVersion: "cum-verifier.2",
    checks: [],
    provenance: "test",
    skuTextDigest: catalogItemDigest(LOSARTAN),
    findingId: "finding-1",
    verifiedAt: NOW.toISOString(),
  });
  const errands = new InMemoryErrandRepository();
  await errands.create({
    id: "errand-losartan",
    mandateId,
    delegateId: ANDREA.partyId,
    kind: "ONE_OFF",
    status: "ACTIVE",
    items: [{ label: "Losartán 50 mg", acceptedCums: [LOSARTAN_CUM], maxUnits: 1 }],
    maxAmount: usd("2000"),
    expiresAt: "2026-11-15T00:00:00Z",
    draftedBy: "DELEGATE",
    confirmedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
  });

  const paypal = fakePayPal();
  let ids = 0;
  const service = new DelegatePurchaseService({
    mandates: mandates.service,
    merchants: new StaticMerchantDirectory([{ id: PHARMACY, displayName: "Droguería Central", paypalMerchantId: PHARMACY_PAYPAL_ID }]),
    registry: stubRegistry(),
    history: historyDeps(),
    payments: paypal.gateway,
    spending: mandates.spending,
    capacity: mandates.mandates,
    catalog: { catalogs, mappings },
    errands,
    execution: { allowed: true },
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  });
  const cart = (lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
    mandateId,
    merchantId: PHARMACY,
    amount: usd(String(lines.reduce((sum, line) => sum + Number((line.amount as { value: string }).value), 0))),
    lineItems: lines,
    idempotencyKey: `key-${Math.random().toString(36).slice(2).padEnd(16, "0")}`,
    ...extra,
  });
  return { service, paypal, errands, cart };
}

test("a SKU with a verified CUM is a MEDICATION line without the shop saying so", async () => {
  const { service, cart } = await kit();
  const mapped = await service.preview(ANDREA, cart([{ catalogItemId: LOSARTAN.skuId, amount: usd("1120") }]));
  assert.equal(mapped.ok && mapped.preview.next, "ORDER");

  const unmapped = await service.preview(ANDREA, cart([{ catalogItemId: SUNSCREEN.skuId, amount: usd("1450") }]));
  assert.equal(unmapped.ok && unmapped.preview.next, "STOP_REVIEW");
  assert.deepEqual(unmapped.ok && unmapped.preview.purposeCheck?.reasonCodes, ["CLASSIFICATION_UNCERTAIN"]);
});

test("under an errand, the confirmed box orders and a second box is held before PayPal", async () => {
  const { service, cart, paypal } = await kit();
  const preview = await service.preview(ANDREA, cart([{ catalogItemId: LOSARTAN.skuId, quantity: 2, amount: usd("2000") }], { errandId: "errand-losartan" }));
  assert.ok(preview.ok);
  assert.deepEqual(preview.preview.errand, { passed: false, reasonCodes: ["ERRAND_MISMATCH"] });
  assert.equal(preview.preview.next, "STOP_REVIEW");

  const held = await service.purchase(ANDREA, cart([{ catalogItemId: LOSARTAN.skuId, quantity: 2, amount: usd("2000") }], { errandId: "errand-losartan" }));
  assert.ok(held.ok);
  assert.equal(held.purchase.outcome, "REVIEW");
  assert.deepEqual(held.purchase.reasonCodes, ["ERRAND_MISMATCH"]);
  assert.equal(paypal.calls.create.length, 0);

  const allowed = await service.purchase(ANDREA, cart([{ catalogItemId: LOSARTAN.skuId, amount: usd("1120") }], { errandId: "errand-losartan" }));
  assert.equal(allowed.ok && allowed.purchase.outcome, "ALLOW");
  assert.equal(paypal.calls.create.length, 1);
  // The PayPal order still names no product: the SKU and the CUM stay in COMPAS.
  assert.ok(!JSON.stringify(paypal.calls.create[0]).includes(LOSARTAN_CUM));
  assert.ok(!JSON.stringify(paypal.calls.create[0]).includes(LOSARTAN.skuId));
});

test("an errand that doesn't exist is refused before any decision", async () => {
  const { service, cart } = await kit();
  const result = await service.purchase(ANDREA, cart([{ catalogItemId: LOSARTAN.skuId, amount: usd("1120") }], { errandId: "errand-nope" }));
  assert.equal(!result.ok && result.code, "UNKNOWN_ERRAND");
});

test("SKU ids and quantities are checked, and a line defaults to one unit", () => {
  const base = { mandateId: "mandate-x", merchantId: "shop", amount: usd("100"), idempotencyKey: "key-0123456789abcdef" };
  const bad = parsePurchaseRequest({ ...base, lineItems: [{ amount: usd("100"), catalogItemId: "no spaces", quantity: 0 }] }, { requireIdempotencyKey: true });
  assert.ok(!bad.ok && bad.errors.some((error) => error.field === "lineItems.0.catalogItemId"));
  const zero = parsePurchaseRequest({ ...base, lineItems: [{ amount: usd("100"), quantity: 0 }] }, { requireIdempotencyKey: true });
  assert.ok(!zero.ok && zero.errors.some((error) => error.code === "INVALID_QUANTITY"));
  const good = parsePurchaseRequest({ ...base, lineItems: [{ amount: usd("100"), catalogItemId: "sku-1" }], errandId: "errand-1" }, { requireIdempotencyKey: true });
  assert.ok(good.ok);
  assert.deepEqual(good.value.lines, [{ amount: usd("100"), catalogItemId: "sku-1", quantity: 1 }]);
  assert.equal(good.value.errandId, "errand-1");
});
