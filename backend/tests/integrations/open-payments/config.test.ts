import assert from "node:assert/strict";
import test from "node:test";
import {
  readOpenPaymentsConfig,
  toWalletAddressUrl,
} from "../../../src/integrations/open-payments/config.ts";
import { createOpenPaymentsGateway } from "../../../src/integrations/open-payments/create-open-payments-gateway.ts";
import { NotImplementedError } from "../../../src/lib/not-implemented.ts";

test("missing client env is reported by name, not invented", () => {
  const result = readOpenPaymentsConfig({ KEY_ID: "key-1", PRIVATE_KEY_PATH: " " });
  assert.equal(result.configured, false);
  assert.deepEqual(
    !result.configured && result.missing,
    ["CLIENT_WALLET_ADDRESS", "PRIVATE_KEY_PATH"],
  );
});

test("a complete env yields a config with the default finish URI", () => {
  const result = readOpenPaymentsConfig({
    CLIENT_WALLET_ADDRESS: "$ilp.interledger-test.dev/compas",
    KEY_ID: "key-1",
    PRIVATE_KEY_PATH: "./private.key",
    OPEN_PAYMENTS_FINISH_URI: "",
    PORT: "4100",
  });
  assert.ok(result.configured);
  assert.equal(result.config.clientWalletAddressUrl, "https://ilp.interledger-test.dev/compas");
  assert.equal(result.config.finishUri, "http://localhost:4100/open-payments/finish");
});

test("toWalletAddressUrl accepts payment pointers and https URLs", () => {
  assert.equal(toWalletAddressUrl("$wallet.example/pedro"), "https://wallet.example/pedro");
  assert.equal(toWalletAddressUrl("https://wallet.example/pedro/"), "https://wallet.example/pedro");
  assert.throws(() => toWalletAddressUrl("not a url"));
  assert.throws(() => toWalletAddressUrl("ftp://wallet.example/pedro"));
});

test("without client env the composition root keeps the throwing gateway", async () => {
  const setup = await createOpenPaymentsGateway({ env: {} });
  assert.equal(setup.configured, false);
  await assert.rejects(
    setup.gateway.createOutgoingPayment({
      grantKey: "m-1",
      quoteId: "q-1",
      metadata: {},
    }),
    NotImplementedError,
  );
});
