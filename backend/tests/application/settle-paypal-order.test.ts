import assert from "node:assert/strict";
import test from "node:test";
import { purchaseUnderMandate } from "../../src/application/purchase-under-mandate.ts";
import { PayPalOrderSettlement } from "../../src/application/settle-paypal-order.ts";
import type { Mandate } from "../../src/domain/mandate.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import {
  fakePayPal,
  historyDeps,
  intent,
  mandate,
  NOW,
  PAYER_PAYPAL_ID,
  PHARMACY_PAYPAL_ID,
  stubRegistry,
} from "./purchase-test-kit.ts";

const MANDATE_ID = "demo-mandate-medication";

/**
 * One allowed pharmacy purchase whose PayPal order waits for the payer, and
 * the settlement the return route uses. `payerPayPalId` pins the approver.
 */
async function awaitingOrder(
  options: { payerPayPalId?: string; captureStatus?: "COMPLETED" | "PENDING" | "DECLINED"; mandate?: Partial<Mandate> } = {},
) {
  const paypal = fakePayPal(options.captureStatus ? { captureStatus: options.captureStatus } : {});
  const spending = new InMemorySpendingLog();
  const mandates = new InMemoryMandateRepository();
  const history = historyDeps();
  let clock = NOW;
  await mandates.save(mandate("ENFORCED", options.mandate));
  const { record, order } = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED", options.mandate), intent: intent(PHARMACY_PAYPAL_ID, "MEDICATION") },
    {
      merchants: stubRegistry(),
      payments: paypal.gateway,
      spending,
      history,
      capacity: mandates,
      now: () => clock,
      newId: () => "decision-1",
    },
  );
  assert.ok(order, "the purchase was allowed and ordered");
  const warnings: string[] = [];
  const settlement = new PayPalOrderSettlement({
    payments: paypal.gateway,
    spending,
    mandates,
    parties: new StaticPartyDirectory([
      {
        id: "demo-payer-pedro",
        displayName: "Pedro",
        ...(options.payerPayPalId ? { paypalPayerId: options.payerPayPalId } : {}),
      },
    ]),
    history,
    now: () => clock,
    logWarning: (message) => warnings.push(message),
  });
  return {
    paypal,
    spending,
    mandates,
    history,
    settlement,
    order,
    record,
    warnings,
    setNow(next: Date) {
      clock = next;
    },
    remaining: async () => (await mandates.getById(MANDATE_ID))?.remainingAuthorizedAmount.value,
    stored: async () => (await spending.findByPayPalOrderId(order.id))!,
  };
}

test("the payer approves at PayPal: COMPAS captures once, records the capture and the purchase joins the history", async () => {
  const kit = await awaitingOrder();
  kit.paypal.approve(kit.order.id);

  assert.deepEqual(await kit.settlement.approved(kit.order.id), { result: "COMPLETED", mandateId: MANDATE_ID });
  assert.deepEqual(kit.paypal.calls.capture, [{ orderId: kit.order.id, requestId: "decision-1-capture" }]);
  const stored = await kit.stored();
  assert.equal(stored.paypal.state, "COMPLETED");
  assert.match(stored.paypal.captureId ?? "", /^TESTCAPTURE/);
  assert.equal(await kit.remaining(), "2880", "the charge stays spent");

  const paid = await kit.history.observations.findPaid("decision-1");
  assert.equal(paid?.paymentState, "COMPLETED");
  assert.deepEqual(paid?.lineCategories, ["MEDICATION"]);

  // The payer's browser comes back twice: nothing is captured or recorded again.
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "COMPLETED");
  assert.equal(kit.paypal.calls.capture.length, 1);
});

test("a return before the payer approved captures nothing", async () => {
  const kit = await awaitingOrder();
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "AWAITING_PAYER_APPROVAL");
  assert.equal(kit.paypal.calls.capture.length, 0);
  assert.equal((await kit.stored()).paypal.state, "AWAITING_PAYER_APPROVAL");
});

for (const [label, change] of [
  ["revoked", { status: "REVOKED" as const }],
  ["expired", undefined],
] as const) {
  test(`a mandate ${label} while the payer was at PayPal is not paid, and its capacity comes back`, async () => {
    const kit = await awaitingOrder();
    kit.paypal.approve(kit.order.id);
    if (change) await kit.mandates.transitionStatus(MANDATE_ID, ["ACTIVE"], change.status);
    else kit.setNow(new Date("2027-01-01T00:00:00Z"));

    assert.equal((await kit.settlement.approved(kit.order.id)).result, "FAILED");
    assert.equal(kit.paypal.calls.capture.length, 0);
    assert.equal(kit.paypal.calls.get.length, 0, "PayPal is not even asked");
    assert.equal((await kit.stored()).paypal.failureCode, "MANDATE_NOT_USABLE");
    assert.equal(await kit.remaining(), "4000");
  });
}

test("with the payer's PayPal account pinned, another account's approval is not captured", async () => {
  const kit = await awaitingOrder({ payerPayPalId: PAYER_PAYPAL_ID });
  kit.paypal.approve(kit.order.id, "TESTSTRANGER2");
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "FAILED");
  assert.equal((await kit.stored()).paypal.failureCode, "PAYER_ACCOUNT_MISMATCH");
  assert.equal(kit.paypal.calls.capture.length, 0);
  assert.equal(await kit.remaining(), "4000");

  const own = await awaitingOrder({ payerPayPalId: PAYER_PAYPAL_ID });
  own.paypal.approve(own.order.id, PAYER_PAYPAL_ID);
  assert.equal((await own.settlement.approved(own.order.id)).result, "COMPLETED");
});

test("an order that no longer matches what COMPAS created is not captured", async () => {
  for (const tamper of [
    (order: { payeeMerchantId?: string }) => (order.payeeMerchantId = "TESTELSEWHERE"),
    (order: { amount?: { value: string } }) => (order.amount = { ...order.amount!, value: "9999" }),
    (order: { customId?: string }) => (order.customId = "another-decision"),
  ]) {
    const kit = await awaitingOrder();
    kit.paypal.approve(kit.order.id);
    tamper(kit.paypal.orders.get(kit.order.id) as never);
    assert.equal((await kit.settlement.approved(kit.order.id)).result, "FAILED");
    assert.equal((await kit.stored()).paypal.failureCode, "ORDER_MISMATCH");
    assert.equal(kit.paypal.calls.capture.length, 0);
    assert.equal(await kit.remaining(), "4000");
  }
});

test("the payer cancels at PayPal: nothing is paid and the capacity comes back once", async () => {
  const kit = await awaitingOrder();
  assert.deepEqual(await kit.settlement.cancelled(kit.order.id), { result: "CANCELLED", mandateId: MANDATE_ID });
  assert.equal(await kit.remaining(), "4000");
  assert.equal((await kit.settlement.cancelled(kit.order.id)).result, "CANCELLED");
  assert.equal(await kit.remaining(), "4000", "a second cancel gives nothing back twice");

  // An approval that arrives after the cancel captures nothing.
  kit.paypal.approve(kit.order.id);
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "CANCELLED");
  assert.equal(kit.paypal.calls.capture.length, 0);
});

test("a cancel redirect for an order PayPal holds as approved settles it instead", async () => {
  const kit = await awaitingOrder();
  kit.paypal.approve(kit.order.id);
  assert.equal((await kit.settlement.cancelled(kit.order.id)).result, "COMPLETED");
});

test("an order no COMPAS purchase names is ignored", async () => {
  const kit = await awaitingOrder();
  assert.deepEqual(await kit.settlement.approved("TESTORDERUNKNOWN"), { result: "UNKNOWN_ORDER" });
  assert.deepEqual(await kit.settlement.cancelled("TESTORDERUNKNOWN"), { result: "UNKNOWN_ORDER" });
  assert.equal(kit.paypal.calls.capture.length, 0);
});

test("a capture with no clear answer stays waiting, and the next refresh settles it from PayPal", async () => {
  const kit = await awaitingOrder();
  kit.paypal.approve(kit.order.id);
  kit.paypal.failures.capture = Object.assign(new Error("PayPal capture order failed: TimeoutError"), { code: "UPSTREAM" });
  await assert.rejects(kit.settlement.approved(kit.order.id), /TimeoutError/);
  assert.equal((await kit.stored()).paypal.state, "AWAITING_PAYER_APPROVAL");
  assert.equal(await kit.remaining(), "2880", "the reservation holds while the outcome is unknown");

  // PayPal did capture it: the next read finds the order COMPLETED and records it without capturing again.
  delete kit.paypal.failures.capture;
  await kit.paypal.gateway.captureOrder({ orderId: kit.order.id, requestId: "decision-1-capture" });
  const captures = kit.paypal.calls.capture.length;
  await kit.settlement.refresh(MANDATE_ID);
  assert.equal(kit.paypal.calls.capture.length, captures);
  assert.equal((await kit.stored()).paypal.state, "COMPLETED");
  assert.ok(await kit.history.observations.findPaid("decision-1"));
});

test("refresh captures an order the payer approved whose return never reached COMPAS", async () => {
  const kit = await awaitingOrder();
  kit.paypal.approve(kit.order.id);
  await kit.settlement.refresh(MANDATE_ID);
  assert.equal((await kit.stored()).paypal.state, "COMPLETED");
});

test("refresh closes an order PayPal no longer knows and gives the capacity back", async () => {
  const kit = await awaitingOrder();
  kit.paypal.forget(kit.order.id);
  await kit.settlement.refresh(MANDATE_ID);
  const stored = await kit.stored();
  assert.equal(stored.paypal.state, "FAILED");
  assert.equal(stored.paypal.failureCode, "ORDER_EXPIRED");
  assert.equal(await kit.remaining(), "4000");
});

test("refresh leaves an order alone when PayPal can't be read", async () => {
  const kit = await awaitingOrder();
  kit.paypal.failures.get = Object.assign(new Error("down"), { code: "UPSTREAM" });
  await kit.settlement.refresh(MANDATE_ID);
  assert.equal((await kit.stored()).paypal.state, "AWAITING_PAYER_APPROVAL");
  assert.equal(await kit.remaining(), "2880");
  assert.match(kit.warnings.join("\n"), /UPSTREAM/);
});

test("a pending capture is history at once and completes on a later refresh", async () => {
  const kit = await awaitingOrder({ captureStatus: "PENDING" });
  kit.paypal.approve(kit.order.id);
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "PENDING");
  assert.equal((await kit.history.observations.findPaid("decision-1"))?.paymentState, "PENDING");

  kit.paypal.orders.get(kit.order.id)!.capture!.status = "COMPLETED";
  await kit.settlement.refresh(MANDATE_ID);
  assert.equal((await kit.stored()).paypal.state, "COMPLETED");
});

test("a declined capture is not paid and gives the capacity back", async () => {
  const kit = await awaitingOrder({ captureStatus: "DECLINED" });
  kit.paypal.approve(kit.order.id);
  assert.equal((await kit.settlement.approved(kit.order.id)).result, "FAILED");
  assert.equal((await kit.stored()).paypal.failureCode, "CAPTURE_DECLINED");
  assert.equal(await kit.remaining(), "4000");
  assert.equal(await kit.history.observations.findPaid("decision-1"), undefined, "a declined capture is not history");
});
