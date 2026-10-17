import assert from "node:assert/strict";
import test from "node:test";
import {
  DelegatePurchaseService,
  type DelegatePurchaseDeps,
  parsePurchaseRequest,
} from "../../src/application/delegate-purchases.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { StaticMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit, STRANGER } from "./mandate-test-kit.ts";
import { historyDeps, LIQUOR_WALLET, PAYER_WALLET, PHARMACY_WALLET, recordingPayments, stubRegistry } from "./purchase-test-kit.ts";

const PHARMACY = "demo-merchant-drogueria-central";
const LIQUOR = "demo-merchant-liquor";

/** A charge in the merchant's asset. Categories and amounts only. */
function charge(mandateId: string, merchantId: string, category: string | undefined, extra: Record<string, unknown> = {}) {
  const amount = { value: "1000", assetCode: "EUR", assetScale: 2 };
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
 * Pedro's medication mandate, consented and ACTIVE, and the purchase service
 * on the same mandates, grants and spending log. Open Payments is a recording
 * stand-in: nothing here reaches a wallet.
 */
async function purchaseKit(options: {
  execution?: DelegatePurchaseDeps["execution"];
  payments?: DelegatePurchaseDeps["payments"];
  activate?: boolean;
} = {}) {
  const kit = serviceKit();
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const mandateId = created.mandate.id;
  if (options.activate ?? true) {
    assert.ok((await kit.service.startAuthorization(PEDRO, mandateId)).ok);
    await kit.gateway.finishGrant(mandateId);
    assert.equal(await kit.service.completeAuthorization(mandateId), "ACTIVATED");
  }
  const recording = recordingPayments("1120");
  let ids = 0;
  const service = new DelegatePurchaseService({
    mandates: kit.service,
    merchants: new StaticMerchantDirectory([
      { id: PHARMACY, displayName: "Droguería Central", walletAddressUrl: PHARMACY_WALLET },
      { id: LIQUOR, displayName: "Licorera de ejemplo", walletAddressUrl: LIQUOR_WALLET },
    ]),
    registry: stubRegistry(),
    history: historyDeps(),
    parties: new StaticPartyDirectory([
      { id: PEDRO.partyId, displayName: "Pedro", walletAddressUrl: PAYER_WALLET },
      { id: ANDREA.partyId, displayName: "Andrea" },
    ]),
    grants: kit.gateway.grants,
    payments: options.payments ?? recording.payments,
    spending: kit.spending,
    capacity: kit.mandates,
    execution: options.execution ?? { allowed: true },
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  });
  return { kit, mandateId, recording, service };
}

test("a preview runs the checks before Open Payments, writes nothing and calls no wallet", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit();

  const pharmacy = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(pharmacy.ok);
  assert.equal(pharmacy.preview.next, "QUOTE");
  assert.deepEqual(pharmacy.preview.pendingChecks, ["BUDGET"]);
  assert.equal(pharmacy.preview.purposeCheck?.outcome, "ALLOW");
  assert.deepEqual(pharmacy.preview.purposeCheck?.matchedCategories, ["MEDICATION"]);

  const liquor = await service.preview(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(liquor.ok);
  assert.equal(liquor.preview.next, "STOP_DENY");
  assert.deepEqual(liquor.preview.purposeCheck?.reasonCodes, ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH"]);

  assert.equal(recording.totalCalls(), 0);
  assert.equal((await kit.spending.listByMandate(mandateId)).length, 0);
});

test("with purchases off, nothing is evaluated, recorded or paid", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit({
    execution: { allowed: false, code: "PURCHASES_DISABLED_FOR_DEMO", reason: "off" },
  });
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "PURCHASES_DISABLED_FOR_DEMO");
  assert.equal(recording.totalCalls(), 0);
  assert.equal((await kit.spending.listByMandate(mandateId)).length, 0);

  const preview = await service.preview(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(preview.ok);
  assert.equal(preview.preview.execution, "PURCHASES_DISABLED_FOR_DEMO");
});

test("alcohol under the medication mandate is denied and never reaches Open Payments", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit();
  const result = await service.purchase(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(result.ok);
  assert.equal(result.purchase.outcome, "DENY");
  assert.ok(result.purchase.reasonCodes.includes("PURPOSE_MISMATCH"));
  assert.deepEqual(result.purchase.payment, { status: "NOT_CREATED" });
  assert.equal(recording.totalCalls(), 0, "no incoming payment, quote or outgoing payment");

  // Pedro sees the attempt in the same spending log.
  const activity = await kit.service.activity(PEDRO, mandateId);
  assert.ok(activity.ok);
  assert.equal(activity.activity.entries[0].kind, "DENIED");
});

test("medication is allowed, pays once, reserves capacity, and a retry with the same key replays", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit();
  const body = charge(mandateId, PHARMACY, "MEDICATION");

  const [first, concurrent] = await Promise.all([service.purchase(ANDREA, body), service.purchase(ANDREA, body)]);
  assert.ok(first.ok && concurrent.ok);
  assert.equal(first.purchase.outcome, "ALLOW");
  assert.deepEqual(first.purchase.payment, { status: "CREATED", state: "PENDING" });
  assert.deepEqual(first.purchase.debitAmount, { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.equal(concurrent.replayed, true);

  const retry = await service.purchase(ANDREA, body);
  assert.ok(retry.ok);
  assert.equal(retry.replayed, true);
  assert.equal(retry.purchase.decisionId, first.purchase.decisionId);
  assert.equal(recording.calls.outgoing.length, 1, "one outgoing payment for three requests");

  const mandate = await kit.mandates.getById(mandateId);
  assert.equal(mandate?.remainingAuthorizedAmount.value, "2880");
});

test("a key reused for a different purchase is refused", async () => {
  const { mandateId, recording, service } = await purchaseKit();
  assert.ok((await service.purchase(ANDREA, charge(mandateId, LIQUOR, "ALCOHOL"))).ok);
  const reused = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!reused.ok && reused.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(recording.totalCalls(), 0);
});

test("after a restart, the spending log answers for a key it already recorded", async () => {
  const first = await purchaseKit();
  assert.ok((await first.service.purchase(ANDREA, charge(first.mandateId, LIQUOR, "ALCOHOL"))).ok);
  // A second service over the same storage stands in for a new process.
  const restarted = new DelegatePurchaseService({
    mandates: first.kit.service,
    merchants: new StaticMerchantDirectory([{ id: LIQUOR, displayName: "Licorera de ejemplo", walletAddressUrl: LIQUOR_WALLET }]),
    registry: stubRegistry(),
    history: historyDeps(),
    parties: new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro", walletAddressUrl: PAYER_WALLET }]),
    grants: first.kit.gateway.grants,
    payments: first.recording.payments,
    spending: first.kit.spending,
    capacity: first.kit.mandates,
    execution: { allowed: true },
    now: () => NOW,
  });
  const replay = await restarted.purchase(ANDREA, charge(first.mandateId, LIQUOR, "ALCOHOL"));
  assert.ok(replay.ok);
  assert.equal(replay.replayed, true);
  assert.equal((await first.kit.spending.listByMandate(first.mandateId)).length, 1);
});

test("only the mandate's delegate can spend, and only after consent", async () => {
  const consented = await purchaseKit();
  const asPayer = await consented.service.purchase(PEDRO, charge(consented.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!asPayer.ok && asPayer.code, "NOT_THE_DELEGATE");
  const asStranger = await consented.service.preview(STRANGER, charge(consented.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!asStranger.ok && asStranger.code, "NOT_FOUND");

  const draft = await purchaseKit({ activate: false });
  const beforeConsent = await draft.service.purchase(ANDREA, charge(draft.mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!beforeConsent.ok && beforeConsent.code, "NOT_FOUND", "a delegate sees nothing before consent");
  assert.equal(draft.recording.totalCalls() + consented.recording.totalCalls(), 0);
});

test("a revoked mandate is denied by the mandate rules, before any Open Payments call", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit();
  assert.ok((await kit.service.revoke(PEDRO, mandateId)).ok);
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.ok(result.ok);
  assert.equal(result.purchase.outcome, "DENY");
  assert.deepEqual(result.purchase.reasonCodes, ["MANDATE_INACTIVE"]);
  assert.equal(recording.totalCalls(), 0);
});

test("an ACTIVE mandate without an active grant fails closed", async () => {
  const { kit, mandateId, recording, service } = await purchaseKit();
  await kit.gateway.grants.delete(mandateId);
  const result = await service.purchase(ANDREA, charge(mandateId, PHARMACY, "MEDICATION"));
  assert.equal(!result.ok && result.code, "GRANT_NOT_ACTIVE");
  assert.equal(recording.totalCalls(), 0);
});

test("an unknown merchant id is refused: the wallet never comes from the browser", async () => {
  const { mandateId, service } = await purchaseKit();
  const result = await service.preview(ANDREA, charge(mandateId, "demo-merchant-unknown", "MEDICATION"));
  assert.equal(!result.ok && result.code, "UNKNOWN_MERCHANT");
});

test("a failure after asking for the payment is unknown and is not retried", async () => {
  const recording = recordingPayments("1120");
  let outgoingCalls = 0;
  const { mandateId, service } = await purchaseKit({
    payments: {
      ...recording.payments,
      async createOutgoingPayment() {
        outgoingCalls += 1;
        throw Object.assign(new Error("timeout"), { code: "UPSTREAM" });
      },
    },
  });
  const body = charge(mandateId, PHARMACY, "MEDICATION");
  const first = await service.purchase(ANDREA, body);
  assert.equal(!first.ok && first.code, "PAYMENT_OUTCOME_UNKNOWN");
  const retry = await service.purchase(ANDREA, body);
  assert.equal(!retry.ok && retry.code, "PAYMENT_OUTCOME_UNKNOWN");
  assert.equal(outgoingCalls, 1, "the same key never asks for a second payment");
});

test("a failure before the payment is safe to retry", async () => {
  const recording = recordingPayments("1120");
  let fail = true;
  const { mandateId, service } = await purchaseKit({
    payments: {
      ...recording.payments,
      async createIncomingPayment(input) {
        if (fail) throw Object.assign(new Error("down"), { code: "UPSTREAM" });
        return recording.payments.createIncomingPayment(input);
      },
    },
  });
  const body = charge(mandateId, PHARMACY, "MEDICATION");
  const first = await service.purchase(ANDREA, body);
  assert.equal(!first.ok && first.code, "PAYMENT_NOT_STARTED");
  assert.equal(recording.calls.outgoing.length, 0);
  fail = false;
  const retry = await service.purchase(ANDREA, body);
  assert.ok(retry.ok);
  assert.equal(retry.purchase.outcome, "ALLOW");
  assert.equal(recording.calls.outgoing.length, 1);
});

test("the request takes categories and amounts, and the lines must add up", () => {
  const amount = { value: "1000", assetCode: "EUR", assetScale: 2 };
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
