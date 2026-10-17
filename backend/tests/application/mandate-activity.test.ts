import assert from "node:assert/strict";
import test from "node:test";
import { buildMandateActivity, classifyAttempt } from "../../src/application/mandate-activity.ts";
import { buildSpendingReport } from "../../src/application/spending-report.ts";
import { InMemorySpendingLog } from "../../src/integrations/spending/in-memory-spending-log.ts";
import { mandate } from "./purchase-test-kit.ts";
import { spendingRecord } from "./mandate-test-kit.ts";

const MANDATE = mandate("MONITORED", { id: "mandate-test-1" });
const USD = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });

test("each attempt is classified by decision and payment state", () => {
  assert.equal(classifyAttempt(spendingRecord({})), "COMPLETED");
  assert.equal(
    classifyAttempt(spendingRecord({ openPayments: { outgoingPaymentUrl: "https://op/1", state: "PENDING" } })),
    "PENDING",
  );
  assert.equal(
    classifyAttempt(spendingRecord({ openPayments: { outgoingPaymentUrl: "https://op/1", state: "FAILED" } })),
    "FAILED",
  );
  assert.equal(classifyAttempt(spendingRecord({ openPayments: {} })), "FAILED", "ALLOW without a payment did not pay");
  assert.equal(
    classifyAttempt(spendingRecord({ decision: { outcome: "DENY", reasons: [] }, openPayments: {} })),
    "DENIED",
  );
  assert.equal(
    classifyAttempt(spendingRecord({ decision: { outcome: "REVIEW", reasons: [] }, openPayments: {} })),
    "REVIEW",
  );
});

test("pending payments are never counted as completed, and failed ones count as nothing", () => {
  const records = [
    spendingRecord({ id: "completed", debitAmount: USD("1120") }),
    spendingRecord({
      id: "pending",
      debitAmount: USD("800"),
      openPayments: { outgoingPaymentUrl: "https://op/2", state: "PENDING" },
    }),
    spendingRecord({
      id: "failed",
      debitAmount: USD("500"),
      openPayments: { outgoingPaymentUrl: "https://op/3", state: "FAILED" },
    }),
    spendingRecord({
      id: "denied",
      decision: { outcome: "DENY", reasons: [{ code: "MERCHANT_NOT_ELIGIBLE", message: "x" }] },
      openPayments: {},
    }),
  ];
  const { totals } = buildMandateActivity(MANDATE, records);
  assert.deepEqual(totals.completed, USD("1120"));
  assert.deepEqual(totals.inProgress, USD("800"));
  assert.equal(totals.completedCount, 1);
  assert.equal(totals.inProgressCount, 1);
  assert.equal(totals.failedCount, 1);
  assert.equal(totals.deniedCount, 1);
  assert.equal(totals.attempts, 4);
});

test("the existing spending report counts the pending payment as paid; the activity view does not", async () => {
  const log = new InMemorySpendingLog();
  await log.append(spendingRecord({ id: "completed", debitAmount: USD("1120") }));
  await log.append(
    spendingRecord({
      id: "pending",
      debitAmount: USD("800"),
      openPayments: { outgoingPaymentUrl: "https://op/2", state: "PENDING" },
    }),
  );
  const report = await buildSpendingReport(MANDATE, log);
  assert.deepEqual(report.totals.paid, USD("1920"), "documents the report's behavior this view avoids");
  const activity = buildMandateActivity(MANDATE, await log.listByMandate(MANDATE.id));
  assert.deepEqual(activity.totals.completed, USD("1120"));
});

test("the activity says when the mandate's capacity does not yet account for recorded debits", () => {
  const records = [spendingRecord({ debitAmount: USD("1120") })];
  const untouched = buildMandateActivity(MANDATE, records);
  assert.equal(untouched.totals.capacityReconciled, false, "remaining is still the full budget");
  const reduced = buildMandateActivity(
    { ...MANDATE, remainingAuthorizedAmount: USD("2880") },
    records,
  );
  assert.equal(reduced.totals.capacityReconciled, true);
  assert.equal(buildMandateActivity(MANDATE, []).totals.capacityReconciled, true, "nothing spent, nothing to reconcile");
});

test("debits in another asset are left out of the totals and counted apart", () => {
  const { totals } = buildMandateActivity(MANDATE, [
    spendingRecord({ debitAmount: { value: "1000", assetCode: "EUR", assetScale: 2 } }),
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
    spendingRecord({ id: "b", ...exception, openPayments: { outgoingPaymentUrl: "https://op/2", state: "PENDING" } }),
  ]);
  assert.equal(activity.totals.monitoredExceptions, 1);
  const completed = activity.entries.find((entry) => entry.id === "a");
  assert.equal(completed?.monitoredException, true);
  assert.equal(completed?.purposeMatched, false);
  assert.deepEqual(completed?.reasonCodes, ["MERCHANT_NOT_ELIGIBLE", "PAYER_MONITORED_EXCEPTION"]);
});

test("entries are newest first and carry no line items, wallet URLs or Open Payments references", () => {
  const activity = buildMandateActivity(MANDATE, [
    spendingRecord({ id: "old", recordedAt: "2026-10-16T10:00:00.000Z" }),
    spendingRecord({ id: "new", recordedAt: "2026-10-16T12:00:00.000Z" }),
    spendingRecord({ id: "other-mandate", mandateId: "mandate-other" }),
  ]);
  assert.deepEqual(activity.entries.map((entry) => entry.id), ["new", "old"]);
  const payload = JSON.stringify(activity);
  for (const leak of ["https://", "lineItems", "description", "quoteId"]) {
    assert.equal(payload.includes(leak), false, `leaked ${leak}`);
  }
});
