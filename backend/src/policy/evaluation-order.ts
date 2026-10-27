/**
 * Planned evaluation order. This is not an evaluator.
 * A PayPal order exists only after a COMPAS decision of ALLOW, and money moves
 * only when the payer approves that order at PayPal and COMPAS captures it.
 */
export const POLICY_EVALUATION_ORDER = [
  "payment_intent",
  "mandate_exists",
  "mandate_active",
  "delegate_eligible",
  "within_time_restrictions",
  "budget_sufficient",
  "merchant_category_evidence",
  "item_category_evidence",
  "ai_classifier_if_ambiguous",
  "policy_decision",
  "paypal_order_only_if_allow",
  "payer_approves_at_paypal",
  "capture_after_mandate_recheck",
] as const;

export type PolicyEvaluationStep = (typeof POLICY_EVALUATION_ORDER)[number];
