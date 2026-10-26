/**
 * PayPal smoke test on the sandbox.
 *
 *   npm run paypal:smoke -- [--amount 1120] [--currency USD] [--yes]
 *
 * It drives the real PayPal adapter end to end: an order payable to the
 * merchant's sandbox account, the payer's approval at PayPal, the capture.
 *
 * This tests the PayPal leg only. It runs no COMPAS policy, so it is not a
 * COMPAS payment. The operator authorizes it twice: by approving at PayPal as
 * the payer, and by confirming at the prompt before the capture. The
 * application path always goes through createPayPalOrderIfAllowed and the
 * settlement.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { MoneyAmount } from "../src/domain/money.ts";
import { normalizePayPalAccountId } from "../src/domain/merchant-identifiers.ts";
import { createPayPalGateway } from "../src/integrations/paypal/create-paypal-gateway.ts";
import { PayPalGatewayError } from "../src/integrations/paypal/errors.ts";
import {
  confirm,
  listenForPayPalReturn,
  money,
  requireEnv,
  SMOKE_CANCEL_PATH,
  SMOKE_RETURN_PATH,
  smokePort,
  step,
} from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    amount: { type: "string", default: "1120" },
    currency: { type: "string", default: "USD" },
    yes: { type: "boolean", default: false },
  },
});

async function main(): Promise<void> {
  const merchantId = normalizePayPalAccountId(requireEnv("DEMO_MERCHANT_PAYPAL_ID"));
  if (!merchantId) throw new Error("DEMO_MERCHANT_PAYPAL_ID is not a PayPal merchant id.");
  const port = smokePort();

  const setup = createPayPalGateway({
    returnUrl: `http://localhost:${port}${SMOKE_RETURN_PATH}`,
    cancelUrl: `http://localhost:${port}${SMOKE_CANCEL_PATH}`,
  });
  if (!setup.configured) throw new Error(`PayPal is not configured. Missing: ${setup.missing.join(", ")}`);
  const gateway = setup.gateway;

  // Minor units at scale 2. The adapter refuses a currency PayPal takes at another scale.
  const amount: MoneyAmount = { value: args.amount, assetCode: args.currency, assetScale: 2 };
  const decisionId = `smoke-decision-${randomUUID()}`;

  step("1. Create a PayPal order payable to the merchant");
  const order = await gateway.createOrder({
    requestId: decisionId,
    payeeMerchantId: merchantId,
    amount,
    lineAmounts: [amount],
    metadata: { compasMandateId: "smoke-mandate", compasDecisionId: decisionId, externalReference: `smoke-${randomUUID()}` },
  });
  console.log(`order    ${order.id} (${order.status})`);
  console.log(`payee    ${order.payeeMerchantId}`);
  console.log(`amount   ${money(order.amount)}`);

  step("2. The payer approves at PayPal");
  const listener = listenForPayPalReturn(port);
  try {
    console.log(`Open this URL, log in as the sandbox payer (a personal account) and approve:\n\n  ${order.approvalUrl}\n`);
    console.log(`Waiting for PayPal to send you to http://localhost:${port}${SMOKE_RETURN_PATH} ...`);
    const back = await listener.next();
    if (!back.approved) {
      console.log("The payer cancelled at PayPal. No money moved.");
      return;
    }
    if (back.orderId !== order.id) throw new Error(`PayPal returned for another order: ${back.orderId}`);
  } finally {
    listener.close();
  }

  step("3. Read the approved order");
  const approved = await gateway.getOrder(order.id);
  console.log(`status   ${approved.status}, approved by payer ${approved.payerId ?? "(not shown)"}`);
  if (approved.status !== "APPROVED") throw new Error(`Expected APPROVED, got ${approved.status}`);

  if (!(await confirm("Capture the order?", args.yes))) {
    console.log("Stopped before the capture. No money moved.");
    return;
  }

  step("4. Capture: the money goes from the payer's PayPal to the merchant's");
  const captured = await gateway.captureOrder({ orderId: order.id, requestId: `${decisionId}-capture` });
  console.log(`order    ${captured.status}`);
  console.log(`capture  ${captured.capture?.id ?? "(none)"} ${captured.capture?.status ?? ""} ${money(captured.capture?.amount)}`);
  if (captured.capture?.status !== "COMPLETED" && captured.capture?.status !== "PENDING") {
    throw new Error("The capture did not complete.");
  }
  console.log("\nSmoke test passed: order, payer approval, capture.");
}

main().catch((error: unknown) => {
  if (error instanceof PayPalGatewayError) {
    console.error(`\n[${error.code}] ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
