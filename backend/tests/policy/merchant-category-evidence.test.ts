import assert from "node:assert/strict";
import test from "node:test";
import type {
  MerchantCategoryResolution,
  ResolvedCategory,
} from "../../src/domain/merchant-category.ts";
import { evaluateMerchantCategoryEvidence } from "../../src/policy/merchant-category-evidence.ts";

const policy = {
  eligibleCategories: ["MEDICATION"] as const,
  acceptedTrustLevels: ["PROVIDER_VERIFIED", "EXTERNAL_VERIFIED"] as const,
};

function resolution(overrides: Partial<MerchantCategoryResolution> = {}): MerchantCategoryResolution {
  return {
    walletAddressUrl: "https://wallet.example/m",
    categories: [],
    conflicts: [],
    flags: [],
    unmappedEvidence: [],
    mappingVersion: "test",
    resolvedAt: "2026-10-16T15:00:00Z",
    ...overrides,
  };
}

function resolved(category: ResolvedCategory["category"], trustLevel: ResolvedCategory["trustLevel"]): ResolvedCategory {
  return { category, trustLevel, supportingEntryIds: ["e"], sourceIds: ["s"] };
}

test("an eligible category at an accepted level passes, and PASS is not ALLOW", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({ categories: [resolved("MEDICATION", "PROVIDER_VERIFIED"), resolved("PERSONAL_CARE", "PROVIDER_VERIFIED")] }),
    policy,
  );
  assert.deepEqual(result, { result: "PASS", matchedCategories: ["MEDICATION"] });
});

test("only self-declared evidence for an eligible category is REVIEW", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({ categories: [resolved("MEDICATION", "SELF_DECLARED")] }),
    policy,
  );
  assert.equal(result.result, "REVIEW");
  assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_EVIDENCE_INSUFFICIENT");
});

test("no eligible category is DENY", () => {
  for (const categories of [[], [resolved("ALCOHOL", "EXTERNAL_VERIFIED"), resolved("TOBACCO", "EXTERNAL_VERIFIED")]]) {
    const result = evaluateMerchantCategoryEvidence(resolution({ categories }), policy);
    assert.equal(result.result, "DENY");
    assert.equal(result.result === "DENY" && result.reason.code, "MERCHANT_NOT_ELIGIBLE");
  }
});

test("a conflict touching an eligible category is REVIEW, even with verified evidence", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({
      categories: [resolved("MEDICATION", "EXTERNAL_VERIFIED")],
      conflicts: [{ categories: ["MEDICATION", "ALCOHOL"], entryIds: ["a", "b"] }],
    }),
    policy,
  );
  assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_EVIDENCE_CONFLICT");
});

test("a flag on an eligible category is REVIEW", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({
      categories: [resolved("MEDICATION", "PROVIDER_VERIFIED")],
      flags: [{ entryId: "f", category: "MEDICATION" }],
    }),
    policy,
  );
  assert.equal(result.result === "REVIEW" && result.reason.code, "MERCHANT_EVIDENCE_CONFLICT");
});

test("a conflict that touches no eligible category does not block", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({
      categories: [resolved("MEDICATION", "PROVIDER_VERIFIED")],
      conflicts: [{ categories: ["ALCOHOL", "FOOD"], entryIds: ["a", "b"] }],
    }),
    policy,
  );
  assert.equal(result.result, "PASS");
});

test("a mandate that accepts no trust level never passes", () => {
  const result = evaluateMerchantCategoryEvidence(
    resolution({ categories: [resolved("MEDICATION", "EXTERNAL_VERIFIED")] }),
    { eligibleCategories: ["MEDICATION"], acceptedTrustLevels: [] },
  );
  assert.equal(result.result, "REVIEW");
});
