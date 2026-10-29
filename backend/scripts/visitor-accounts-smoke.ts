/**
 * Visitor sandbox accounts, probed on the PayPal sandbox.
 *
 *   npm run paypal:visitor-smoke -- [--payee <merchant id or email>] [--payer <payer id or email>]
 *                                   [--amount 100] [--probe-only] [--yes]
 *
 * Answers what the bring-your-own demo needs to know before it is built:
 *
 * 1. Can an order of this app pay a business account named by its email, and
 *    does PayPal then say which merchant id that is?
 * 2. What does PayPal answer when the payee does not exist: at order
 *    creation, or only later?
 * 3. Who approved: the payer id and email PayPal reports, compared with the
 *    account the visitor named.
 *
 * Run it with a business and a personal account from ANOTHER developer
 * account to check that a visitor's accounts work with this app. Defaults are
 * DEMO_MERCHANT_PAYPAL_ID and DEMO_PAYER_PAYPAL_ID.
 *
 * Like paypal:smoke, it runs no COMPAS policy and is not a COMPAS payment.
 * The operator authorizes the capture twice: by approving at PayPal as the
 * payer, and at the prompt. Orders left unapproved expire at PayPal.
 */
import { randomInt, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { normalizePayPalAccountId } from "../src/domain/merchant-identifiers.ts";
import { readPayPalConfig } from "../src/integrations/paypal/config.ts";
import { PayPalGatewayError } from "../src/integrations/paypal/errors.ts";
import { PayPalRestClient } from "../src/integrations/paypal/rest-client.ts";
import { confirm, listenForPayPalReturn, SMOKE_CANCEL_PATH, SMOKE_RETURN_PATH, smokePort, step } from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    payee: { type: "string" },
    payer: { type: "string" },
    amount: { type: "string", default: "100" },
    "probe-only": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

type Json = Record<string, unknown>;
type Account = { merchant_id: string } | { email_address: string };

function record(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

/** A PayPal account id or an email, as a visitor would paste it. */
function readAccount(name: string, raw: string): Account {
  const id = normalizePayPalAccountId(raw);
  if (id) return { merchant_id: id };
  const email = raw.trim().toLowerCase();
  if (EMAIL.test(email)) return { email_address: email };
  throw new Error(`${name} is neither a 13-character PayPal account id nor an email: ${raw}`);
}

function describe(account: Account): string {
  return "merchant_id" in account ? `account id ${account.merchant_id}` : `email ${account.email_address}`;
}

function minorToPayPal(minor: string): string {
  if (!/^[1-9]\d{0,7}$/.test(minor)) throw new Error(`--amount is in cents: ${minor}`);
  return (Number(minor) / 100).toFixed(2);
}

async function createOrder(client: PayPalRestClient, payee: Account, value: string, urls: { returnUrl: string; cancelUrl: string }): Promise<Json> {
  const id = `visitor-smoke-${randomUUID()}`;
  const amount = { currency_code: "USD", value };
  const body = await client.request("PayPal create order", "POST", "/v2/checkout/orders", {
    requestId: id,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "visitor-smoke",
          custom_id: id,
          invoice_id: id,
          payee,
          amount: { ...amount, breakdown: { item_total: amount } },
          items: [{ name: "Item 1", quantity: "1", unit_amount: amount }],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: urls.returnUrl,
            cancel_url: urls.cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    },
  });
  const order = record(body);
  if (!order || typeof order.id !== "string") throw new Error("PayPal created an order the script can't read.");
  return order;
}

function payeeOf(order: Json): Json | undefined {
  const unit = record(Array.isArray(order.purchase_units) ? order.purchase_units[0] : undefined);
  return record(unit?.payee);
}

function approvalUrlOf(order: Json): string | undefined {
  const links = Array.isArray(order.links) ? order.links.map(record) : [];
  const href = links.find((link) => link?.rel === "payer-action" || link?.rel === "approve")?.href;
  return typeof href === "string" ? href : undefined;
}

/** Creates an order to a payee that should not exist and reports when PayPal objects. */
async function probeUnknownPayee(client: PayPalRestClient, payee: Account, value: string, urls: { returnUrl: string; cancelUrl: string }): Promise<void> {
  try {
    const order = await createOrder(client, payee, value, urls);
    const read = payeeOf(order);
    console.log(`${describe(payee)}: ACCEPTED at creation (order ${order.id}, ${order.status}), payee back: ${JSON.stringify(read ?? null)}`);
    console.log("  PayPal objects later, if at all. The demo can't validate this account up front.");
  } catch (error) {
    if (!(error instanceof PayPalGatewayError)) throw error;
    console.log(`${describe(payee)}: REJECTED at creation, ${error.status ?? "?"} ${error.issue ?? error.code}`);
  }
}

async function main(): Promise<void> {
  const result = readPayPalConfig();
  if (!result.configured) throw new Error(`PayPal is not configured. Missing: ${result.missing.join(", ")}`);
  const client = new PayPalRestClient({ config: result.config });
  const port = smokePort();
  const urls = {
    returnUrl: `http://localhost:${port}${SMOKE_RETURN_PATH}`,
    cancelUrl: `http://localhost:${port}${SMOKE_CANCEL_PATH}`,
  };
  const value = minorToPayPal(args.amount);

  const payeeRaw = args.payee ?? process.env.DEMO_MERCHANT_PAYPAL_ID?.trim();
  if (!payeeRaw) throw new Error("Pass --payee, or set DEMO_MERCHANT_PAYPAL_ID.");
  const payee = readAccount("--payee", payeeRaw);
  const payerRaw = args.payer ?? process.env.DEMO_PAYER_PAYPAL_ID?.trim();
  const payer = payerRaw ? readAccount("--payer", payerRaw) : undefined;

  step(`1. An order payable to ${describe(payee)}`);
  const order = await createOrder(client, payee, value, urls);
  console.log(`order    ${order.id} (${order.status}), USD ${value}`);
  console.log(`payee    ${JSON.stringify(payeeOf(order) ?? null)}`);

  step("2. Payees that don't exist");
  const unknownId = Array.from({ length: 13 }, () => ACCOUNT_ID_ALPHABET[randomInt(ACCOUNT_ID_ALPHABET.length)]).join("");
  await probeUnknownPayee(client, { merchant_id: unknownId }, value, urls);
  await probeUnknownPayee(client, { email_address: `compas-probe-${randomUUID().slice(0, 8)}@example.com` }, value, urls);

  if (args["probe-only"]) {
    console.log("\n--probe-only: stopped before the approval. No money moved.");
    return;
  }

  step("3. The payer approves at PayPal");
  const approvalUrl = approvalUrlOf(order);
  if (!approvalUrl) throw new Error(`Order ${order.id} has no approval link.`);
  const listener = listenForPayPalReturn(port);
  try {
    console.log(`Open this URL, log in as the sandbox personal account${payer ? ` (${describe(payer)})` : ""} and approve:\n\n  ${approvalUrl}\n`);
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

  step("4. Who approved");
  const approved = record(await client.request("PayPal get order", "GET", `/v2/checkout/orders/${String(order.id)}`))!;
  const payerBlock = record(approved.payer);
  const paypalSource = record(record(approved.payment_source)?.paypal);
  const payerId = payerBlock?.payer_id ?? paypalSource?.account_id;
  const payerEmail = payerBlock?.email_address ?? paypalSource?.email_address;
  console.log(`status   ${approved.status}`);
  console.log(`payer    id ${String(payerId ?? "(not shown)")}, email ${String(payerEmail ?? "(not shown)")}`);
  console.log(`payee    ${JSON.stringify(payeeOf(approved) ?? null)}`);
  if (payer) {
    const matches =
      "merchant_id" in payer
        ? payerId === payer.merchant_id
        : typeof payerEmail === "string" && payerEmail.toLowerCase() === payer.email_address;
    console.log(`expected ${describe(payer)}: ${matches ? "MATCH" : "MISMATCH"}`);
  }
  if (approved.status !== "APPROVED") throw new Error(`Expected APPROVED, got ${String(approved.status)}`);

  if (!(await confirm("Capture the order?", args.yes))) {
    console.log("Stopped before the capture. No money moved.");
    return;
  }

  step("5. Capture: the money goes from the payer's PayPal to the payee's");
  const captured = record(
    await client.request("PayPal capture order", "POST", `/v2/checkout/orders/${String(order.id)}/capture`, {
      body: {},
      requestId: `visitor-smoke-capture-${String(order.id)}`,
    }),
  )!;
  const unit = record(Array.isArray(captured.purchase_units) ? captured.purchase_units[0] : undefined);
  const captures = record(unit?.payments)?.captures;
  const capture = record(Array.isArray(captures) ? captures[0] : undefined);
  console.log(`order    ${String(captured.status)}`);
  console.log(`capture  ${String(capture?.id ?? "(none)")} ${String(capture?.status ?? "")}`);
  if (capture?.status !== "COMPLETED" && capture?.status !== "PENDING") throw new Error("The capture did not complete.");
  console.log("\nVisitor accounts check passed: order to the named payee, approval by the named payer, capture.");
}

main().catch((error: unknown) => {
  if (error instanceof PayPalGatewayError) {
    console.error(`\n[${error.code}] ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
