import assert from "node:assert/strict";
import test from "node:test";
import { MANDATE_STATUSES } from "../../src/domain/mandate.ts";
import { formatMoneyAmount } from "../../src/domain/money.ts";

test("mandate lifecycle includes the scaffold states", () => {
  assert.deepEqual(MANDATE_STATUSES, [
    "DRAFT",
    "PENDING_AUTHORIZATION",
    "ACTIVE",
    "EXHAUSTED",
    "EXPIRED",
    "REVOKED",
  ]);
});

test("formats authorization capacity in minor units", () => {
  assert.equal(
    formatMoneyAmount({ value: "4000", assetCode: "USD", assetScale: 2 }),
    "USD 40.00",
  );
});
