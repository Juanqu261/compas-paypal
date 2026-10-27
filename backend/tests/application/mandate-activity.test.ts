import assert from "node:assert/strict";
import test from "node:test";
import { buildMandateActivity, classifyAttempt } from "../../src/application/mandate-activity.ts";
import { buildSpendingReport } from "../../src/application/spending-report.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { mandate } from "./purchase-test-kit.ts";
import { spendingRecord } from "./mandate-test-kit.ts";

const MANDATE = mandate("MONITORED", { id: "mandate-test-1" });
const USD = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
const APPROVAL_URL = "https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER00000002";
const awaiting = { orderId: "TESTORDER00000002", approvalUrl: APPROVAL_URL, state: "AWAITING_PAYER_APPROVAL" as const };

test("each attempt is classified by decision and PayPal state", () => {
  assert.equal(classifyAttempt(spendingRecord({})), "COMPLETED");
  assert.equal(classifyAttempt(spendingRecord({ paypal: { orderId: "O1", state: "PENDING" } })), "PENDING");
  assert.equal(classifyAttempt(spendingRecord({ paypal: awaiting })), "AWAITING_APPROVAL");
  assert.equal(classifyAttempt(spendingRecord({ paypal: { orderId: "O1", state: "CANCELLED" } })), "CANCELLED");
  assert.equal(
    classifyAttempt(spendingRecord({ paypal: { orderId: "O1", state: "FAILED", failureCode: "CAPTURE_DECLINED" } })),
    "FAILED",
  );
  assert.equal(classifyAttempt(spendingRecord({ paypal: {} })), "FAILED", "ALLOW without a PayPal order did not pay");
  assert.equal(classifyAttempt(spendingRecord({ decision: { outcome: "DENY", reasons: [] }, paypal: {} })), "DENIED");
  assert.equal(classifyAttempt(spendingRecord({ decision: { outcome: "REVIEW", reasons: [] }, paypal: {} })), "REVIEW");
});

test("only captures count as completed; waiting and pending charges are in progress; the rest count as nothing", () => {
  const records = [
    spendingRecord({ id: "completed" }),
    spendingRecord({ id: "pending", requestedAmount: USD("800"), paypal: { orderId: "O2", state: "PENDING" } }),
    spendingRecord({ id: "awaiting", requestedAmount: USD("300"), paypal: awaiting }),
    spendingRecord({ id: "cancelled", requestedAmount: USD("200"), paypal: { orderId: "O4", state: "CANCELLED" } }),
    spendingRecord({ id: "failed", requestedAmount: USD("500"), paypal: { orderId: "O5", state: "FAILED", failureCode: "ORDER_EXPIRED" } }),
    spendingRecord({
      id: "denied",
      decision: { outcome: "DENY", reasons: [{ code: "MERCHANT_NOT_ELIGIBLE", message: "x" }] },
      paypal: {},
    }),
  ];
  const { totals, entries } = buildMandateActivity(MANDATE, records);
  assert.deepEqual(totals.completed, USD("1120"));
  assert.deepEqual(totals.inProgress, USD("1100"));
  assert.deepEqual(
    [totals.completedCount, totals.inProgressCount, totals.awaitingApprovalCount, totals.cancelledCount, totals.failedCount, totals.deniedCount],
    [1, 1, 1, 1, 1, 1],
  );
  assert.equal(totals.attempts, 6);
  assert.equal(entries.find((entry) => entry.id === "failed")?.failureCode, "ORDER_EXPIRED");
});

test("the approval link is in the payer's view only, and only while the mandate can still pay", () => {
  const records = [spendingRecord({ id: "awaiting", paypal: awaiting })];
  assert.equal(buildMandateActivity(MANDATE, records).entries[0].approvalUrl, undefined, "the default view has none");
  assert.equal(
    buildMandateActivity(MANDATE, records, { approvalLinks: true, mandateUsable: true }).entries[0].approvalUrl,
    APPROVAL_URL,
  );
  assert.equal(
    buildMandateActivity(MANDATE, records, { approvalLinks: true, mandateUsable: false }).entries[0].approvalUrl,
    undefined,
  );
  assert.equal(
    buildMandateActivity(MANDATE, [spendingRecord({ id: "done" })], { approvalLinks: true, mandateUsable: true }).entries[0].approvalUrl,
    undefined,
    "a captured order has nothing left to approve",
  );
});

test("the spending report counts a pending capture as paid; the activity view keeps it in progress", async () => {
  const log = new InMemorySpendingLog();
  await log.append(spendingRecord({ id: "completed" }));
  await log.append(spendingRecord({ id: "pending", requestedAmount: USD("800"), paypal: { orderId: "O2", state: "PENDING" } }));
  await log.append(spendingRecord({ id: "awaiting", requestedAmount: USD("300"), paypal: awaiting }));
  const report = await buildSpendingReport(MANDATE, log);
  assert.deepEqual(report.totals.paid, USD("1920"), "an order waiting for the payer is not paid");
  const activity = buildMandateActivity(MANDATE, await log.listByMandate(MANDATE.id));
  assert.deepEqual(activity.totals.completed, USD("1120"));
});

test("the activity says when the mandate's capacity does not yet account for recorded charges", () => {
  const records = [spendingRecord({})];
  const untouched = buildMandateActivity(MANDATE, records);
  assert.equal(untouched.totals.capacityReconciled, false, "remaining is still the full budget");
  const reduced = buildMandateActivity({ ...MANDATE, remainingAuthorizedAmount: USD("2880") }, records);
  assert.equal(reduced.totals.capacityReconciled, true);
  assert.equal(buildMandateActivity(MANDATE, []).totals.capacityReconciled, true, "nothing spent, nothing to reconcile");
});

test("charges in another asset are left out of the totals and counted apart", () => {
  const { totals } = buildMandateActivity(MANDATE, [
    spendingRecord({ requestedAmount: { value: "1000", assetCode: "EUR", assetScale: 2 } }),
  ]);
  assert.deepEqual(totals.completed, USD("0"));
  assert.equal(totals.excludedOtherAsset, 1);
});

test("a monitored exception is flagged and counted only when it completed", () => {
  const exception = {
    decision: {
      outcome: "ALLOW" as const,
      reasons: [
        { code: "MERCHANT_NOT_ELIGIBLE" as const, message: "x" },
        { code: "PAYER_MONITORED_EXCEPTION" as const, message: "y" },
      ],
    },
    purposeCheck: { outcome: "DENY" as const, reasons: [], matchedCategories: [], enforced: false },
    monitoredException: true,
  };
  const activity = buildMandateActivity(MANDATE, [
    spendingRecord({ id: "a", ...exception }),
    spendingRecord({ id: "b", ...exception, paypal: awaiting }),
  ]);
  assert.equal(activity.totals.monitoredExceptions, 1);
  const completed = activity.entries.find((entry) => entry.id === "a");
  assert.equal(completed?.monitoredException, true);
  assert.equal(completed?.purposeMatched, false);
  assert.deepEqual(completed?.reasonCodes, ["MERCHANT_NOT_ELIGIBLE", "PAYER_MONITORED_EXCEPTION"]);
});

test("entries are newest first and carry no line items, PayPal ids or captures", () => {
  const activity = buildMandateActivity(MANDATE, [
    spendingRecord({ id: "old", recordedAt: "2026-10-16T10:00:00.000Z" }),
    spendingRecord({ id: "new", recordedAt: "2026-10-16T12:00:00.000Z" }),
    spendingRecord({ id: "other-mandate", mandateId: "mandate-other" }),
  ]);
  assert.deepEqual(activity.entries.map((entry) => entry.id), ["new", "old"]);
  const payload = JSON.stringify(activity);
  for (const leak of ["https://", "lineItems", "description", "TESTORDER", "TESTCAPTURE", "TESTPHARMACY2"]) {
    assert.equal(payload.includes(leak), false, `leaked ${leak}`);
  }
});
