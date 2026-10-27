import assert from "node:assert/strict";
import test from "node:test";
import { createPayPalOrderIfAllowed } from "../../src/application/create-paypal-order-if-allowed.ts";
import { PayPalRestGateway } from "../../src/integrations/paypal/paypal-rest-gateway.ts";
import { PayPalRestClient } from "../../src/integrations/paypal/rest-client.ts";
import type { CreateOrderInput } from "../../src/ports/paypal-gateway.ts";
import { API_BASE_URL, fakePayPalApi, TEST_CLIENT } from "../integrations/paypal/fake-paypal-api.ts";

/**
 * Drives the real adapter over a test double of the PayPal REST API. DENY and
 * REVIEW must not reach POST /v2/checkout/orders, and nothing in the order
 * gate ever captures: a capture is the settlement's, after the payer approved.
 */
function realAdapter() {
  const api = fakePayPalApi();
  const gateway = new PayPalRestGateway({
    client: new PayPalRestClient({ config: { ...TEST_CLIENT, apiBaseUrl: API_BASE_URL }, fetch: api.fetch }),
    returnUrl: "http://localhost:4000/paypal/orders/return",
    cancelUrl: "http://localhost:4000/paypal/orders/cancel",
  });
  return { api, gateway };
}

const input: CreateOrderInput = {
  requestId: "demo-decision-alcohol",
  payeeMerchantId: "TESTLAGERBAR2",
  amount: { value: "1500", assetCode: "USD", assetScale: 2 },
  lineAmounts: [{ value: "1500", assetCode: "USD", assetScale: 2 }],
  metadata: {
    compasMandateId: "demo-mandate-medication",
    compasDecisionId: "demo-decision-alcohol",
    externalReference: "demo-intent-liquor",
  },
};

for (const outcome of ["DENY", "REVIEW"] as const) {
  test(`${outcome} never reaches PayPal on the real adapter`, async () => {
    const { api, gateway } = realAdapter();
    assert.equal(await createPayPalOrderIfAllowed(outcome, gateway, input), undefined);
    assert.equal(api.requests.length, 0, "not even a token request");
  });
}

test("ALLOW creates exactly one order and captures nothing", async () => {
  const { api, gateway } = realAdapter();
  const order = await createPayPalOrderIfAllowed("ALLOW", gateway, input);
  assert.equal(order?.status, "PAYER_ACTION_REQUIRED");
  assert.equal(api.callsTo("POST", /^\/v2\/checkout\/orders$/).length, 1);
  assert.equal(api.callsTo("POST", /\/capture$/).length, 0);
});
