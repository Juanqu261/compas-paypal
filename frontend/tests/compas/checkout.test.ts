import assert from "node:assert/strict";
import test from "node:test";
import type { DemoScenario } from "../../src/demo/scenarios.ts";
import { DEMO_MERCHANT_BY_SCENARIO } from "../../src/features/compas/demo-identities.ts";
import { errorText, purchaseStatusLabel } from "../../src/features/compas/lib/labels.ts";
import { merchantCompasCategories } from "../../src/features/nequi-business/nequi-business-compas-demo.ts";
import { COMPAS_CATEGORIES } from "../../src/features/compas/api/contracts.ts";
import { chargeFromScenario } from "../../src/features/demo/demo-charge.ts";

const USD = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });

function scenario(id: DemoScenario["id"], category: string): DemoScenario {
  return {
    dataLabel: "demo/test data",
    id,
    title: id,
    merchantSurface: "Nequi Negocios simulation",
    mandate: { purposePolicy: { allowedPurposes: ["MEDICATION"] }, budget: USD("4000") },
    purchaseIntent: {
      merchantDisplayName: "Display only",
      lineItems: [{ id: "line", description: "Acetaminophen", category, amount: USD("1500") }],
      amount: USD("1500"),
    },
    expectedPolicyResult: { outcome: "ALLOW" },
  };
}

test("a charge names the merchant by directory id and drops product names", () => {
  const charge = chargeFromScenario(scenario("medication-pharmacy", "MEDICATION"), new Date("2026-10-17T10:00:00Z"));
  assert.equal(charge.merchantId, DEMO_MERCHANT_BY_SCENARIO["medication-pharmacy"].id);
  assert.deepEqual(charge.lineItems, [{ category: "MEDICATION", amount: USD("1500") }]);
  assert.ok(!JSON.stringify(charge).includes("Acetaminophen"), "the product name never leaves the merchant phone");
  assert.ok(!JSON.stringify(charge).includes("wallet"), "the browser sends no wallet address");

  const liquor = chargeFromScenario(scenario("alcohol-rejection", "ALCOHOL"));
  assert.equal(liquor.merchantId, DEMO_MERCHANT_BY_SCENARIO["alcohol-rejection"].id);
});

test("a line with a category COMPAS doesn't know goes without one, so the backend holds it", () => {
  const charge = chargeFromScenario(scenario("medication-pharmacy", "VITAMINS"));
  assert.deepEqual(charge.lineItems, [{ amount: USD("1500") }]);
});

test("a decision is never shown as a completed payment", () => {
  assert.match(purchaseStatusLabel({ outcome: "DENY", payment: { status: "NOT_CREATED" } }), /Rechazada.*ningún pago/);
  assert.match(purchaseStatusLabel({ outcome: "REVIEW", payment: { status: "NOT_CREATED" } }), /Retenida/);
  assert.match(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "NOT_CREATED" } }), /no se creó el pago/);
  assert.match(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "CREATED", state: "PENDING" } }), /en proceso/);
  assert.match(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "CREATED", state: "COMPLETED" } }), /Pagada/);
});

test("every purchase error code has its own plain explanation", () => {
  const fallback = errorText("SOMETHING_NEW");
  for (const code of [
    "NOT_THE_DELEGATE",
    "PURCHASES_DISABLED_FOR_DEMO",
    "UNKNOWN_MERCHANT",
    "INVALID_PURCHASE",
    "GRANT_NOT_ACTIVE",
    "IDEMPOTENCY_KEY_REUSED",
    "PAYMENT_NOT_STARTED",
    "PAYMENT_OUTCOME_UNKNOWN",
    "TIMEOUT",
  ]) {
    assert.notEqual(errorText(code), fallback, code);
  }
  assert.match(errorText("PAYMENT_OUTCOME_UNKNOWN"), /No lo repitas/);
});

test("the merchant's category options are COMPAS categories", () => {
  for (const option of merchantCompasCategories) {
    assert.ok((COMPAS_CATEGORIES as readonly string[]).includes(option.id), option.id);
  }
});
