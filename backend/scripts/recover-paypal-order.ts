/**
 * Recover a sandbox order after a lost smoke callback. Does NOT create orders.
 *
 *   npm run paypal:recover -- --order <id> [--capture] [--yes]
 *
 * Reads GET /v2/checkout/orders/{id}. With --capture, captures only if the
 * order is APPROVED, the payee matches DEMO_MERCHANT_PAYPAL_ID, and the amount
 * matches --amount (default 1120 USD). Idempotent: COMPLETED is reported, not
 * re-captured.
 */
import { parseArgs } from "node:util";
import { normalizePayPalAccountId } from "../src/domain/merchant-identifiers.ts";
import { createPayPalGateway } from "../src/integrations/paypal/create-paypal-gateway.ts";
import { PayPalGatewayError } from "../src/integrations/paypal/errors.ts";
import { confirm, money, requireEnv, step } from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    order: { type: "string" },
    amount: { type: "string", default: "1120" },
    currency: { type: "string", default: "USD" },
    capture: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

async function main(): Promise<void> {
  const orderId = args.order?.trim();
  if (!orderId || !/^[A-Z0-9]+$/i.test(orderId)) {
    throw new Error("Pass a PayPal order id: --order <id>");
  }

  const expectedPayee = normalizePayPalAccountId(requireEnv("DEMO_MERCHANT_PAYPAL_ID"));
  if (!expectedPayee) throw new Error("DEMO_MERCHANT_PAYPAL_ID is not a PayPal merchant id.");
  const configuredPayer = process.env.DEMO_PAYER_PAYPAL_ID?.trim();
  const configuredPayerNorm = configuredPayer ? normalizePayPalAccountId(configuredPayer) : undefined;

  const setup = createPayPalGateway({
    returnUrl: "http://localhost:4123/smoke-return",
    cancelUrl: "http://localhost:4123/smoke-cancel",
  });
  if (!setup.configured) throw new Error(`PayPal is not configured. Missing: ${setup.missing.join(", ")}`);
  const gateway = setup.gateway;

  step("1. GET order from PayPal (source of truth)");
  const order = await gateway.getOrder(orderId);
  console.log(`order       ${order.id}`);
  console.log(`status      ${order.status}`);
  console.log(`payee       ${order.payeeMerchantId ?? "(none)"}`);
  console.log(`amount      ${money(order.amount)}`);
  console.log(`payerId     ${order.payerId ?? "(not shown)"}`);
  console.log(`capture     ${order.capture?.id ?? "(none)"} ${order.capture?.status ?? ""} ${money(order.capture?.amount)}`);

  const payeeOk = order.payeeMerchantId === expectedPayee;
  const amountOk =
    order.amount?.value === args.amount &&
    order.amount?.assetCode === args.currency &&
    order.amount?.assetScale === 2;
  console.log(`payee match DEMO_MERCHANT: ${payeeOk}`);
  console.log(`amount match ${args.currency} ${args.amount}@2: ${amountOk}`);
  if (configuredPayerNorm) {
    const payerMatch = order.payerId === configuredPayerNorm;
    console.log(`payer match DEMO_PAYER_PAYPAL_ID: ${payerMatch}`);
    if (!payerMatch && order.payerId) {
      console.log(
        "DISCREPANCY: approving account is not DEMO_PAYER_PAYPAL_ID. " +
          `returned prefix=${order.payerId.slice(0, 4)}… configured prefix=${configuredPayerNorm.slice(0, 4)}…`,
      );
    }
  } else {
    console.log("DEMO_PAYER_PAYPAL_ID: not set (paypal:smoke does not pin the payer)");
  }

  if (order.status === "COMPLETED") {
    step("2. Already COMPLETED — no capture attempted");
    if (!order.capture?.id) throw new Error("COMPLETED but no capture id on the order.");
    console.log("Recovery: evidence only. Money already moved in sandbox.");
    return;
  }

  if (!args.capture) {
    step("2. Stopped after GET (pass --capture to attempt capture if APPROVED)");
    return;
  }

  if (order.status !== "APPROVED") {
    throw new Error(`Cannot capture: status is ${order.status}, need APPROVED or COMPLETED.`);
  }
  if (!payeeOk) throw new Error("Refuse capture: payee does not match DEMO_MERCHANT_PAYPAL_ID.");
  if (!amountOk) throw new Error("Refuse capture: amount does not match expected smoke amount.");

  // paypal:smoke does not pin DEMO_PAYER. Report mismatch but allow capture with explicit confirm
  // so a lost callback can still finish the PayPal-leg test. COMPAS settlement would pin.
  if (configuredPayerNorm && order.payerId && order.payerId !== configuredPayerNorm) {
    console.log(
      "WARNING: payer id differs from DEMO_PAYER_PAYPAL_ID. " +
        "This recover path is for paypal:smoke only (not COMPAS settlement).",
    );
  }

  if (!(await confirm("Capture this APPROVED order?", args.yes))) {
    console.log("Stopped before capture. No money moved.");
    return;
  }

  step("3. Capture (idempotent request id)");
  const captured = await gateway.captureOrder({
    orderId: order.id,
    requestId: `smoke-recover-${order.id}-capture`,
  });
  console.log(`order       ${captured.status}`);
  console.log(`capture     ${captured.capture?.id ?? "(none)"} ${captured.capture?.status ?? ""} ${money(captured.capture?.amount)}`);
  if (captured.capture?.status !== "COMPLETED" && captured.capture?.status !== "PENDING") {
    throw new Error("The capture did not complete.");
  }

  step("4. Re-read order to confirm");
  const again = await gateway.getOrder(orderId);
  console.log(`status      ${again.status}`);
  console.log(`capture     ${again.capture?.id ?? "(none)"} ${again.capture?.status ?? ""} ${money(again.capture?.amount)}`);
  console.log("\nRecovery passed: order was APPROVED and is now captured (or already was).");
}

main().catch((error: unknown) => {
  if (error instanceof PayPalGatewayError) {
    console.error(`\n[${error.code}] ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
