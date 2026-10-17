import assert from "node:assert/strict";
import test from "node:test";
import { OpenPaymentsGatewayError } from "../../../src/integrations/open-payments/errors.ts";
import {
  assertWalletAsset,
  deriveOutgoingPaymentState,
  toMoneyAmount,
  toSafeMetadata,
} from "../../../src/integrations/open-payments/mappers.ts";
import type { SafePaymentMetadata } from "../../../src/ports/open-payments-gateway.ts";

const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });

function assertGatewayError(code: string) {
  return (error: unknown) =>
    error instanceof OpenPaymentsGatewayError && error.code === code;
}

test("toSafeMetadata keeps only the three opaque COMPAS references", () => {
  const unsafe = {
    compasMandateId: "m-1",
    compasDecisionId: "d-1",
    externalReference: "ext-1",
    diagnosis: "must never reach Open Payments",
    medication: "must never reach Open Payments",
  } as SafePaymentMetadata;

  assert.deepEqual(toSafeMetadata(unsafe), {
    compasMandateId: "m-1",
    compasDecisionId: "d-1",
    externalReference: "ext-1",
  });
});

test("toSafeMetadata returns undefined when nothing safe is left", () => {
  assert.equal(toSafeMetadata(undefined), undefined);
  assert.equal(
    toSafeMetadata({ note: "drop me" } as SafePaymentMetadata),
    undefined,
  );
});

test("toSafeMetadata rejects empty or oversized values", () => {
  assert.throws(
    () => toSafeMetadata({ compasMandateId: "" }),
    assertGatewayError("INVALID_INPUT"),
  );
  assert.throws(
    () => toSafeMetadata({ externalReference: "x".repeat(129) }),
    assertGatewayError("INVALID_INPUT"),
  );
});

test("toMoneyAmount accepts integer minor units only", () => {
  assert.deepEqual(toMoneyAmount(usd("4000")), usd("4000"));
  assert.throws(() => toMoneyAmount(usd("-1")), assertGatewayError("INVALID_INPUT"));
  assert.throws(() => toMoneyAmount(usd("40.00")), assertGatewayError("INVALID_INPUT"));
  assert.throws(
    () => toMoneyAmount({ value: "1", assetCode: "USD", assetScale: -2 }),
    assertGatewayError("INVALID_INPUT"),
  );
});

test("assertWalletAsset refuses an amount in another asset or scale", () => {
  const wallet = { walletAddressUrl: "https://w.example/pedro", assetCode: "USD", assetScale: 2 };
  assert.doesNotThrow(() => assertWalletAsset(usd("1"), wallet, "debitLimit"));
  assert.throws(
    () => assertWalletAsset({ value: "1", assetCode: "EUR", assetScale: 2 }, wallet, "debitLimit"),
    assertGatewayError("ASSET_MISMATCH"),
  );
  assert.throws(
    () => assertWalletAsset({ value: "1", assetCode: "USD", assetScale: 9 }, wallet, "debitLimit"),
    assertGatewayError("ASSET_MISMATCH"),
  );
});

test("deriveOutgoingPaymentState reads failed, sentAmount and debitAmount", () => {
  assert.equal(
    deriveOutgoingPaymentState({ failed: true, debitAmount: usd("100"), sentAmount: usd("100") }),
    "FAILED",
  );
  assert.equal(
    deriveOutgoingPaymentState({ failed: false, debitAmount: usd("100"), sentAmount: usd("40") }),
    "PENDING",
  );
  assert.equal(
    deriveOutgoingPaymentState({ failed: false, debitAmount: usd("100"), sentAmount: usd("100") }),
    "COMPLETED",
  );
});

test("deriveOutgoingPaymentState compares large values exactly", () => {
  assert.equal(
    deriveOutgoingPaymentState({
      failed: false,
      debitAmount: usd("9007199254740993"),
      sentAmount: usd("9007199254740992"),
    }),
    "PENDING",
  );
});
