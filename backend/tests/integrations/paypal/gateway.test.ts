import assert from "node:assert/strict";
import test from "node:test";
import { PayPalGatewayError } from "../../../src/integrations/paypal/errors.ts";
import { PayPalRestGateway, toPayPalOrder } from "../../../src/integrations/paypal/paypal-rest-gateway.ts";
import { PayPalRestClient } from "../../../src/integrations/paypal/rest-client.ts";
import type { CreateOrderInput } from "../../../src/ports/paypal-gateway.ts";
import { API_BASE_URL, fakePayPalApi, TEST_CLIENT, UNKNOWN_PAYEE } from "./fake-paypal-api.ts";

const RETURN_URL = "http://localhost:4000/paypal/orders/return";
const CANCEL_URL = "http://localhost:4000/paypal/orders/cancel";
const PHARMACY = "TESTPHARMACY2";
const PAYER = "TESTPAYERPEDR";

function setup(options: Parameters<typeof fakePayPalApi>[0] & { now?: () => number } = {}) {
  const api = fakePayPalApi(options);
  const gateway = new PayPalRestGateway({
    client: new PayPalRestClient({
      config: { ...TEST_CLIENT, apiBaseUrl: API_BASE_URL },
      fetch: api.fetch,
      ...(options.now ? { now: options.now } : {}),
    }),
    returnUrl: RETURN_URL,
    cancelUrl: CANCEL_URL,
  });
  return { api, gateway };
}

function order(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    requestId: "decision-1",
    payeeMerchantId: PHARMACY,
    amount: { value: "1120", assetCode: "USD", assetScale: 2 },
    lineAmounts: [
      { value: "1000", assetCode: "USD", assetScale: 2 },
      { value: "120", assetCode: "USD", assetScale: 2 },
    ],
    metadata: { compasMandateId: "mandate-1", compasDecisionId: "decision-1", externalReference: "intent-1" },
    ...overrides,
  };
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PayPalGatewayError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

test("an order pays the merchant directly, names no product and waits for the payer", async () => {
  const { api, gateway } = setup();
  const created = await gateway.createOrder(order());

  assert.equal(created.status, "PAYER_ACTION_REQUIRED");
  assert.equal(created.payeeMerchantId, PHARMACY);
  assert.deepEqual(created.amount, { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.equal(created.customId, "decision-1");
  assert.equal(created.approvalUrl, `https://www.sandbox.paypal.com/checkoutnow?token=${created.id}`);

  const [request] = api.callsTo("POST", /^\/v2\/checkout\/orders$/);
  assert.equal(request.headers["paypal-request-id"], "decision-1");
  assert.equal(request.body?.intent, "CAPTURE");
  const unit = request.body?.purchase_units[0];
  assert.deepEqual(unit.payee, { merchant_id: PHARMACY });
  assert.deepEqual(unit.amount, {
    currency_code: "USD",
    value: "11.20",
    breakdown: { item_total: { currency_code: "USD", value: "11.20" } },
  });
  assert.deepEqual(
    unit.items.map((item: { name: string; unit_amount: { value: string } }) => [item.name, item.unit_amount.value]),
    [["Item 1", "10.00"], ["Item 2", "1.20"]],
  );
  // Only the opaque COMPAS references reach PayPal.
  assert.deepEqual([unit.reference_id, unit.custom_id, unit.invoice_id], ["mandate-1", "decision-1", "intent-1"]);
  assert.deepEqual(request.body?.payment_source.paypal.experience_context, {
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    user_action: "PAY_NOW",
    shipping_preference: "NO_SHIPPING",
  });
  assert.equal(JSON.stringify(request.body).includes("brand_name"), false, "PayPal shows the merchant's own name");
});

test("the same request id returns the same order instead of a second one", async () => {
  const { api, gateway } = setup();
  const first = await gateway.createOrder(order());
  const again = await gateway.createOrder(order());
  assert.equal(again.id, first.id);
  assert.equal(api.orders.size, 1);
});

test("a capture before the payer approved is refused; after approval it pays and reports the payer", async () => {
  const { api, gateway } = setup();
  const created = await gateway.createOrder(order());
  await rejectsWith(gateway.captureOrder({ orderId: created.id, requestId: "decision-1-capture" }), "ORDER_NOT_APPROVED");

  api.approve(created.id, PAYER);
  const approved = await gateway.getOrder(created.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.payerId, PAYER);
  assert.equal(approved.approvalUrl, undefined);

  const captured = await gateway.captureOrder({ orderId: created.id, requestId: "decision-1-capture" });
  assert.equal(captured.status, "COMPLETED");
  assert.equal(captured.capture?.status, "COMPLETED");
  assert.deepEqual(captured.capture?.amount, { value: "1120", assetCode: "USD", assetScale: 2 });
  const [capture] = api.callsTo("POST", /\/capture$/).slice(-1);
  assert.equal(capture.headers["paypal-request-id"], "decision-1-capture");

  await rejectsWith(gateway.captureOrder({ orderId: created.id, requestId: "decision-1-capture-2" }), "ORDER_ALREADY_CAPTURED");
});

test("PayPal's refusals keep their meaning", async () => {
  const { gateway } = setup();
  await rejectsWith(gateway.createOrder(order({ payeeMerchantId: UNKNOWN_PAYEE })), "PAYEE_ACCOUNT_INVALID");
  await rejectsWith(gateway.getOrder("99TESTORDER00000"), "NOT_FOUND");
});

test("what COMPAS can't send is refused before any request", async () => {
  const { api, gateway } = setup();
  await rejectsWith(
    gateway.createOrder(order({ amount: { value: "45000", assetCode: "COP", assetScale: 2 }, lineAmounts: [{ value: "45000", assetCode: "COP", assetScale: 2 }] })),
    "INVALID_INPUT",
  );
  await rejectsWith(gateway.createOrder(order({ lineAmounts: [{ value: "1000", assetCode: "USD", assetScale: 2 }] })), "INVALID_INPUT");
  await rejectsWith(gateway.createOrder(order({ lineAmounts: [] })), "INVALID_INPUT");
  await rejectsWith(
    gateway.createOrder(order({ metadata: { compasMandateId: "m", compasDecisionId: "d".repeat(128), externalReference: "i" } })),
    "INVALID_INPUT",
  );
  await rejectsWith(gateway.getOrder("../../v1/oauth2/token"), "INVALID_INPUT");
  await rejectsWith(gateway.captureOrder({ orderId: "abc/def", requestId: "r" }), "INVALID_INPUT");
  assert.equal(api.requests.length, 0);
});

test("one token serves many calls, and an expired one is renewed", async () => {
  let clock = 0;
  const { api, gateway } = setup({ tokenExpiresInSeconds: 3600, now: () => clock });
  await gateway.createOrder(order());
  await gateway.createOrder(order({ requestId: "decision-2" }));
  assert.equal(api.tokensIssued(), 1);
  clock = 3600 * 1000;
  await gateway.createOrder(order({ requestId: "decision-3" }));
  assert.equal(api.tokensIssued(), 2);
});

test("a 401 renews the token and retries once", async () => {
  const { api, gateway } = setup();
  await gateway.createOrder(order());
  api.failNext(401);
  const second = await gateway.createOrder(order({ requestId: "decision-2" }));
  assert.equal(second.status, "PAYER_ACTION_REQUIRED");
  assert.equal(api.tokensIssued(), 2);
});

test("errors never carry the client secret or a token", async () => {
  const api = fakePayPalApi();
  const gateway = new PayPalRestGateway({
    client: new PayPalRestClient({
      config: { clientId: TEST_CLIENT.clientId, clientSecret: "wrong-secret", apiBaseUrl: API_BASE_URL },
      fetch: api.fetch,
    }),
    returnUrl: RETURN_URL,
    cancelUrl: CANCEL_URL,
  });
  await assert.rejects(gateway.createOrder(order()), (error: unknown) => {
    assert.ok(error instanceof PayPalGatewayError);
    assert.equal(error.code, "UNAUTHORIZED");
    for (const secret of ["wrong-secret", TEST_CLIENT.clientId, "test-access-token"]) {
      assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(secret), false, secret);
    }
    return true;
  });
});

test("a network failure or a 5xx is UPSTREAM, never a payment", async () => {
  const offline = new PayPalRestGateway({
    client: new PayPalRestClient({
      config: { ...TEST_CLIENT, apiBaseUrl: API_BASE_URL },
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    }),
    returnUrl: RETURN_URL,
    cancelUrl: CANCEL_URL,
  });
  await rejectsWith(offline.createOrder(order()), "UPSTREAM");

  const { api, gateway } = setup();
  await gateway.createOrder(order());
  api.failNext(503);
  await rejectsWith(gateway.getOrder("01TESTORDER00000"), "UPSTREAM");
});

test("an order COMPAS can't read, or an approval link off paypal.com, is refused", () => {
  assert.throws(() => toPayPalOrder({ id: "01TESTORDER00000", status: "SOMETHING" }), /can't read/);
  assert.throws(() => toPayPalOrder({ id: "../x", status: "CREATED" }), /can't read/);
  const phishing = toPayPalOrder({
    id: "01TESTORDER00000",
    status: "PAYER_ACTION_REQUIRED",
    links: [{ rel: "payer-action", href: "https://paypal.com.evil.example/checkoutnow" }],
  });
  assert.equal(phishing.approvalUrl, undefined);
});
