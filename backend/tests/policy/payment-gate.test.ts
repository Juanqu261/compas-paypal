import assert from "node:assert/strict";
import test from "node:test";
import { createPayPalOrderIfAllowed } from "../../src/application/create-paypal-order-if-allowed.ts";
import { POLICY_EVALUATION_ORDER } from "../../src/policy/evaluation-order.ts";
import type { CreateOrderInput, PayPalOrder } from "../../src/ports/paypal-gateway.ts";

const input: CreateOrderInput = {
  requestId: "test-double-decision",
  payeeMerchantId: "TESTPHARMACY2",
  amount: { value: "0", assetCode: "XTS", assetScale: 2 },
  lineAmounts: [{ value: "0", assetCode: "XTS", assetScale: 2 }],
  metadata: { compasMandateId: "test-double-mandate", compasDecisionId: "test-double-decision", externalReference: "test-double-intent" },
};

const testDoubleOrder: PayPalOrder = { id: "TESTDOUBLEORDER", status: "PAYER_ACTION_REQUIRED" };

function countingPayments() {
  let calls = 0;
  return {
    calls: () => calls,
    payments: {
      async createOrder() {
        calls += 1;
        return testDoubleOrder;
      },
    },
  };
}

test("policy evaluation reaches PayPal only after ALLOW, and money only after the payer approves", () => {
  const order = [...POLICY_EVALUATION_ORDER];
  assert.ok(order.indexOf("policy_decision") < order.indexOf("paypal_order_only_if_allow"));
  assert.deepEqual(order.slice(-3), ["paypal_order_only_if_allow", "payer_approves_at_paypal", "capture_after_mandate_recheck"]);
});

for (const outcome of ["DENY", "REVIEW"] as const) {
  test(`${outcome} never calls createOrder`, async () => {
    const counting = countingPayments();
    assert.equal(await createPayPalOrderIfAllowed(outcome, counting.payments, input), undefined);
    assert.equal(counting.calls(), 0);
  });
}

test("ALLOW is the only outcome that reaches the gateway", async () => {
  const counting = countingPayments();
  const result = await createPayPalOrderIfAllowed("ALLOW", counting.payments, input);
  assert.equal(counting.calls(), 1);
  assert.equal(result?.id, "TESTDOUBLEORDER");
});
