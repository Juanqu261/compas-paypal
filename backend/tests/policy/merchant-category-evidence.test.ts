import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantConfidencePolicy } from "../../src/domain/mandate.ts";
import type { MerchantCategoryResolution } from "../../src/domain/merchant-category.ts";
import type { MerchantHistorySummary } from "../../src/domain/merchant-history.ts";
import {
  categoriesNeedingHistory,
  evaluateMerchantCategoryEvidence,
  type MerchantHistoryInput,
} from "../../src/policy/merchant-category-evidence.ts";
import {
  noHistory,
  NOW,
  resolution,
  summary,
  TRUST_MATRIX,
} from "../application/purchase-test-kit.ts";

const WALLET = "TESTMERCHANTM";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

function policy(minimum: MerchantConfidencePolicy["minimum"] = "HIGH") {
  return { eligibleCategories: ["MEDICATION"] as const, merchantConfidence: { minimum } };
}

function withHistory(
  merchant: MerchantCategoryResolution,
  counts: Partial<MerchantHistorySummary>,
): MerchantHistoryInput {
  return {
    matrix: TRUST_MATRIX,
    summaries: merchant.declarations.map((declared) => summary(merchant.paypalMerchantId, declared.category, counts)),
  };
}

const ESTABLISHED = { confirmingPayers: 10, paidPurchases: 10, firstConfirmedAt: daysAgo(60) };
const EMERGING = { confirmingPayers: 3, paidPurchases: 3, firstConfirmedAt: daysAgo(14) };
const CONTRADICTED = { paidPurchases: 5, contradictions: 1, contradictingPayers: 2 };

test("a declared category corroborated by wallet KYB is HIGH and passes; PASS is not ALLOW", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "PROVIDER_VERIFIED"], ["PERSONAL_CARE", "PROVIDER_VERIFIED"]]);
  const result = evaluateMerchantCategoryEvidence(merchant, policy(), noHistory(merchant));
  assert.equal(result.result, "PASS");
  assert.deepEqual(result.result === "PASS" && result.matchedCategories, ["MEDICATION"]);
  assert.deepEqual(result.result === "PASS" && [result.confidence.corroboration, result.confidence.historyGrade, result.confidence.confidence], [
    "PROVIDER_VERIFIED",
    "NONE",
    "HIGH",
  ]);
});

test("a self-declared category with no history is LOW: REVIEW for a HIGH mandate, PASS for a LOW one", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"]]);
  const strict = evaluateMerchantCategoryEvidence(merchant, policy("HIGH"), noHistory(merchant));
  assert.equal(strict.result === "REVIEW" && strict.reason.code, "MERCHANT_EVIDENCE_INSUFFICIENT");
  assert.equal(strict.result === "REVIEW" && strict.confidence?.confidence, "LOW");

  const relaxed = evaluateMerchantCategoryEvidence(merchant, policy("LOW"), noHistory(merchant));
  assert.equal(relaxed.result, "PASS");
});

test("history lifts a self-declared tienda to MEDIUM at most, never to HIGH", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"]]);
  const established = evaluateMerchantCategoryEvidence(merchant, policy("MEDIUM"), withHistory(merchant, ESTABLISHED));
  assert.equal(established.result, "PASS");
  assert.equal(established.result === "PASS" && established.confidence.confidence, "MEDIUM");

  const forHigh = evaluateMerchantCategoryEvidence(merchant, policy("HIGH"), withHistory(merchant, ESTABLISHED));
  assert.equal(forHigh.result === "REVIEW" && forHigh.reason.code, "MERCHANT_EVIDENCE_INSUFFICIENT");

  const emerging = evaluateMerchantCategoryEvidence(merchant, policy("MEDIUM"), withHistory(merchant, EMERGING));
  assert.equal(emerging.result === "REVIEW" && emerging.confidence?.confidence, "LOW", "self-declared + EMERGING stays LOW");
});

test("a Cámara match through a self-typed NIT plus emerging history is MEDIUM", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"]], [["MEDICATION", "REGISTRY_UNBOUND"]]);
  const result = evaluateMerchantCategoryEvidence(merchant, policy("MEDIUM"), withHistory(merchant, EMERGING));
  assert.equal(result.result === "PASS" && result.confidence.confidence, "MEDIUM");
});

test("contradicting history is REVIEW even for a KYB-verified merchant", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]);
  const result = evaluateMerchantCategoryEvidence(merchant, policy("LOW"), withHistory(merchant, CONTRADICTED));
  assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_HISTORY_CONTRADICTS");
  assert.equal(result.result === "REVIEW" && result.confidence?.confidence, "CONTESTED");
});

test("independent evidence that contradicts the declaration is REVIEW, MERCHANT_EVIDENCE_CONFLICT", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"], ["ALCOHOL", "PROVIDER_VERIFIED"]], [["MEDICATION", "CONTRADICTED"]]);
  const result = evaluateMerchantCategoryEvidence(merchant, policy("LOW"), withHistory(merchant, ESTABLISHED));
  assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_EVIDENCE_CONFLICT");
});

test("evidence for a category the merchant never declared does not make it eligible", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "EXTERNAL_VERIFIED"]], []);
  const result = evaluateMerchantCategoryEvidence(merchant, policy("LOW"), noHistory(merchant));
  assert.equal(result.result === "DENY" && result.reason.code, "MERCHANT_NOT_ELIGIBLE");
  assert.deepEqual(categoriesNeedingHistory(merchant, policy()), []);
});

test("no eligible declared category is DENY", () => {
  for (const merchant of [
    resolution(WALLET, []),
    resolution(WALLET, [["ALCOHOL", "EXTERNAL_VERIFIED"], ["TOBACCO", "EXTERNAL_VERIFIED"]]),
  ]) {
    const result = evaluateMerchantCategoryEvidence(merchant, policy(), noHistory(merchant));
    assert.equal(result.result === "DENY" && result.reason.code, "MERCHANT_NOT_ELIGIBLE");
  }
});

test("a conflict or flag touching an eligible category is REVIEW, even with verified evidence", () => {
  const conflicted = {
    ...resolution(WALLET, [["MEDICATION", "EXTERNAL_VERIFIED"]]),
    conflicts: [{ categories: ["MEDICATION", "ALCOHOL"] as const, entryIds: ["a", "b"] }],
  };
  const flagged = {
    ...resolution(WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]),
    flags: [{ entryId: "f", category: "MEDICATION" as const }],
  };
  for (const merchant of [conflicted, flagged]) {
    const result = evaluateMerchantCategoryEvidence(merchant, policy(), noHistory(merchant));
    assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_EVIDENCE_CONFLICT");
  }
});

test("a conflict that touches no eligible category does not block", () => {
  const merchant = {
    ...resolution(WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]),
    conflicts: [{ categories: ["ALCOHOL", "FOOD"] as const, entryIds: ["a", "b"] }],
  };
  assert.equal(evaluateMerchantCategoryEvidence(merchant, policy(), noHistory(merchant)).result, "PASS");
});

test("the best of several eligible categories decides, ties broken by category order", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"], ["PERSONAL_CARE", "PROVIDER_VERIFIED"]]);
  const both = { eligibleCategories: ["MEDICATION", "PERSONAL_CARE"] as const, merchantConfidence: { minimum: "MEDIUM" as const } };
  const result = evaluateMerchantCategoryEvidence(merchant, both, noHistory(merchant));
  assert.equal(result.result === "PASS" && result.confidence.category, "PERSONAL_CARE");
  assert.deepEqual(result.result === "PASS" && result.matchedCategories, ["PERSONAL_CARE"]);
});

test("a missing history summary is a programming error, not a silent NONE", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]);
  assert.throws(() => evaluateMerchantCategoryEvidence(merchant, policy(), { matrix: TRUST_MATRIX, summaries: [] }));
});

test("a stored confidence record replays to the same cell", () => {
  const merchant = resolution(WALLET, [["MEDICATION", "SELF_DECLARED"]], [["MEDICATION", "REGISTRY_UNBOUND"]]);
  const first = evaluateMerchantCategoryEvidence(merchant, policy("MEDIUM"), withHistory(merchant, EMERGING));
  assert.equal(first.result, "PASS");
  const stored = JSON.parse(JSON.stringify(first.result === "PASS" && first.confidence));
  const replayed = evaluateMerchantCategoryEvidence(merchant, policy("MEDIUM"), { matrix: TRUST_MATRIX, summaries: [stored.history] });
  assert.deepEqual(replayed.result === "PASS" && replayed.confidence, stored);
});
