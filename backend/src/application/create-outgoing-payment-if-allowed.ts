import type {
  CreateOutgoingPaymentInput,
  OpenPaymentsGateway,
  OutgoingPaymentRef,
} from "../ports/open-payments-gateway";
import type { PolicyOutcome } from "../domain/policy-decision";
import { outgoingPaymentMayProceed } from "../policy/outgoing-payment-gate.ts";

/**
 * Architectural gate only. This does not create a payment by itself.
 * DENY and REVIEW return without calling the gateway.
 */
export async function createOutgoingPaymentIfAllowed(
  outcome: PolicyOutcome,
  payments: Pick<OpenPaymentsGateway, "createOutgoingPayment">,
  input: CreateOutgoingPaymentInput,
): Promise<OutgoingPaymentRef | undefined> {
  if (!outgoingPaymentMayProceed(outcome)) {
    return undefined;
  }

  return payments.createOutgoingPayment(input);
}
