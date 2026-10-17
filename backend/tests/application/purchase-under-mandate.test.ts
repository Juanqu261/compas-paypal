import assert from "node:assert/strict";
import test from "node:test";
import { purchaseUnderMandate } from "../../src/application/purchase-under-mandate.ts";
import { buildSpendingReport } from "../../src/application/spending-report.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { InMemoryGrantStore } from "../../src/integrations/open-payments/in-memory-grant-store.ts";
import { computeInteractionHash } from "../../src/integrations/open-payments/interaction-hash.ts";
import { InterledgerOpenPaymentsGateway } from "../../src/integrations/open-payments/interledger-open-payments-gateway.ts";
import {
  createFakeSdk,
  MERCHANT,
  PAYER,
  PAYER_CONSENT,
} from "../integrations/open-payments/fake-sdk.ts";
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

function setup(debitValue?: string) {
  const op = recordingPayments(debitValue);
  const spending = new InMemorySpendingLog();
  let ids = 0;
  const deps = {
    merchants: stubRegistry(),
    payments: op.payments,
    spending,
    history: historyDeps(),
    now: () => NOW,
    newId: () => `decision-${++ids}`,
  };
  return { op, spending, deps };
}

test("ENFORCED pharmacy purchase: Open Payments runs once, and the record shows the match", async () => {
  const { op, deps } = setup();
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    deps,
  );

  assert.equal(result.decision.outcome, "ALLOW");
  assert.deepEqual([op.calls.incoming.length, op.calls.quote.length, op.calls.outgoing.length], [1, 1, 1]);
  assert.deepEqual(op.calls.outgoing[0], {
    grantKey: "demo-mandate-medication",
    quoteId: `${PAYER_WALLET}/quotes/1`,
    metadata: { compasMandateId: "demo-mandate-medication", compasDecisionId: "decision-1" },
  });
  assert.deepEqual(op.calls.incoming[0].metadata, {
    compasMandateId: "demo-mandate-medication",
    externalReference: "intent-MEDICATION",
  });

  assert.equal(result.record.monitoredException, false);
  assert.deepEqual(result.record.merchantCategories, [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }]);
  assert.equal(result.record.openPayments.outgoingPaymentUrl, `${PAYER_WALLET}/outgoing-payments/1`);
  assert.equal(result.record.openPayments.state, "PENDING");
  assert.deepEqual(result.record.debitAmount, { value: "1120", assetCode: "USD", assetScale: 2 });
});

test("ENFORCED liquor purchase: no Open Payments call at all, but the attempt is recorded", async () => {
  const { op, spending, deps } = setup();
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(LIQUOR_WALLET, "ALCOHOL"), payerWalletAddressUrl: PAYER_WALLET },
    deps,
  );

  assert.equal(result.decision.outcome, "DENY");
  assert.equal(result.payment, undefined);
  assert.equal(op.totalCalls(), 0);
  const [record] = await spending.listByMandate("demo-mandate-medication");
  assert.deepEqual(record.merchantCategories.map((c) => c.category), ["ALCOHOL", "TOBACCO"]);
  assert.equal(record.debitAmount, undefined);
  assert.deepEqual(record.openPayments, {});
});

test("MONITORED liquor purchase: paid, flagged, and the failed match stays on the record", async () => {
  const { op, deps } = setup();
  const result = await purchaseUnderMandate(
    { mandate: mandate("MONITORED"), intent: intent(LIQUOR_WALLET, "ALCOHOL"), payerWalletAddressUrl: PAYER_WALLET },
    deps,
  );

  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(op.calls.outgoing.length, 1);
  assert.equal(result.record.monitoredException, true);
  assert.equal(result.record.purposeCheck?.outcome, "DENY");
  assert.equal(result.record.purposeCheck?.enforced, false);
  assert.deepEqual(result.record.merchantCategories.map((c) => c.category), ["ALCOHOL", "TOBACCO"]);
  // Open Payments metadata stays opaque, whatever the purpose check said.
  assert.deepEqual(Object.keys(op.calls.outgoing[0].metadata).sort(), ["compasDecisionId", "compasMandateId"]);
});

test("MONITORED does not lift mandate rules: a stranger never reaches Open Payments", async () => {
  const { op, deps } = setup();
  const result = await purchaseUnderMandate(
    {
      mandate: mandate("MONITORED"),
      intent: intent(LIQUOR_WALLET, "ALCOHOL", { delegateId: "someone-else" }),
      payerWalletAddressUrl: PAYER_WALLET,
    },
    deps,
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.equal(op.totalCalls(), 0);
});

test("MONITORED does not lift the budget: an over-budget quote is denied after quoting", async () => {
  const { op, deps } = setup("5000");
  const result = await purchaseUnderMandate(
    { mandate: mandate("MONITORED"), intent: intent(LIQUOR_WALLET, "ALCOHOL"), payerWalletAddressUrl: PAYER_WALLET },
    deps,
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.deepEqual(result.decision.reasons.map((r) => r.code), ["BUDGET_EXCEEDED"]);
  assert.deepEqual([op.calls.incoming.length, op.calls.quote.length, op.calls.outgoing.length], [1, 1, 0]);
  assert.equal(result.record.purposeCheck?.outcome, "DENY", "the purpose result is still recorded");
});

test("the spending report shows where the budget went and which shops matched", async () => {
  const { spending, deps } = setup();
  const monitored = mandate("MONITORED");
  await purchaseUnderMandate({ mandate: monitored, intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET }, deps);
  await purchaseUnderMandate({ mandate: monitored, intent: intent(LIQUOR_WALLET, "ALCOHOL"), payerWalletAddressUrl: PAYER_WALLET }, deps);
  await purchaseUnderMandate(
    { mandate: monitored, intent: intent(LIQUOR_WALLET, "ALCOHOL", { delegateId: "someone-else" }), payerWalletAddressUrl: PAYER_WALLET },
    deps,
  );

  const report = await buildSpendingReport(monitored, spending);
  assert.equal(report.enforcement, "MONITORED");
  assert.deepEqual(report.totals, {
    paid: { value: "2240", assetCode: "USD", assetScale: 2 },
    attempts: 3,
    paidCount: 2,
    notPaidCount: 1,
    monitoredExceptions: 1,
    paidOutsidePurpose: 1,
  });
  assert.equal(report.entries.length, 3);
  assert.equal(JSON.stringify(report).includes("Item"), false, "line-item descriptions are not in the report");
});

test("with the real adapter: ENFORCED liquor never reaches outgoingPayment.create; MONITORED reaches it once", async () => {
  for (const [enforcement, expectedCreates] of [["ENFORCED", 0], ["MONITORED", 1]] as const) {
    const fake = createFakeSdk();
    const gateway = new InterledgerOpenPaymentsGateway({
      sdk: fake.sdk,
      grants: new InMemoryGrantStore(),
      finishUri: "http://localhost:4000/open-payments/finish",
      createNonce: () => "NONCE",
      // The fake SDK's quote expires at 12:05 on the demo day.
      now: () => new Date("2026-10-16T12:00:00Z"),
    });
    await gateway.startPayerGrant({
      grantKey: "demo-mandate-medication",
      payerWalletAddressUrl: PAYER.id,
      debitLimit: { value: "4000", assetCode: "USD", assetScale: 2 },
    });
    await gateway.finishPayerGrant({
      grantKey: "demo-mandate-medication",
      interactRef: "REF",
      hash: computeInteractionHash({
        clientNonce: "NONCE",
        finishNonce: PAYER_CONSENT.finishNonce,
        interactRef: "REF",
        grantEndpoint: PAYER.authServer,
      }),
    });

    // The fake SDK's merchant wallet plays a liquor store here.
    const liquorAtMerchant = resolution(MERCHANT.id, [["ALCOHOL", "PROVIDER_VERIFIED"]]);
    const result = await purchaseUnderMandate(
      {
        mandate: mandate(enforcement),
        intent: intent(MERCHANT.id, "ALCOHOL"),
        payerWalletAddressUrl: PAYER.id,
      },
      {
        merchants: stubRegistry({ [MERCHANT.id]: liquorAtMerchant }),
        payments: gateway,
        spending: new InMemorySpendingLog(),
        history: historyDeps(),
        now: () => NOW,
      },
    );

    assert.equal(fake.callsTo("outgoingPayment.create").length, expectedCreates, enforcement);
    assert.equal(result.decision.outcome, enforcement === "ENFORCED" ? "DENY" : "ALLOW");
  }
});

test("with a mandate repository, an ALLOW reserves the quoted debit before it is recorded", async () => {
  const { op, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  await mandates.save(mandate("ENFORCED"));
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    { ...deps, capacity: mandates },
  );
  assert.equal(result.decision.outcome, "ALLOW");
  assert.equal(op.calls.outgoing.length, 1);
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "2880");
});

test("when another purchase used the capacity first, the ALLOW becomes DENY BUDGET_EXCEEDED and nothing is paid", async () => {
  const { op, spending, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  // The caller's copy still says 4000, the repository only has 1000 left.
  await mandates.save(mandate("ENFORCED", { remainingAuthorizedAmount: { value: "1000", assetCode: "USD", assetScale: 2 } }));
  const result = await purchaseUnderMandate(
    { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
    { ...deps, capacity: mandates },
  );
  assert.equal(result.decision.outcome, "DENY");
  assert.deepEqual(result.decision.reasons.map((r) => r.code), ["BUDGET_EXCEEDED"]);
  assert.equal(op.calls.outgoing.length, 0);
  assert.equal((await spending.listByMandate("demo-mandate-medication"))[0].decision.outcome, "DENY");
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "1000");
});

test("if creating the outgoing payment throws, the reservation is given back", async () => {
  const { op, deps } = setup();
  const mandates = new InMemoryMandateRepository();
  await mandates.save(mandate("ENFORCED"));
  const failing = {
    ...op.payments,
    async createOutgoingPayment(): Promise<never> {
      throw new Error("wallet unavailable");
    },
  };
  await assert.rejects(
    purchaseUnderMandate(
      { mandate: mandate("ENFORCED"), intent: intent(PHARMACY_WALLET, "MEDICATION"), payerWalletAddressUrl: PAYER_WALLET },
      { ...deps, payments: failing, capacity: mandates },
    ),
    /wallet unavailable/,
  );
  assert.equal((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount.value, "4000");
});
