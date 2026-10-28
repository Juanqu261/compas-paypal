import assert from "node:assert/strict";
import test from "node:test";
import { listMerchantPayPalPayments } from "../../src/application/merchant-paypal-payments.ts";
import type { SpendingRecord } from "../../src/domain/spending.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { PayPalGatewayError } from "../../src/integrations/paypal/errors.ts";
import type { PayPalOrder } from "../../src/ports/paypal-gateway.ts";

const USD = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
const PHARMACY = "PHARMACYAAAA1";
const OTHER = "OTHERSHOPAAA1";
const merchants = {
  getById: async (id: string) =>
    id === "demo-merchant-drogueria-central"
      ? { id, displayName: "Droguería Central", paypalMerchantId: PHARMACY }
      : undefined,
};

function record(id: string, paypalMerchantId: string, recordedAt: string, orderId?: string): SpendingRecord {
  return {
    id,
    mandateId: "mandate-1",
    purchaseIntentId: `intent-${id}`,
    paypalMerchantId,
    requestedAmount: USD("1500"),
    decision: { outcome: orderId ? "ALLOW" : "DENY", reasons: [] },
    merchantCategories: [],
    lineCategories: ["MEDICATION"],
    hasUncategorizedLines: false,
    monitoredException: false,
    paypal: orderId ? { orderId, state: "AWAITING_PAYER_APPROVAL" } : {},
    recordedAt,
  };
}

async function spendingWith(records: SpendingRecord[]) {
  const spending = new InMemorySpendingLog();
  for (const item of records) {
    const { paypal, ...rest } = item;
    await spending.append({ ...rest, paypal: {} });
    if (paypal.orderId) await spending.recordOrder(item.id, { orderId: paypal.orderId, state: paypal.state! });
  }
  return spending;
}

test("lists the merchant's ordered purchases newest first, each read from PayPal, without the payer", async () => {
  const spending = await spendingWith([
    record("old", PHARMACY, "2026-10-27T10:00:00.000Z", "ORDEROLD"),
    record("new", PHARMACY, "2026-10-27T12:00:00.000Z", "ORDERNEW"),
    record("denied", PHARMACY, "2026-10-27T13:00:00.000Z"),
    record("elsewhere", OTHER, "2026-10-27T14:00:00.000Z", "ORDEROTHER"),
  ]);
  const reads: string[] = [];
  const payments = {
    getOrder: async (orderId: string): Promise<PayPalOrder> => {
      reads.push(orderId);
      return {
        id: orderId,
        status: "COMPLETED",
        payeeMerchantId: PHARMACY,
        amount: USD("1500"),
        payerId: "PAYERSECRET01",
        capture: { id: `CAP-${orderId}`, status: "COMPLETED" },
      };
    },
  };

  const result = await listMerchantPayPalPayments("demo-merchant-drogueria-central", { merchants, spending, payments });

  assert.ok(result.ok);
  assert.deepEqual(result.payments.map((payment) => payment.orderId), ["ORDERNEW", "ORDEROLD"]);
  assert.deepEqual(reads.sort(), ["ORDERNEW", "ORDEROLD"], "only this merchant's orders are read");
  assert.deepEqual(result.payments[0].paypal, {
    read: "OK",
    orderStatus: "COMPLETED",
    payeeMerchantId: PHARMACY,
    amount: USD("1500"),
    capture: { id: "CAP-ORDERNEW", status: "COMPLETED" },
  });
  assert.ok(!JSON.stringify(result).includes("PAYERSECRET01"), "the payer's PayPal id never reaches the merchant");
  assert.ok(!JSON.stringify(result).includes("mandate-1"), "nor the mandate");
});

test("a failed PayPal read is reported per order, never guessed", async () => {
  const spending = await spendingWith([record("one", PHARMACY, "2026-10-27T10:00:00.000Z", "ORDERONE")]);
  const payments = {
    getOrder: async (): Promise<PayPalOrder> => {
      throw new PayPalGatewayError("UPSTREAM", "PayPal get order failed: TimeoutError");
    },
  };

  const result = await listMerchantPayPalPayments("demo-merchant-drogueria-central", { merchants, spending, payments });

  assert.ok(result.ok);
  assert.deepEqual(result.payments[0].paypal, { read: "UNAVAILABLE", error: "UPSTREAM" });
  assert.equal(result.payments[0].compasState, "AWAITING_PAYER_APPROVAL");
});

test("an unknown merchant is refused", async () => {
  const result = await listMerchantPayPalPayments("nobody", {
    merchants,
    spending: new InMemorySpendingLog(),
    payments: { getOrder: async () => assert.fail("PayPal is never called") },
  });
  assert.deepEqual(result, { ok: false, code: "UNKNOWN_MERCHANT" });
});
