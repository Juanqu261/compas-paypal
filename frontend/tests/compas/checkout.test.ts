import assert from "node:assert/strict";
import test from "node:test";
import type { DemoScenario } from "../../src/demo/scenarios.ts";
import { DEMO_MERCHANTS } from "../../src/features/compas/demo-identities.ts";
import { errorText, purchaseStatusLabel } from "../../src/features/compas/lib/labels.ts";
import { merchantCompasCategories } from "../../src/features/nequi-business/nequi-business-compas-demo.ts";
import { COMPAS_CATEGORIES } from "../../src/features/compas/api/contracts.ts";
import { buildCharge, chargePaymentCompleted, merchantChargeStatus, scenarioLines } from "../../src/features/demo/demo-charge.ts";

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

test("a charge names the merchant by directory id, totals its lines and drops product names", () => {
  const lines = scenarioLines(scenario("medication-pharmacy", "MEDICATION"));
  const charge = buildCharge(DEMO_MERCHANTS.drogueria, [...lines, { category: "PERSONAL_CARE", amount: USD("250") }]);
  assert.ok(charge);
  assert.equal(charge.merchantId, DEMO_MERCHANTS.drogueria.id);
  assert.deepEqual(charge.amount, USD("1750"), "the amount is the sum of the lines");
  assert.deepEqual(charge.lineItems[0], { category: "MEDICATION", amount: USD("1500") });
  assert.ok(!JSON.stringify(charge).includes("Acetaminophen"), "the product name never leaves the merchant phone");
  assert.ok(!JSON.stringify(charge).includes("wallet"), "the browser sends no wallet address");
  assert.equal(buildCharge(DEMO_MERCHANTS.drogueria, []), undefined);
  assert.equal(
    buildCharge(DEMO_MERCHANTS.drogueria, [{ amount: USD("1") }, { amount: { value: "1", assetCode: "EUR", assetScale: 2 } }]),
    undefined,
    "one charge, one asset",
  );
});

test("a line with a category COMPAS doesn't know goes without one, so the backend holds it", () => {
  assert.deepEqual(scenarioLines(scenario("medication-pharmacy", "VITAMINS")), [{ amount: USD("1500") }]);
});

test("the merchant phone never says paid before the wallet confirmed it", () => {
  const preview = (next: "STOP_DENY" | "STOP_REVIEW" | "QUOTE", execution: "ENABLED" | "PURCHASES_DISABLED_FOR_DEMO" = "ENABLED") => ({
    kind: "PREVIEW" as const,
    preview: {
      mandateId: "m",
      merchant: { id: "x", displayName: "x" },
      requestedAmount: USD("1"),
      mandateRules: { passed: true, reasonCodes: [] },
      merchantCategories: [],
      next,
      pendingChecks: [],
      execution,
    },
  });
  const purchase = (outcome: "ALLOW" | "DENY", payment: { status: "NOT_CREATED" } | { status: "CREATED"; state: "PENDING" | "COMPLETED" | "FAILED" }) => ({
    kind: "PURCHASE" as const,
    purchase: {
      decisionId: "d",
      mandateId: "m",
      merchant: { id: "x", displayName: "x" },
      outcome,
      reasonCodes: [],
      monitoredException: false,
      requestedAmount: USD("1"),
      payment,
      recordedAt: "2026-10-17T10:00:00Z",
    },
  });
  assert.equal(merchantChargeStatus({}).title, "Esperando al cliente");
  assert.equal(merchantChargeStatus({ result: preview("STOP_DENY") }).title, "Compra no permitida");
  assert.equal(merchantChargeStatus({ result: preview("QUOTE") }).title, "Pendiente de confirmación");
  assert.match(merchantChargeStatus({ result: preview("QUOTE", "PURCHASES_DISABLED_FOR_DEMO") }).title, /desactivado/);
  assert.equal(merchantChargeStatus({ result: purchase("ALLOW", { status: "CREATED", state: "PENDING" }) }).title, "Pago en proceso");
  assert.equal(merchantChargeStatus({ result: purchase("ALLOW", { status: "CREATED", state: "COMPLETED" }) }).title, "Pago realizado");
  assert.equal(merchantChargeStatus({ result: purchase("ALLOW", { status: "NOT_CREATED" }) }).title, "No se pudo completar");
  assert.equal(merchantChargeStatus({ result: purchase("DENY", { status: "NOT_CREATED" }) }).title, "Compra no permitida");
  assert.equal(merchantChargeStatus({ result: { kind: "ERROR", code: "PAYMENT_OUTCOME_UNKNOWN" } }).title, "Resultado incierto");
});

test("a decision is never shown as a completed payment", () => {
  assert.equal(purchaseStatusLabel({ outcome: "DENY", payment: { status: "NOT_CREATED" } }), "Compra no permitida");
  assert.match(purchaseStatusLabel({ outcome: "REVIEW", payment: { status: "NOT_CREATED" } }), /retenida/);
  assert.equal(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "NOT_CREATED" } }), "No se pudo crear el pago");
  assert.equal(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "CREATED", state: "PENDING" } }), "Pago en proceso");
  assert.equal(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "CREATED", state: "COMPLETED" } }), "Pago realizado");
  assert.equal(purchaseStatusLabel({ outcome: "ALLOW", payment: { status: "CREATED", state: "FAILED" } }), "Pago fallido");
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

test("the merchant announces a payment only when COMPAS allowed it and the wallet completed it", () => {
  const purchase = (outcome: "ALLOW" | "DENY", payment: { status: "NOT_CREATED" } | { status: "CREATED"; state: "PENDING" | "COMPLETED" | "FAILED" }) => ({
    result: { kind: "PURCHASE" as const, purchase: { outcome, payment } as never },
  });
  assert.equal(chargePaymentCompleted(purchase("ALLOW", { status: "CREATED", state: "COMPLETED" })), true);
  assert.equal(chargePaymentCompleted(purchase("ALLOW", { status: "CREATED", state: "PENDING" })), false, "PENDING is not received money");
  assert.equal(chargePaymentCompleted(purchase("ALLOW", { status: "CREATED", state: "FAILED" })), false);
  assert.equal(chargePaymentCompleted(purchase("ALLOW", { status: "NOT_CREATED" })), false);
  assert.equal(chargePaymentCompleted(purchase("DENY", { status: "NOT_CREATED" })), false);
  assert.equal(chargePaymentCompleted({ result: undefined }), false);
  assert.equal(chargePaymentCompleted(null), false);
});
