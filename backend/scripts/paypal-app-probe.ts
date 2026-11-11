/**
 * Non-capturing probe: which REST app is configured, and can it create an
 * order payable to a given sandbox merchant id?
 *
 *   npm run paypal:app-probe -- [--payee <merchant id>] [--amount 100]
 *
 * Creates at most one unpaid sandbox order (expires if unused). Never captures.
 * Prints no secrets, tokens, or client ids.
 */
import { parseArgs } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { normalizePayPalAccountId } from "../src/domain/merchant-identifiers.ts";
import { readPayPalConfig } from "../src/integrations/paypal/config.ts";
import { PayPalGatewayError } from "../src/integrations/paypal/errors.ts";
import { PayPalRestClient } from "../src/integrations/paypal/rest-client.ts";
import { step } from "./lib/smoke-io.ts";

const { values: args } = parseArgs({
  options: {
    payee: { type: "string" },
    amount: { type: "string", default: "100" },
  },
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function money(minor: string): string {
  if (!/^[1-9]\d{0,7}$/.test(minor)) throw new Error(`--amount is in cents: ${minor}`);
  return (Number(minor) / 100).toFixed(2);
}

async function main(): Promise<void> {
  const result = readPayPalConfig();
  if (!result.configured) throw new Error(`PayPal is not configured. Missing: ${result.missing.join(", ")}`);
  const { config } = result;
  const client = new PayPalRestClient({ config });

  step("1. Client-credentials token (app credentials)");
  // Force a token by making a lightweight authenticated call that is not an order.
  // PayPal has no public "who owns this REST app" field on client credentials.
  // We fingerprint the client id only.
  console.log(`environment     ${config.environment}`);
  console.log(`apiBase         ${config.apiBaseUrl}`);
  console.log(`clientId fp     ${fingerprint(config.clientId)} (sha256 prefix; not the secret)`);
  console.log(`clientId length ${config.clientId.length}`);

  step("2. Identity userinfo (often empty for client_credentials)");
  try {
    const body = await client.request(
      "PayPal userinfo",
      "GET",
      "/v1/identity/oauth2/userinfo?schema=openid",
    );
    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const keys = Object.keys(record).filter((k) => !/token|secret|password/i.test(k));
    console.log(`userinfo keys   ${keys.length ? keys.join(", ") : "(none)"}`);
    for (const key of ["payer_id", "user_id", "sub", "email", "name", "account_type"]) {
      const value = record[key];
      if (typeof value === "string" && value) {
        console.log(`userinfo.${key}  ${value.length > 4 ? `${value.slice(0, 4)}…` : value} (len=${value.length})`);
      }
    }
    if (keys.length === 0) {
      console.log(
        "NOTE: client_credentials does not identify a Business account owner. " +
          "The REST app lives in a developer dashboard; payees are sandbox accounts that PayPal accepts for this app.",
      );
    }
  } catch (error) {
    if (error instanceof PayPalGatewayError) {
      console.log(`userinfo        unavailable (${error.status ?? "?"} ${error.issue ?? error.code})`);
    } else {
      throw error;
    }
  }

  const payeeRaw = args.payee ?? process.env.DEMO_MERCHANT_PAYPAL_ID?.trim();
  if (!payeeRaw) throw new Error("Pass --payee or set DEMO_MERCHANT_PAYPAL_ID.");
  const payee = normalizePayPalAccountId(payeeRaw);
  if (!payee) throw new Error(`--payee is not a PayPal merchant id: ${payeeRaw}`);
  const value = money(args.amount);

  step(`3. Create unpaid order payable to ${payee.slice(0, 4)}… (no capture)`);
  const requestId = `app-probe-${randomUUID()}`;
  const amount = { currency_code: "USD", value };
  try {
    const body = await client.request("PayPal create order", "POST", "/v2/checkout/orders", {
      requestId,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: "app-probe",
            custom_id: requestId,
            invoice_id: requestId,
            payee: { merchant_id: payee },
            amount: { ...amount, breakdown: { item_total: amount } },
            items: [{ name: "Item 1", quantity: "1", unit_amount: amount }],
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: "http://localhost:4123/smoke-return",
              cancel_url: "http://localhost:4123/smoke-cancel",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
            },
          },
        },
      },
    });
    const order = body as { id?: string; status?: string; purchase_units?: Array<{ payee?: { merchant_id?: string } }> };
    const returnedPayee = order.purchase_units?.[0]?.payee?.merchant_id;
    console.log(`order           ${order.id} (${order.status})`);
    console.log(`amount          USD ${value}`);
    console.log(`payee requested ${payee}`);
    console.log(`payee returned  ${returnedPayee ?? "(none)"}`);
    console.log(`payee match     ${returnedPayee === payee}`);
    console.log("RESULT          ACCEPT — this REST app can create orders payable to that Business account.");
    console.log("No capture was attempted. The unpaid order will expire at PayPal.");
  } catch (error) {
    if (!(error instanceof PayPalGatewayError)) throw error;
    console.log(`RESULT          REJECT — ${error.status ?? "?"} ${error.issue ?? error.code}: ${error.message}`);
    console.log(
      "This usually means the Business account is not usable as payee for this REST app " +
        "(different developer account, invalid id, or PayPal account not eligible).",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof PayPalGatewayError) {
    console.error(`\n[${error.code}] ${error.message}${error.debugId ? ` (debug id ${error.debugId})` : ""}`);
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
