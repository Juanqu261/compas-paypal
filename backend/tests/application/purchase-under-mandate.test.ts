import assert from "node:assert/strict";
import test from "node:test";
import { purchaseUnderMandate } from "../../src/application/purchase-under-mandate.ts";
import { PayPalOrderSettlement } from "../../src/application/settle-paypal-order.ts";
import { buildSpendingReport } from "../../src/application/spending-report.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { PayPalRestGateway } from "../../src/integrations/paypal/paypal-rest-gateway.ts";
import { PayPalRestClient } from "../../src/integrations/paypal/rest-client.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { API_BASE_URL, fakePayPalApi, TEST_CLIENT } from "../integrations/paypal/fake-paypal-api.ts";
import {
  fakePayPal,
  historyDeps,
  intent,
  LIQUOR_PAYPAL_ID,
  mandate,
  NOW,
  PHARMACY_PAYPAL_ID,
  stubRegistry,
} from "./purchase-test-kit.ts";

function setup() {
  const paypal = fakePayPal();
  const spending = new InMemorySpendingLog();
  let ids = 0;
  const deps = {
    merchants: stubRegistry(),
    payments: paypal.gateway,
    spending,
    history: historyDeps(),
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  };
  return { paypal, spending, deps };
}

test("ENFORCED pharmacy purchase: one PayPal order for the payer to approve, and the record shows the match", async () => {
  const { paypal, deps } = setup();
  const result = await purchaseUnderMandate({ mandate: mandate("ENFORCED"), intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") }, deps);

  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(paypal.calls.create.length, 1);
  assert.deepEqual(paypal.calls.create[0], {
    requestId: "decision-1",
    payeeMerchantId: PHARMACY_PAYPAL_ID,
    amount: { value: "1120", assetCode: "USD", assetScale: 2 },
    lineAmounts: [{ value: "1120", assetCode: "USD", assetScale: 2 }],
    metadata: {
      compasMandateId: "demo-mandate-medication",
      compasDecisionId: "decision-1",
      externalReference: "intent-MEDICATION",
    },
  });
  assert.equal(paypal.calls.capture.length, 0, "nothing is captured before the payer approves");

  assert.equal(result.order?.status, "PAYER_ACTION_REQUIRED");
  assert.equal(result.record.monitoredException, false);
  assert.deepEqual(result.record.merchantCategories, [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }]);
  assert.deepEqual(result.record.lineCategories, ["MEDICATION"]);
  assert.deepEqual(result.record.paypal, {
    orderId: result.order?.id,
    approvalUrl: result.order?.approvalUrl,
    state: "AWAITING_PAYER_APPROVAL",
  });
});

test("ENFORCED liquor purchase: no PayPal call at all, but the attempt is recorded", async () => {
  const { paypal, spending, deps } = setup();
  const result = await purchaseUnderMandate({ mandate: mandate("ENFORCED"), intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL") }, deps);

  assert.equal(result.decision.outcome, "DENY");
  assert.equal(result.order, undefined);
  assert.equal(paypal.totalCalls(), 0);
  const [record] = await spending.listByMandate("demo-mandate-medication");
  assert.deepEqual(record.merchantCategories.map((c) => c.category), ["ALCOHOL", "TOBACCO"]);
  assert.deepEqual(record.paypal, {});
});

test("REVIEW never creates a PayPal order", async () => {
  const { paypal, deps } = setup();
  const result = await purchaseUnderMandate({ mandate: mandate("ENFORCED"), intent: intent(PHARMACY_PAYPAL_ID, undefined) }, deps);
  assert.equal(result.decision.outcome, "REVIEW");
  assert.deepEqual(result.decision.reasons.map((r) => r.code), ["CLASSIFICATION_UNCERTAIN"]);
  assert.equal(paypal.totalCalls(), 0);
});

test("MONITORED liquor purchase: ordered, flagged, and the failed match stays on the record", async () => {
  const { paypal, deps } = setup();
  const result = await purchaseUnderMandate({ mandate: mandate("MONITORED"), intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL") }, deps);

  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(paypal.calls.create.length, 1);
  assert.equal(result.record.monitoredException, true);
  assert.equal(result.record.purposeCheck?.outcome, "DENY");
  assert.equal(result.record.purposeCheck?.enforced, false);
  // PayPal metadata stays opaque, whatever the purpose check said.
  assert.deepEqual(Object.keys(paypal.calls.create[0].metadata).sort(), [
    "compasDecisionId",
    "compasMandateId",
    "externalReference",
  ]);
});

test("MONITORED does not lift mandate rules: a stranger never reaches PayPal", async () => {
  const { paypal, deps } = setup();
  const result = await purchaseUnderMandate(
    { mandate: mandate("MONITORED"), intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL", { delegateId: "someone-else" }) },
    deps,
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.equal(paypal.totalCalls(), 0);
});

test("MONITORED does not lift the budget: an over-budget charge is denied before PayPal", async () => {
  const { paypal, deps } = setup();
  const over = { value: "5000", assetCode: "USD", assetScale: 2 };
  const result = await purchaseUnderMandate(
    {
      mandate: mandate("MONITORED"),
      intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL", {
        amount: over,
        lineItems: [{ id: "line-1", description: "Item", category: "ALCOHOL", amount: over }],
      }),
    },
    deps,
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.deepEqual(result.decision.reasons.map((r) => r.code), ["BUDGET_EXCEEDED"]);
  assert.equal(paypal.totalCalls(), 0);
  assert.equal(result.record.purposeCheck?.outcome, "DENY", "the purpose result is still recorded");
});

test("a charge in another currency is denied before PayPal: COMPAS does not convert", async () => {
  const { paypal, deps } = setup();
  const eur = { value: "1000", assetCode: "EUR", assetScale: 2 };
  const result = await purchaseUnderMandate(
    {
      mandate: mandate("ENFORCED"),
      intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION", {
        amount: eur,
        lineItems: [{ id: "line-1", description: "Item", category: "MEDICATION", amount: eur }],
      }),
    },
    deps,
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.match(result.decision.reasons[0].message, /does not convert/);
  assert.equal(paypal.totalCalls(), 0);
});

test("the spending report counts only what PayPal captured", async () => {
  const { paypal, spending, deps } = setup();
  const monitored = mandate("MONITORED");
  const mandates = new InMemoryMandateRepository();
  await mandates.save(monitored);
  const capacity = { ...deps, capacity: mandates };
  const pharmacy = await purchaseUnderMandate({ mandate: monitored, intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") }, capacity);
  const liquor = await purchaseUnderMandate({ mandate: monitored, intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL") }, capacity);
  await purchaseUnderMandate(
    { mandate: monitored, intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL", { delegateId: "someone-else" }) },
    capacity,
  );

  const before = await buildSpendingReport(monitored, spending);
  assert.equal(before.totals.paidCount, 0, "an order waiting for the payer is not paid");

  const settlement = new PayPalOrderSettlement({
    payments: paypal.gateway,
    spending,
    mandates,
    parties: new StaticPartyDirectory([]),
    history: deps.history,
    now: () => NOW,
  });
  for (const order of [pharmacy.order!, liquor.order!]) {
    paypal.approve(order.id);
    assert.equal((await settlement.approved(order.id)).result, "COMPLETED");
  }

  const report = await buildSpendingReport(monitored, spending);
  assert.equal(report.enforcement, "MONITORED");
  assert.deepEqual(report.totals, {
    paid: { value: "2240", assetCode: "USD", assetScale: 2 },
    attempts: 3,
    paidCount: 2,
    notPaidCount: 1,
    monitoredExceptions: 1,
    paidOutsidePurpose: 1,
  });
  assert.equal(report.entries.length, 3);
  assert.equal(JSON.stringify(report).includes("Item"), false, "line-item descriptions are not in the report");
});

test("with the real adapter: ENFORCED liquor never reaches PayPal; MONITORED creates one order and no capture", async () => {
  for (const [enforcement, expectedOrders] of [["ENFORCED", 0], ["MONITORED", 1]] as const) {
    const api = fakePayPalApi();
    const gateway = new PayPalRestGateway({
      client: new PayPalRestClient({ config: { ...TEST_CLIENT, apiBaseUrl: API_BASE_URL }, fetch: api.fetch }),
      returnUrl: "http://localhost:4000/paypal/orders/return",
      cancelUrl: "http://localhost:4000/paypal/orders/cancel",
    });
    const result = await purchaseUnderMandate(
      { mandate: mandate(enforcement), intent: intent(LIQUOR_PAYPAL_ID, "ALCOHOL", { lineItems: [
        { id: "line-1", description: "Aguardiente", category: "ALCOHOL", amount: { value: "1120", assetCode: "USD", assetScale: 2 } },
      ] }) },
      { merchants: stubRegistry(), payments: gateway, spending: new InMemorySpendingLog(), history: historyDeps(), now: () => NOW },
    );

    assert.equal(api.callsTo("POST", /^\/v2\/checkout\/orders$/).length, expectedOrders, enforcement);
    assert.equal(api.callsTo("POST", /\/capture$/).length, 0, enforcement);
    assert.equal(result.decision.outcome, enforcement === "ENFORCED" ? "DENY" : "ALLOW");
    assert.equal(JSON.stringify(api.requests).includes("Aguardiente"), false, "no product name reaches PayPal");
  }
});

test("with a mandate repository, an ALLOW reserves the charge before it is recorded", async () => {
  const { paypal, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  await mandates.save(mandate("ENFORCED"));
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") },
    { ...deps, capacity: mandates },
  );
  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(paypal.calls.create.length, 1);
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "2880");
});

test("when another purchase used the capacity first, the ALLOW becomes DENY BUDGET_EXCEEDED and no order exists", async () => {
  const { paypal, spending, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  // The caller's copy still says 4000, the repository only has 1000 left.
  await mandates.save(mandate("ENFORCED", { remainingAuthorizedAmount: { value: "1000", assetCode: "USD", assetScale: 2 } }));
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") },
    { ...deps, capacity: mandates },
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.deepEqual(result.decision.reasons.map((r) => r.code), ["BUDGET_EXCEEDED"]);
  assert.equal(paypal.calls.create.length, 0);
  assert.equal((await spending.listByMandate("demo-mandate-medication"))[0].decision.outcome, "DENY");
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "1000");
});

test("if creating the PayPal order throws, the reservation is given back", async () => {
  const { paypal, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  await mandates.save(mandate("ENFORCED"));
  paypal.failures.create = Object.assign(new Error("PayPal unavailable"), { code: "UPSTREAM" });
  await assert.rejects(
    purchaseUnderMandate(
      { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") },
      { ...deps, capacity: mandates },
    ),
    /PayPal unavailable/,
  );
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "4000");
});
