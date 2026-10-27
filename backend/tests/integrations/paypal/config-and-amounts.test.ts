import assert from "node:assert/strict";
import test from "node:test";
import { fromPayPalAmount, paypalAcceptsAsset, toPayPalAmount } from "../../../src/integrations/paypal/amounts.ts";
import { readPayPalConfig } from "../../../src/integrations/paypal/config.ts";
import { createPayPalGateway } from "../../../src/integrations/paypal/create-paypal-gateway.ts";
import { NotImplementedError } from "../../../src/lib/not-implemented.ts";

test("without the app credentials PayPal is not configured, and the gateway throws instead of faking", async () => {
  assert.deepEqual(readPayPalConfig({}), { configured: false, missing: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] });
  assert.deepEqual(readPayPalConfig({ PAYPAL_CLIENT_ID: "id" }), { configured: false, missing: ["PAYPAL_CLIENT_SECRET"] });

  const setup = createPayPalGateway({ env: {} });
  assert.equal(setup.configured, false);
  await assert.rejects(setup.gateway.getOrder("01TESTORDER00000"), NotImplementedError);
  await assert.rejects(
    setup.gateway.createOrder({
      requestId: "r",
      payeeMerchantId: "TESTPHARMACY2",
      amount: { value: "1", assetCode: "USD", assetScale: 2 },
      lineAmounts: [{ value: "1", assetCode: "USD", assetScale: 2 }],
      metadata: { compasMandateId: "m", compasDecisionId: "d", externalReference: "i" },
    }),
    NotImplementedError,
  );
});

test("with credentials COMPAS uses the sandbox and its own return and cancel routes", () => {
  const result = readPayPalConfig({ PAYPAL_CLIENT_ID: " id ", PAYPAL_CLIENT_SECRET: " secret ", PORT: "4100" });
  assert.ok(result.configured);
  assert.equal(result.config.apiBaseUrl, "https://api-m.sandbox.paypal.com");
  assert.equal(result.config.environment, "sandbox");
  assert.equal(result.config.clientId, "id");
  assert.equal(result.config.returnUrl, "http://localhost:4100/paypal/orders/return");
  assert.equal(result.config.cancelUrl, "http://localhost:4100/paypal/orders/cancel");

  const custom = readPayPalConfig({
    PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "secret",
    PAYPAL_RETURN_URI: "https://compas.example/paypal/orders/return",
    PAYPAL_CANCEL_URI: "https://compas.example/paypal/orders/cancel",
  });
  assert.ok(custom.configured);
  assert.equal(custom.config.returnUrl, "https://compas.example/paypal/orders/return");
});

test("no setting points COMPAS at live PayPal", () => {
  for (const environment of ["live", "production", "LIVE"]) {
    assert.throws(
      () => readPayPalConfig({ PAYPAL_ENVIRONMENT: environment, PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s" }),
      /sandbox only/,
    );
  }
  assert.ok(readPayPalConfig({ PAYPAL_ENVIRONMENT: "sandbox", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s" }).configured);
  assert.throws(
    () => readPayPalConfig({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s", PAYPAL_RETURN_URI: "not a url" }),
    /not a URL/,
  );
});

test("minor units become PayPal's decimal strings and back, never rounded", () => {
  assert.deepEqual(toPayPalAmount({ value: "1120", assetCode: "USD", assetScale: 2 }), { currency_code: "USD", value: "11.20" });
  assert.deepEqual(toPayPalAmount({ value: "5", assetCode: "EUR", assetScale: 2 }), { currency_code: "EUR", value: "0.05" });
  assert.deepEqual(toPayPalAmount({ value: "0012", assetCode: "USD", assetScale: 2 }), { currency_code: "USD", value: "0.12" });
  assert.deepEqual(toPayPalAmount({ value: "1500", assetCode: "JPY", assetScale: 0 }), { currency_code: "JPY", value: "1500" });

  assert.deepEqual(fromPayPalAmount({ currency_code: "USD", value: "11.20" }), { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(fromPayPalAmount({ currency_code: "USD", value: "11.2" }), { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(fromPayPalAmount({ currency_code: "USD", value: "0.05" }), { value: "5", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(fromPayPalAmount({ currency_code: "JPY", value: "1500" }), { value: "1500", assetCode: "JPY", assetScale: 0 });
});

test("a currency PayPal doesn't take, or a wrong scale, fails closed: COMPAS does not convert", () => {
  assert.throws(() => toPayPalAmount({ value: "4500000", assetCode: "COP", assetScale: 2 }), /does not take COP/);
  assert.throws(() => toPayPalAmount({ value: "1120", assetCode: "USD", assetScale: 3 }), /2 decimals/);
  assert.throws(() => toPayPalAmount({ value: "11.20", assetCode: "USD", assetScale: 2 }), /minor units/);
  assert.throws(() => fromPayPalAmount({ currency_code: "USD", value: "11.205" }), /can't read/);
  assert.throws(() => fromPayPalAmount({ currency_code: "COP", value: "100" }), /can't read/);
  assert.throws(() => fromPayPalAmount({ currency_code: "toString", value: "1" }), /can't read/);

  assert.equal(paypalAcceptsAsset({ assetCode: "USD", assetScale: 2 }), true);
  assert.equal(paypalAcceptsAsset({ assetCode: "JPY", assetScale: 0 }), true);
  assert.equal(paypalAcceptsAsset({ assetCode: "USD", assetScale: 0 }), false);
  assert.equal(paypalAcceptsAsset({ assetCode: "COP", assetScale: 2 }), false);
  assert.equal(paypalAcceptsAsset({ assetCode: "constructor", assetScale: 2 }), false);
});
