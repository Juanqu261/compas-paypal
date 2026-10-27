import type { PolicyOutcome } from "../domain/policy-decision.ts";
import type { CreateOrderInput, PayPalGateway, PayPalOrder } from "../ports/paypal-gateway.ts";
import { paymentMayProceed } from "../policy/payment-gate.ts";

/**
 * Architectural gate only. DENY and REVIEW return without calling PayPal, so
 * no order exists for them. An order itself moves no money: the payer still
 * approves it at PayPal, and COMPAS captures it only after that.
 */
export async function createPayPalOrderIfAllowed(
  outcome: PolicyOutcome,
  payments: Pick<PayPalGateway, "createOrder">,
  input: CreateOrderInput,
): Promise<PayPalOrder | undefined> {
  if (!paymentMayProceed(outcome)) {
    return undefined;
  }

  return payments.createOrder(input);
}
