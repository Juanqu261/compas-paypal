import assert from "node:assert/strict";
import test from "node:test";
import type { CompasCategory } from "../../src/domain/merchant-category.ts";
import type { MerchantObservation, PurchaseVerdict } from "../../src/domain/merchant-history.ts";
import { gradeMerchantHistory, summarizeMerchantHistory } from "../../src/policy/merchant-history.ts";
import { NOW, summary, TRUST_MATRIX } from "../application/purchase-test-kit.ts";

const SHOP = "TESTSTALL2222";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

let records = 0;

/** One paid purchase at the shop, with the payer's verdict when given. */
function purchase(options: {
  payer: string;
  daysAgo: number;
  verdict?: PurchaseVerdict;
  verdictBy?: string;
  lines?: CompasCategory[];
  mandate?: CompasCategory[];
  shop?: string;
}): MerchantObservation[] {
  const id = `record-${++records}`;
  const shop = options.shop ?? SHOP;
  const observations: MerchantObservation[] = [{
    type: "PAID",
    id: `${id}:paid`,
    spendingRecordId: id,
    paypalMerchantId: shop,
    payerRef: options.payer,
    delegateRef: `delegate-of-${options.payer}`,
    mandateCategories: options.mandate ?? ["MEDICATION"],
    lineCategories: options.lines ?? ["MEDICATION"],
    hasUncategorizedLines: false,
    enforcement: "MONITORED",
    paymentState: "COMPLETED",
    observedAt: daysAgo(options.daysAgo),
  }];
  if (options.verdict) {
    observations.push({
      type: "PAYER_VERDICT",
      id: `${id}:verdict`,
      spendingRecordId: id,
      paypalMerchantId: shop,
      payerRef: options.verdictBy ?? options.payer,
      verdict: options.verdict,
      observedAt: daysAgo(options.daysAgo - 1),
    });
  }
  return observations;
}

function summarize(observations: MerchantObservation[], category: CompasCategory = "MEDICATION") {
  return summarizeMerchantHistory({ observations, paypalMerchantId: SHOP, category, asOf: NOW, matrix: TRUST_MATRIX });
}

const grade = (observations: MerchantObservation[]) => gradeMerchantHistory(summarize(observations), TRUST_MATRIX);

test("counting is by distinct payer: ten confirmations from one payer count once", () => {
  const observations = Array.from({ length: 10 }, (_, day) => purchase({ payer: "p1", daysAgo: 30 + day, verdict: "MATCH" })).flat();
  const result = summarize(observations);
  assert.equal(result.paidPurchases, 10);
  assert.equal(result.confirmingPayers, 1);
  assert.equal(grade(observations), "NONE");
});

test("the merchant's own line labels never raise history: no verdict, no confirmation", () => {
  const observations = ["p1", "p2", "p3", "p4"].flatMap((payer) => purchase({ payer, daysAgo: 30 }));
  assert.equal(summarize(observations).confirmingPayers, 0);
  assert.equal(grade(observations), "NONE");
});

test("a verdict from someone other than the purchase's payer is ignored", () => {
  const observations = purchase({ payer: "p1", daysAgo: 30, verdict: "MATCH", verdictBy: "intruder" });
  assert.equal(summarize(observations).confirmingPayers, 0);
});

test("a line the merchant labeled with an incompatible category contradicts, even when the payer confirmed", () => {
  const observations = purchase({ payer: "p1", daysAgo: 30, verdict: "MATCH", lines: ["MEDICATION", "ALCOHOL"] });
  const result = summarize(observations);
  assert.deepEqual([result.confirmingPayers, result.contradictions, result.contradictingPayers], [0, 1, 1]);
});

test("a compatible extra line, such as PERSONAL_CARE at a pharmacy, does not contradict", () => {
  const observations = purchase({ payer: "p1", daysAgo: 30, verdict: "MATCH", lines: ["MEDICATION", "PERSONAL_CARE"] });
  assert.equal(summarize(observations).confirmingPayers, 1);
});

test("only purchases made for the category count", () => {
  const observations = ["p1", "p2", "p3"].flatMap((payer) =>
    purchase({ payer, daysAgo: 30, verdict: "MATCH", mandate: ["FOOD"], lines: ["FOOD"] }),
  );
  assert.equal(summarize(observations, "MEDICATION").paidPurchases, 0);
  assert.equal(summarize(observations, "FOOD").confirmingPayers, 3);
});

test("purchases outside the window, after asOf, or at another shop are ignored", () => {
  const observations = [
    ...purchase({ payer: "old", daysAgo: 180, verdict: "MATCH" }),
    ...purchase({ payer: "inside", daysAgo: 179, verdict: "MATCH" }),
    ...purchase({ payer: "future", daysAgo: -2, verdict: "MATCH" }),
    ...purchase({ payer: "elsewhere", daysAgo: 30, verdict: "MATCH", shop: "TESTELSEWHERE" }),
  ];
  const result = summarize(observations);
  assert.deepEqual([result.paidPurchases, result.confirmingPayers], [1, 1]);
  assert.equal(result.firstConfirmedAt, daysAgo(179));
});

test("EMERGING needs 3 distinct payers and 14 days since the first confirmed purchase", () => {
  const three = (firstDaysAgo: number) =>
    ["p1", "p2", "p3"].flatMap((payer, index) => purchase({ payer, daysAgo: firstDaysAgo - index, verdict: "MATCH" }));
  assert.equal(grade(three(14)), "EMERGING");
  assert.equal(grade(three(13)), "NONE", "13 days is not enough");
  assert.equal(grade(three(14).slice(0, 4)), "NONE", "2 payers are not enough");
});

test("ESTABLISHED needs 10 distinct payers and 60 days", () => {
  const ten = (firstDaysAgo: number) =>
    Array.from({ length: 10 }, (_, index) => purchase({ payer: `p${index}`, daysAgo: firstDaysAgo - index, verdict: "MATCH" })).flat();
  assert.equal(grade(ten(60)), "ESTABLISHED");
  assert.equal(grade(ten(59)), "EMERGING");
});

test("CONTRADICTED needs 2 distinct payers and at least 20% of paid purchases", () => {
  const confirmed = (count: number) =>
    Array.from({ length: count }, (_, index) => purchase({ payer: `ok${index}`, daysAgo: 70 - index, verdict: "MATCH" })).flat();
  const mismatches = ["bad1", "bad2"].flatMap((payer) => purchase({ payer, daysAgo: 20, verdict: "MISMATCH" }));

  assert.equal(grade([...confirmed(8), ...mismatches]), "CONTRADICTED", "2 of 10 is exactly 20%");
  assert.equal(grade([...confirmed(10), ...mismatches]), "ESTABLISHED", "2 of 12 is under 20%");
  assert.equal(grade(purchase({ payer: "bad1", daysAgo: 20, verdict: "MISMATCH" })), "NONE", "one payer cannot contradict a shop");
});

test("grading with another matrix version is refused", () => {
  assert.throws(() => gradeMerchantHistory(summary(SHOP, "MEDICATION", { matrixVersion: "other" }), TRUST_MATRIX));
});
