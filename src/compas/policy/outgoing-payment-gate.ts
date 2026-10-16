import type { PolicyOutcome } from "../domain/policy-decision";

/** ALLOW is the only outcome that may proceed to an outgoing payment. */
export function outgoingPaymentMayProceed(outcome: PolicyOutcome): boolean {
  return outcome === "ALLOW";
}
