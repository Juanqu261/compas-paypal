import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePurchase } from "../../src/policy/evaluate-purchase.ts";
import {
  intent,
  LIQUOR_PAYPAL_ID,
  mandate,
  noHistory,
  NOW,
  PHARMACY_PAYPAL_ID,
  resolution,
} from "../application/purchase-test-kit.ts";

/** What the merchant charges. The PayPal order, on ALLOW, is for exactly this. */
const charge = { value: "1120", assetCode: "USD", assetScale: 2 };
const pharmacy = resolution(PHARMACY_PAYPAL_ID, [["MEDICATION", "PROVIDER_VERIFIED"]]);
const liquor = resolution(LIQUOR_PAYPAL_ID, [["ALCOHOL", "PROVIDER_VERIFIED"], ["TOBACCO", "PROVIDER_VERIFIED"]]);
const selfDeclaredPharmacy = resolution(PHARMACY_PAYPAL_ID, [["MEDICATION", "SELF_DECLARED"]]);

function evaluate(
  enforcement: "ENFORCED" | "MONITORED",
  merchantResolution = pharmacy,
  /** null: a line item without a category. */
  lineCategory: string | null = "MEDICATION",
  overrides: { mandate?: Parameters<typeof mandate>[1]; intent?: Parameters<typeof intent>[2]; charge?: typeof charge } = {},
) {
  const amount = overrides.charge ?? charge;
  return evaluatePurchase({
    decisionId: "d-1",
    mandate: mandate(enforcement, overrides.mandate),
    intent: intent(merchantResolution.paypalMerchantId, lineCategory ?? undefined, {
      amount,
      lineItems: [{ id: "line-1", description: "Item", ...(lineCategory ? { category: lineCategory } : {}), amount }],
      ...overrides.intent,
    }),
    merchantResolution,
    merchantHistory: noHistory(merchantResolution),
    now: NOW,
  });
}

const codes = (decision: ReturnType<typeof evaluate>) => decision.reasons.map((reason) => reason.code);

test("ENFORCED: a verified pharmacy selling medication is ALLOW", () => {
  const decision = evaluate("ENFORCED");
  assert.equal(decision.outcome, "ALLOW");
  assert.deepEqual(decision.reasons, []);
  const { merchantConfidence, ...check } = decision.purposeCheck!;
  assert.deepEqual(check, {
    outcome: "ALLOW",
    reasons: [],
    matchedCategories: ["MEDICATION"],
    enforced: true,
  });
  assert.deepEqual(
    [merchantConfidence?.corroboration, merchantConfidence?.historyGrade, merchantConfidence?.confidence],
    ["PROVIDER_VERIFIED", "NONE", "HIGH"],
  );
});

test("a merchant below HIGH confidence passes only within the mandate's per-purchase cap", () => {
  const tienda = resolution(PHARMACY_PAYPAL_ID, [["MEDICATION", "SELF_DECLARED"]]);
  const lowCap = (value: string, assetCode = "USD", enforcement: "ENFORCED" | "MONITORED" = "ENFORCED") => ({
    purposePolicy: {
      ...mandate(enforcement).purposePolicy,
      merchantConfidence: { minimum: "LOW" as const, maxDebitBelowHigh: { value, assetCode, assetScale: 2 } },
    },
  });

  assert.equal(evaluate("ENFORCED", tienda, "MEDICATION", { mandate: lowCap("1120") }).outcome, "ALLOW");

  const over = evaluate("ENFORCED", tienda, "MEDICATION", { mandate: lowCap("1119") });
  assert.deepEqual([over.outcome, codes(over)], ["REVIEW", ["MERCHANT_CONFIDENCE_LIMIT_EXCEEDED"]]);

  const otherAsset = evaluate("ENFORCED", tienda, "MEDICATION", { mandate: lowCap("999999", "EUR") });
  assert.deepEqual(codes(otherAsset), ["MERCHANT_CONFIDENCE_LIMIT_EXCEEDED"], "another asset fails closed");

  const monitored = evaluate("MONITORED", tienda, "MEDICATION", { mandate: lowCap("1119", "USD", "MONITORED") });
  assert.deepEqual([monitored.outcome, codes(monitored)], ["ALLOW", ["MERCHANT_CONFIDENCE_LIMIT_EXCEEDED", "PAYER_MONITORED_EXCEPTION"]]);

  // The cap does not apply to a HIGH-confidence merchant.
  assert.equal(evaluate("ENFORCED", pharmacy, "MEDICATION", { mandate: lowCap("1") }).outcome, "ALLOW");
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
    const over = evaluate(enforcement, pharmacy, "MEDICATION", { charge: { value: "4001", assetCode: "USD", assetScale: 2 } });
    assert.deepEqual([over.outcome, codes(over)], ["DENY", ["BUDGET_EXCEEDED"]]);

    const exact = evaluate(enforcement, pharmacy, "MEDICATION", { charge: { value: "4000", assetCode: "USD", assetScale: 2 } });
    assert.equal(exact.outcome, "ALLOW");

    const otherAsset = evaluate(enforcement, pharmacy, "MEDICATION", { charge: { value: "1", assetCode: "COP", assetScale: 2 } });
    assert.deepEqual(codes(otherAsset), ["BUDGET_EXCEEDED"]);
  }
});
