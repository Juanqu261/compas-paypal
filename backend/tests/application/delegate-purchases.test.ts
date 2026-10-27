import assert from "node:assert/strict";
import test from "node:test";
import {
  DelegatePurchaseService,
  type DelegatePurchaseDeps,
  parsePurchaseRequest,
} from "../../src/application/delegate-purchases.ts";
import { PayPalOrderSettlement } from "../../src/application/settle-paypal-order.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { StaticMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit, STRANGER } from "./mandate-test-kit.ts";
import { fakePayPal, historyDeps, LIQUOR_PAYPAL_ID, PHARMACY_PAYPAL_ID, stubRegistry } from "./purchase-test-kit.ts";

const PHARMACY = "demo-merchant-drogueria-central";
const LIQUOR = "demo-merchant-liquor";

/** A charge in the budget's asset. Categories and amounts only. */
function charge(mandateId: string, merchantId: string, category: string | undefined, extra: Record<string, unknown> = {}) {
  const amount = { value: "1120", assetCode: "USD", assetScale: 2 };
  return {
    mandateId,
    merchantId,
    amount,
    lineItems: [{ ...(category ? { category } : {}), amount }],
    idempotencyKey: "key-0123456789abcdef",
    ...extra,
  };
}

/**
 * Pedro's medication mandate, ACTIVE, and the purchase service on the same
 * mandates and spending log. PayPal is a stand-in: nothing here reaches PayPal.
 */
async function purchaseKit(options: {
  execution?: DelegatePurchaseDeps["execution"];
  activate?: boolean;
} = {}) {
  const kit = serviceKit();
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const mandateId = created.mandate.id;
  if (options.activate ?? true) assert.ok((await kit.service.authorize(PEDRO, mandateId)).ok);
  const paypal = fakePayPal();
  let ids = 0;
  const deps: DelegatePurchaseDeps = {
    mandates: kit.service,
    merchants: new StaticMerchantDirectory([
      { id: PHARMACY, displayName: "Droguería Central", paypalMerchantId: PHARMACY_PAYPAL_ID },
      { id: LIQUOR, displayName: "Licorera de ejemplo", paypalMerchantId: LIQUOR_PAYPAL_ID },
    ]),
    registry: stubRegistry(),
    history: historyDeps(),
    payments: paypal.gateway,
    spending: kit.spending,
    capacity: kit.mandates,
    execution: options.execution ?? { allowed: true },
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  };
  return { kit, mandateId, paypal, deps, service: new DelegatePurchaseService(deps) };
}

test("a preview runs every check before PayPal, writes nothing and calls no PayPal API", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit();

  const pharmacy = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(pharmacy.ok);
  assert.equal(pharmacy.preview.next, "ORDER");
  assert.deepEqual(pharmacy.preview.budget, { passed: true, reasonCodes: [] });
  assert.equal(pharmacy.preview.purposeCheck?.outcome, "ALLOW");
  assert.deepEqual(pharmacy.preview.purposeCheck?.matchedCategories, ["MEDICATION"]);

  const liquor = await service.preview(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(liquor.ok);
  assert.equal(liquor.preview.next, "STOP_DENY");
  assert.deepEqual(liquor.preview.purposeCheck?.reasonCodes, ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH"]);

  const over = { value: "5000", assetCode: "USD", assetScale: 2 };
  const tooMuch = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION", { amount: over, lineItems: [{ category: "MEDICATION", amount: over }] }));
  assert.ok(tooMuch.ok);
  assert.equal(tooMuch.preview.next, "STOP_DENY");
  assert.deepEqual(tooMuch.preview.budget, { passed: false, reasonCodes: ["BUDGET_EXCEEDED"] });

  assert.equal(paypal.totalCalls(), 0);
  assert.equal((await kit.spending.listByMandate(mandateId)).length, 0);
  assert.equal((await kit.mandates.getById(mandateId))?.remainingAuthorizedAmount.value, "4000", "a preview reserves nothing");
});

test("with purchases off, nothing is evaluated, recorded or ordered", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit({
    execution: { allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: "off" },
  });
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "PURCHASES_DISABLED_FOR_DEMO");
  assert.equal(paypal.totalCalls(), 0);
  assert.equal((await kit.spending.listByMandate(mandateId)).length, 0);

  const preview = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(preview.ok);
  assert.equal(preview.preview.execution, "PURCHASES_DISABLED_FOR_DEMO");
});

test("alcohol under the medication mandate is denied and never reaches PayPal", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit();
  const result = await service.purchase(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(result.ok);
  assert.equal(result.purchase.outcome, "DENY");
  assert.ok(result.purchase.reasonCodes.includes("PURPOSE_MISMATCH"));
  assert.deepEqual(result.purchase.payment, { status: "NOT_CREATED" });
  assert.equal(paypal.totalCalls(), 0, "no PayPal order exists");

  // Pedro sees the attempt in the same spending log.
  const activity = await kit.service.activity(PEDRO, mandateId);
  assert.ok(activity.ok);
  assert.equal(activity.activity.entries[0].kind, "DENIED");
});

test("medication is allowed, orders once, reserves capacity, and a retry with the same key replays", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit();
  const body = charge(mandateId, PHARMACY, "MEDICATION");

  const [first, concurrent] = await Promise.all([service.purchase(ANDREA, body), service.purchase(ANDREA, body)]);
  assert.ok(first.ok && concurrent.ok);
  assert.equal(first.purchase.outcome, "ALLOW");
  assert.deepEqual(first.purchase.payment, { status: "CREATED", state: "AWAITING_PAYER_APPROVAL" });
  assert.equal(concurrent.replayed, true);
  assert.equal(JSON.stringify(first).includes("paypal.com"), false, "Andrea never gets the approval link");

  const retry = await service.purchase(ANDREA, body);
  assert.ok(retry.ok);
  assert.equal(retry.replayed, true);
  assert.equal(retry.purchase.decisionId, first.purchase.decisionId);
  assert.equal(paypal.calls.create.length, 1, "one PayPal order for three requests");
  assert.equal(paypal.calls.capture.length, 0, "and nothing captured: Pedro has not approved");

  const mandate = await kit.mandates.getById(mandateId);
  assert.equal(mandate?.remainingAuthorizedAmount.value, "2880");
});

test("Pedro approves at PayPal; his activity view reconciles the order and the delegate sees it paid", async () => {
  const { kit, mandateId, paypal, deps, service } = await purchaseKit();
  const purchase = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(purchase.ok);

  const waiting = await kit.service.activity(PEDRO, mandateId);
  assert.ok(waiting.ok);
  const entry = waiting.activity.entries[0];
  assert.equal(entry.kind, "AWAITING_APPROVAL");
  assert.match(entry.approvalUrl ?? "", /^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=/);

  // The return route runs this settlement. Here the activity read reconciles instead.
  const settlement = new PayPalOrderSettlement({
    payments: paypal.gateway,
    spending: kit.spending,
    mandates: kit.mandates,
    parties: new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro" }]),
    history: deps.history,
    now: () => NOW,
  });
  const [orderId] = [...paypal.orders.keys()];
  paypal.approve(orderId);
  assert.equal((await settlement.approved(orderId)).result, "COMPLETED");

  const asAndrea = await kit.service.activity(ANDREA, mandateId);
  assert.ok(asAndrea.ok);
  assert.equal(asAndrea.activity.entries[0].kind, "COMPLETED");
  assert.deepEqual(asAndrea.activity.totals.completed, { value: "1120", assetCode: "USD", assetScale: 2 });
});

test("a key reused for a different purchase is refused", async () => {
  const { mandateId, paypal, service } = await purchaseKit();
  assert.ok((await service.purchase(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"))).ok);
  const reused = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!reused.ok && reused.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(paypal.totalCalls(), 0);
});

test("after a restart, the spending log answers for a key it already recorded", async () => {
  const first = await purchaseKit();
  assert.ok((await first.service.purchase(ANDREA, charge(first.mandateId, LIQUOR, "ALCOHOL"))).ok);
  // A second service over the same storage stands in for a new process.
  const restarted = new DelegatePurchaseService({ ...first.deps, newId: () => "decision-after-restart" });
  const replay = await restarted.purchase(ANDREA, charge(first.mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(replay.ok);
  assert.equal(replay.replayed, true);
  assert.equal((await first.kit.spending.listByMandate(first.mandateId)).length, 1);
});

test("only the mandate's delegate can spend, and only after the payer confirmed", async () => {
  const active = await purchaseKit();
  const asPayer = await active.service.purchase(PEDRO, charge(active.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!asPayer.ok && asPayer.code, "NOT_THE_DELEGATE");
  const asStranger = await active.service.preview(STRANGER, charge(active.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!asStranger.ok && asStranger.code, "NOT_FOUND");

  const draft = await purchaseKit({ activate: false });
  const beforeConfirmation = await draft.service.purchase(ANDREA, charge(draft.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!beforeConfirmation.ok && beforeConfirmation.code, "NOT_FOUND", "a delegate sees nothing before the payer confirms");
  assert.equal(draft.paypal.totalCalls() + active.paypal.totalCalls(), 0);
});

test("a revoked mandate is denied by the mandate rules, before any PayPal call", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit();
  assert.ok((await kit.service.revoke(PEDRO, mandateId)).ok);
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(result.ok);
  assert.equal(result.purchase.outcome, "DENY");
  assert.deepEqual(result.purchase.reasonCodes, ["MANDATE_INACTIVE"]);
  assert.equal(paypal.totalCalls(), 0);
});

test("an unknown merchant id is refused: the payee never comes from the browser", async () => {
  const { mandateId, service } = await purchaseKit();
  const result = await service.preview(ANDREA, charge(mandateId, "demo-merchant-unknown", "MEDICATION"));
  assert.equal(!result.ok && result.code, "UNKNOWN_MERCHANT");
});

test("a PayPal failure while ordering pays nothing and gives the capacity back", async () => {
  const { kit, mandateId, paypal, service } = await purchaseKit();
  paypal.failures.create = Object.assign(new Error("timeout"), { code: "UPSTREAM" });
  const first = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!first.ok && first.code, "PAYMENT_NOT_STARTED");
  assert.equal((await kit.mandates.getById(mandateId))?.remainingAuthorizedAmount.value, "4000");

  // The attempt is recorded as an ALLOW with no order: Pedro sees it did not pay.
  const activity = await kit.service.activity(PEDRO, mandateId);
  assert.ok(activity.ok);
  assert.equal(activity.activity.entries[0].kind, "FAILED");

  delete paypal.failures.create;
  const fresh = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION", { idempotencyKey: "key-fedcba9876543210" }));
  assert.ok(fresh.ok);
  assert.deepEqual(fresh.purchase.payment, { status: "CREATED", state: "AWAITING_PAYER_APPROVAL" });
});

test("the request takes categories and amounts, and the lines must add up", () => {
  const amount = { value: "1000", assetCode: "USD", assetScale: 2 };
  const base = { mandateId: "mandate-1", merchantId: PHARMACY, amount };
  assert.ok(parsePurchaseRequest({ ...base, lineItems: [{ category: "MEDICATION", amount }] }, { requireIdempotencyKey: false }).ok);

  const short = parsePurchaseRequest(
    { ...base, lineItems: [{ category: "MEDICATION", amount: { ...amount, value: "999" } }] },
    { requireIdempotencyKey: false },
  );
  assert.equal(!short.ok && short.errors[0].code, "TOTAL_MISMATCH");

  const unknown = parsePurchaseRequest({ ...base, lineItems: [{ category: "VITAMINS", amount }] }, { requireIdempotencyKey: false });
  assert.equal(!unknown.ok && unknown.errors[0].code, "UNKNOWN_CATEGORY");

  const noKey = parsePurchaseRequest({ ...base, lineItems: [{ amount }] }, { requireIdempotencyKey: true });
  assert.equal(!noKey.ok && noKey.errors[0].field, "idempotencyKey");
});
