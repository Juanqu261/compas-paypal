import assert from "node:assert/strict";
import test from "node:test";
import { confirmPurchasePurpose } from "../../src/application/confirm-purchase-purpose.ts";
import { purchaseUnderMandate } from "../../src/application/purchase-under-mandate.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import {
  historyDeps,
  intent,
  LIQUOR_WALLET,
  mandate,
  NOW,
  PAYER_WALLET,
  PHARMACY_WALLET,
  recordingPayments,
  resolution,
  stubRegistry,
} from "./purchase-test-kit.ts";

const TIENDA = "https://wallet.test/tienda";
const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
  const history = historyDeps();
  let ids = 0;
  const deps = (now: Date) => ({
    merchants: stubRegistry({
      [PHARMACY_WALLET]: resolution(PHARMACY_WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]),
      [LIQUOR_WALLET]: resolution(LIQUOR_WALLET, [["ALCOHOL", "PROVIDER_VERIFIED"]]),
      // A tienda that self-declares MEDICATION and whose NIT matches a Cámara record it typed itself.
      [TIENDA]: resolution(TIENDA, [["MEDICATION", "SELF_DECLARED"]], [["MEDICATION", "REGISTRY_UNBOUND"]]),
    }),
    payments: recordingPayments().payments,
    spending: new InMemorySpendingLog(),
    history,
    now: () => now,
    newId: () => `decision-${++ids}`,
  });
  return { history, deps };
}

/** A mandate for one payer. Each payer has its own delegate. */
function payerMandate(payer: string, minimum: "LOW" | "MEDIUM" | "HIGH", enforcement: "ENFORCED" | "MONITORED" = "ENFORCED") {
  const base = mandate(enforcement);
  return {
    mandate: {
      ...base,
      id: `mandate-${payer}`,
      payer: { ...base.payer, id: payer },
      purposePolicy: { ...base.purposePolicy, merchantConfidence: { minimum } },
    },
    intent: intent(TIENDA, "MEDICATION", { id: `intent-${payer}`, mandateId: `mandate-${payer}` }),
  };
}

test("a paid purchase is observed with categories only; a denied one is not observed", async () => {
  const { history, deps } = setup();
  const paid = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    deps(NOW),
  );
  const observation = await history.observations.findPaid(paid.record.id);
  assert.deepEqual(
    [observation?.mandateCategories, observation?.lineCategories, observation?.paymentState],
    [["MEDICATION"], ["MEDICATION"], "PENDING"],
  );
  assert.equal(observation?.payerRef, history.partyRef("demo-payer-pedro"));
  assert.equal(JSON.stringify(observation).includes("Item"), false, "no line description");
  assert.equal(JSON.stringify(observation).includes("demo-payer-pedro"), false, "no raw party id");

  const denied = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(LIQUOR_WALLET, "ALCOHOL"), payerWalletAddressUrl: PAYER_WALLET },
    deps(NOW),
  );
  assert.equal(await history.observations.findPaid(denied.record.id), undefined);
});

test("only the purchase's payer can confirm it, once", async () => {
  const { history, deps } = setup();
  const { record } = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    deps(NOW),
  );
  const confirm = (payerId: string, verdict: "MATCH" | "MISMATCH", spendingRecordId = record.id) =>
    confirmPurchasePurpose({ spendingRecordId, payerId, verdict }, { ...history, now: () => NOW });

  assert.deepEqual(await confirm("demo-payer-pedro", "MATCH", "no-such-record"), {
    ok: false,
    code: "PURCHASE_NOT_FOUND",
    message: "No paid purchase with that id. Only a paid purchase can be confirmed.",
  });
  const stranger = await confirm("someone-else", "MATCH");
  assert.equal(!stranger.ok && stranger.code, "NOT_THE_PAYER");

  const first = await confirm("demo-payer-pedro", "MATCH");
  assert.deepEqual(first, { ok: true, observationId: `${record.id}:verdict`, duplicate: false });
  assert.deepEqual(await confirm("demo-payer-pedro", "MATCH"), { ok: true, observationId: `${record.id}:verdict`, duplicate: true });
  const changed = await confirm("demo-payer-pedro", "MISMATCH");
  assert.equal(!changed.ok && changed.code, "VERDICT_ALREADY_RECORDED");
});

test("end to end: confirmed purchases from three payers over two weeks lift a tienda from LOW to MEDIUM", async () => {
  const { history, deps } = setup();
  const start = new Date(NOW.getTime() - 20 * DAY_MS);

  // Three payers on MONITORED budgets pay at the tienda and confirm.
  for (const [index, payer] of ["ana", "beto", "carla"].entries()) {
    const at = new Date(start.getTime() + index * DAY_MS);
    const { mandate: m, intent: i } = payerMandate(payer, "MEDIUM", "MONITORED");
    const { record, decision } = await purchaseUnderMandate(
      { mandate: { ...m, validFrom: start.toISOString() }, intent: i, payerWalletAddressUrl: PAYER_WALLET },
      deps(at),
    );
    assert.equal(decision.purposeCheck?.merchantConfidence?.confidence, "LOW", `${payer} saw LOW`);
    assert.equal(record.monitoredException, true);
    const result = await confirmPurchasePurpose(
      { spendingRecordId: record.id, payerId: payer, verdict: "MATCH" },
      { ...history, now: () => at },
    );
    assert.equal(result.ok, true);
  }

  // A fourth payer with an ENFORCED budget that accepts MEDIUM is now paid.
  const { mandate: m, intent: i } = payerMandate("diego", "MEDIUM");
  const { decision } = await purchaseUnderMandate({ mandate: m, intent: i, payerWalletAddressUrl: PAYER_WALLET }, deps(NOW));
  assert.equal(decision.outcome, "ALLOW");
  assert.deepEqual(
    [decision.purposeCheck?.merchantConfidence?.corroboration, decision.purposeCheck?.merchantConfidence?.historyGrade, decision.purposeCheck?.merchantConfidence?.confidence],
    ["REGISTRY_UNBOUND", "EMERGING", "MEDIUM"],
  );

  // An ENFORCED budget that needs HIGH still holds it for review.
  const strict = payerMandate("elena", "HIGH");
  const held = await purchaseUnderMandate({ mandate: strict.mandate, intent: strict.intent, payerWalletAddressUrl: PAYER_WALLET }, deps(NOW));
  assert.equal(held.decision.outcome, "REVIEW");
});

test("mismatch reports from two payers make a verified pharmacy REVIEW", async () => {
  const { history, deps } = setup();
  for (const [index, payer] of ["ana", "beto"].entries()) {
    const base = mandate("ENFORCED");
    const at = new Date(NOW.getTime() - (10 - index) * DAY_MS);
    const { record } = await purchaseUnderMandate(
      {
        mandate: { ...base, id: `m-${payer}`, payer: { ...base.payer, id: payer }, validFrom: "2026-01-01T00:00:00Z" },
        intent: intent(PHARMACY_WALLET, "MEDICATION", { id: `i-${payer}`, mandateId: `m-${payer}` }),
        payerWalletAddressUrl: PAYER_WALLET,
      },
      deps(at),
    );
    await confirmPurchasePurpose(
      { spendingRecordId: record.id, payerId: payer, verdict: "MISMATCH" },
      { ...history, now: () => at },
    );
  }

  const { decision } = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    deps(NOW),
  );
  assert.equal(decision.outcome, "REVIEW");
  assert.deepEqual(decision.reasons.map((reason) => reason.code), ["MERCHANT_HISTORY_CONTRADICTS"]);
});
