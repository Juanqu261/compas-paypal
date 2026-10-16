import assert from "node:assert/strict";
import test from "node:test";
import { createOutgoingPaymentIfAllowed } from "../../src/application/create-outgoing-payment-if-allowed.ts";
import { POLICY_EVALUATION_ORDER } from "../../src/policy/evaluation-order.ts";
import type {
  CreateOutgoingPaymentInput,
  OutgoingPaymentRef,
} from "../../src/ports/open-payments-gateway.ts";

const input: CreateOutgoingPaymentInput = {
  grantKey: "test-double-mandate",
  quoteId: "test-double://quote",
  metadata: { compasDecisionId: "test-double-decision" },
};

const testDoublePayment: OutgoingPaymentRef = {
  url: "test-double://outgoing-payment",
  state: "PENDING",
  receiverUrl: "test-double://incoming-payment",
  debitAmount: { value: "0", assetCode: "XTS", assetScale: 2 },
  receiveAmount: { value: "0", assetCode: "XTS", assetScale: 2 },
  sentAmount: { value: "0", assetCode: "XTS", assetScale: 2 },
  createdAt: "1970-01-01T00:00:00Z",
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
      return testDoublePayment;
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
      return testDoublePayment;
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
      return testDoublePayment;
    },
  };

  const result = await createOutgoingPaymentIfAllowed("ALLOW", payments, input);

  assert.equal(calls, 1);
  assert.equal(result?.url, "test-double://outgoing-payment");
});
