import type { PolicyOutcome } from "../domain/policy-decision.ts";

/** ALLOW is the only outcome that may proceed to a PayPal order. */
export function paymentMayProceed(outcome: PolicyOutcome): boolean {
  return outcome === "ALLOW";
}
