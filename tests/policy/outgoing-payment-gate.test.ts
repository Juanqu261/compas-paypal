import assert from "node:assert/strict";
import test from "node:test";
import { createOutgoingPaymentIfAllowed } from "../../src/compas/application/create-outgoing-payment-if-allowed.ts";
import { POLICY_EVALUATION_ORDER } from "../../src/compas/policy/evaluation-order.ts";
import type { CreateOutgoingPaymentInput } from "../../src/compas/ports/open-payments-gateway.ts";

const input: CreateOutgoingPaymentInput = {
  resourceServer: "test-double://resource-server",
  walletAddressUrl: "test-double://wallet",
  quoteUrl: "test-double://quote",
};

test("policy evaluation reaches Open Payments only after ALLOW", () => {
  assert.equal(
    POLICY_EVALUATION_ORDER.at(-1),
    "open_payments_only_if_allow",
  );
});

test("a denied decision never calls createOutgoingPayment", async () => {
  let calls = 0;
  const payments = {
    async createOutgoingPayment() {
      calls += 1;
      return { url: "test-double://outgoing-payment", status: "test-double" };
    },
  };

  const result = await createOutgoingPaymentIfAllowed("DENY", payments, input);

  assert.equal(result, undefined);
  assert.equal(calls, 0);
});

test("review does not call createOutgoingPayment", async () => {
  let calls = 0;
  const payments = {
    async createOutgoingPayment() {
      calls += 1;
      return { url: "test-double://outgoing-payment", status: "test-double" };
    },
  };

  const result = await createOutgoingPaymentIfAllowed(
    "REVIEW",
    payments,
    input,
  );

  assert.equal(result, undefined);
  assert.equal(calls, 0);
});

test("allow is the only outcome that reaches the gateway", async () => {
  let calls = 0;
  const payments = {
    async createOutgoingPayment() {
      calls += 1;
      return { url: "test-double://outgoing-payment", status: "test-double" };
    },
  };

  const result = await createOutgoingPaymentIfAllowed("ALLOW", payments, input);

  assert.equal(calls, 1);
  assert.equal(result?.url, "test-double://outgoing-payment");
});
