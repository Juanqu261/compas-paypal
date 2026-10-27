import assert from "node:assert/strict";
import test from "node:test";
import {
  handlePayPalReturn,
  isPayPalReturnPath,
  PAYPAL_ORDER_CANCEL_PATH,
  PAYPAL_ORDER_RETURN_PATH,
} from "../../src/api/paypal-return.ts";
import type { SettlementOutcome } from "../../src/application/settle-paypal-order.ts";

const RETURN_URL = "http://localhost:3000/demo";

function settlementStub(outcome: SettlementOutcome | Error) {
  const calls: { kind: "approved" | "cancelled"; orderId: string }[] = [];
  const answer = async (kind: "approved" | "cancelled", orderId: string) => {
    calls.push({ kind, orderId });
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return {
    calls,
    settlement: {
      approved: (orderId: string) => answer("approved", orderId),
      cancelled: (orderId: string) => answer("cancelled", orderId),
    },
  };
}

const at = (path: string, query: string) => new URL(`http://localhost:4000${path}${query}`);

test("the return and cancel paths are recognized", () => {
  assert.equal(isPayPalReturnPath(PAYPAL_ORDER_RETURN_PATH), true);
  assert.equal(isPayPalReturnPath(PAYPAL_ORDER_CANCEL_PATH), true);
  assert.equal(isPayPalReturnPath("/paypal/orders"), false);
});

test("an approval return settles the order and sends the payer back to the budget", async () => {
  const stub = settlementStub({ result: "COMPLETED", mandateId: "mandate-abc-1" });
  const { location, result } = await handlePayPalReturn(at(PAYPAL_ORDER_RETURN_PATH, "?token=5O190127TN364715T&PayerID=TESTPAYERPEDR"), {
    settlement: stub.settlement,
    returnUrl: RETURN_URL,
  });
  assert.equal(result, "completed");
  assert.deepEqual(stub.calls, [{ kind: "approved", orderId: "5O190127TN364715T" }]);
  const back = new URL(location);
  assert.equal(back.origin + back.pathname, RETURN_URL);
  assert.equal(back.searchParams.get("paypalOrder"), "completed");
  assert.equal(back.searchParams.get("mandateId"), "mandate-abc-1");
  assert.equal(back.searchParams.has("token"), false, "the order id stays on the server");
  assert.equal(back.searchParams.has("PayerID"), false, "the payer's PayPal id stays on the server");
});

test("a cancel return closes the order unpaid", async () => {
  const stub = settlementStub({ result: "CANCELLED", mandateId: "mandate-abc-1" });
  const { result } = await handlePayPalReturn(at(PAYPAL_ORDER_CANCEL_PATH, "?token=5O190127TN364715T"), {
    settlement: stub.settlement,
    returnUrl: RETURN_URL,
  });
  assert.equal(result, "cancelled");
  assert.deepEqual(stub.calls, [{ kind: "cancelled", orderId: "5O190127TN364715T" }]);
});

test("a missing or malformed token is not looked up", async () => {
  for (const query of ["", "?token=", "?token=../../v1/oauth2/token", "?token=abc%20def"]) {
    const stub = settlementStub({ result: "COMPLETED", mandateId: "mandate-abc-1" });
    const { location, result } = await handlePayPalReturn(at(PAYPAL_ORDER_RETURN_PATH, query), {
      settlement: stub.settlement,
      returnUrl: RETURN_URL,
    });
    assert.equal(result, "failed", query);
    assert.equal(stub.calls.length, 0, query);
    assert.equal(new URL(location).searchParams.has("mandateId"), false);
  }
});

test("an order no COMPAS purchase names, or a settlement that fails, is never reported as paid", async () => {
  const unknown = await handlePayPalReturn(at(PAYPAL_ORDER_RETURN_PATH, "?token=5O190127TN364715T"), {
    settlement: settlementStub({ result: "UNKNOWN_ORDER" }).settlement,
    returnUrl: RETURN_URL,
  });
  assert.equal(unknown.result, "failed");

  const errors: string[] = [];
  const thrown = await handlePayPalReturn(at(PAYPAL_ORDER_RETURN_PATH, "?token=5O190127TN364715T"), {
    settlement: settlementStub(Object.assign(new Error("timeout"), { code: "UPSTREAM" })).settlement,
    returnUrl: RETURN_URL,
    logError: (message) => errors.push(message),
  });
  assert.equal(thrown.result, "unconfirmed");
  assert.match(errors[0], /UPSTREAM/);
});
