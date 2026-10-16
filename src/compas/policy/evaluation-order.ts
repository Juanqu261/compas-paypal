/**
 * Planned evaluation order. This is not an evaluator.
 * Open Payments starts only after a COMPAS decision of ALLOW.
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
  "open_payments_only_if_allow",
] as const;

export type PolicyEvaluationStep = (typeof POLICY_EVALUATION_ORDER)[number];
