import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePurchase } from "../../src/policy/evaluate-purchase.ts";
import {
  intent,
  LIQUOR_WALLET,
  mandate,
  NOW,
  PHARMACY_WALLET,
  resolution,
} from "../application/purchase-test-kit.ts";

const debit = { value: "1120", assetCode: "USD", assetScale: 2 };
const pharmacy = resolution(PHARMACY_WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]);
const liquor = resolution(LIQUOR_WALLET, [["ALCOHOL", "PROVIDER_VERIFIED"], ["TOBACCO", "PROVIDER_VERIFIED"]]);
const selfDeclaredPharmacy = resolution(PHARMACY_WALLET, [["MEDICATION", "SELF_DECLARED"]]);

function evaluate(
  enforcement: "ENFORCED" | "MONITORED",
  merchantResolution = pharmacy,
  /** null: a line item without a category. */
  lineCategory: string | null = "MEDICATION",
  overrides: { mandate?: Parameters<typeof mandate>[1]; intent?: Parameters<typeof intent>[2]; debit?: typeof debit } = {},
) {
  return evaluatePurchase({
    decisionId: "d-1",
    mandate: mandate(enforcement, overrides.mandate),
    intent: intent(merchantResolution.walletAddressUrl, lineCategory ?? undefined, overrides.intent),
    debitAmount: overrides.debit ?? debit,
    merchantResolution,
    now: NOW,
  });
}

const codes = (decision: ReturnType<typeof evaluate>) => decision.reasons.map((reason) => reason.code);

test("ENFORCED: a verified pharmacy selling medication is ALLOW", () => {
  const decision = evaluate("ENFORCED");
  assert.equal(decision.outcome, "ALLOW");
  assert.deepEqual(decision.reasons, []);
  assert.deepEqual(decision.purposeCheck, {
    outcome: "ALLOW",
    reasons: [],
    matchedCategories: ["MEDICATION"],
    enforced: true,
  });
});

test("ENFORCED: alcohol at a liquor store is DENY for both the merchant and the line", () => {
  const decision = evaluate("ENFORCED", liquor, "ALCOHOL");
  assert.equal(decision.outcome, "DENY");
  assert.deepEqual(codes(decision), ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH"]);
});

test("ENFORCED: weak evidence or an uncategorized line is REVIEW", () => {
  assert.equal(evaluate("ENFORCED", selfDeclaredPharmacy).outcome, "REVIEW");
  const uncategorized = evaluate("ENFORCED", pharmacy, null);
  assert.equal(uncategorized.outcome, "REVIEW");
  assert.deepEqual(codes(uncategorized), ["CLASSIFICATION_UNCERTAIN"]);
});

test("MONITORED: the same alcohol purchase is ALLOW, and the failed purpose check stays visible", () => {
  const decision = evaluate("MONITORED", liquor, "ALCOHOL");
  assert.equal(decision.outcome, "ALLOW");
  assert.deepEqual(codes(decision), ["MERCHANT_NOT_ELIGIBLE", "PURPOSE_MISMATCH", "PAYER_MONITORED_EXCEPTION"]);
  assert.equal(decision.purposeCheck?.outcome, "DENY");
  assert.equal(decision.purposeCheck?.enforced, false);
  assert.deepEqual(decision.purposeCheck?.matchedCategories, []);
});

test("MONITORED: a matching purchase carries no exception", () => {
  const decision = evaluate("MONITORED");
  assert.equal(decision.outcome, "ALLOW");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.purposeCheck?.enforced, false);
});

test("mandate rules deny in both modes, before any purpose check", () => {
  for (const enforcement of ["ENFORCED", "MONITORED"] as const) {
    const revoked = evaluate(enforcement, pharmacy, "MEDICATION", { mandate: { status: "REVOKED" } });
    assert.deepEqual([revoked.outcome, codes(revoked)], ["DENY", ["MANDATE_INACTIVE"]]);
    assert.equal(revoked.purposeCheck, undefined);

    const expired = evaluate(enforcement, pharmacy, "MEDICATION", { mandate: { expiresAt: "2026-10-16T14:00:00Z" } });
    assert.deepEqual(codes(expired), ["MANDATE_EXPIRED"]);

    const stranger = evaluate(enforcement, pharmacy, "MEDICATION", { intent: { delegateId: "someone-else" } });
    assert.deepEqual(codes(stranger), ["DELEGATE_NOT_AUTHORIZED"]);

    const otherMandate = evaluate(enforcement, pharmacy, "MEDICATION", { intent: { mandateId: "other" } });
    assert.deepEqual(codes(otherMandate), ["MANDATE_INACTIVE"]);
  }
});

test("the budget denies in both modes, and other assets fail closed", () => {
  for (const enforcement of ["ENFORCED", "MONITORED"] as const) {
    const over = evaluate(enforcement, pharmacy, "MEDICATION", { debit: { value: "4001", assetCode: "USD", assetScale: 2 } });
    assert.deepEqual([over.outcome, codes(over)], ["DENY", ["BUDGET_EXCEEDED"]]);

    const exact = evaluate(enforcement, pharmacy, "MEDICATION", { debit: { value: "4000", assetCode: "USD", assetScale: 2 } });
    assert.equal(exact.outcome, "ALLOW");

    const otherAsset = evaluate(enforcement, pharmacy, "MEDICATION", { debit: { value: "1", assetCode: "COP", assetScale: 2 } });
    assert.deepEqual(codes(otherAsset), ["BUDGET_EXCEEDED"]);
  }
});
