import { PayPalGatewayError } from "./errors.ts";

/** The PayPal app's credentials, from the developer dashboard. Never NEXT_PUBLIC_* variables. */
export const REQUIRED_PAYPAL_ENV = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const;

/**
 * COMPAS runs on the PayPal sandbox only. Its sessions are DEMO identities,
 * so no setting can point it at live money.
 */
export const PAYPAL_SANDBOX_API_BASE_URL = "https://api-m.sandbox.paypal.com";

/** Where PayPal sends the payer's browser after approving or cancelling an order. Served by the backend. */
export const PAYPAL_ORDER_RETURN_PATH = "/paypal/orders/return";
export const PAYPAL_ORDER_CANCEL_PATH = "/paypal/orders/cancel";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  environment: "sandbox";
  /** PayPal adds `token` (the order id) to both. */
  returnUrl: string;
  cancelUrl: string;
};

export type PayPalConfigResult =
  | { configured: true; config: PayPalConfig }
  | { configured: false; missing: readonly string[] };

function absoluteUrl(name: string, value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new PayPalGatewayError("INVALID_INPUT", `${name} is not a URL: ${value}`);
  }
}

/**
 * Reads the PayPal app configuration. Missing values are reported, not
 * invented, and the caller keeps the throwing placeholder gateway. Never log
 * the returned config: it holds the client secret.
 */
export function readPayPalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfigResult {
  const environment = env.PAYPAL_ENVIRONMENT?.trim().toLowerCase() || "sandbox";
  if (environment !== "sandbox") {
    throw new PayPalGatewayError(
      "INVALID_INPUT",
      `PAYPAL_ENVIRONMENT is ${environment}. COMPAS runs on the PayPal sandbox only.`,
    );
  }

  const missing = REQUIRED_PAYPAL_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { configured: false, missing };

  const port = env.PORT?.trim() || "4000";
  return {
    configured: true,
    config: {
      clientId: env.PAYPAL_CLIENT_ID!.trim(),
      clientSecret: env.PAYPAL_CLIENT_SECRET!.trim(),
      apiBaseUrl: PAYPAL_SANDBOX_API_BASE_URL,
      environment: "sandbox",
      returnUrl: absoluteUrl(
        "PAYPAL_RETURN_URI",
        env.PAYPAL_RETURN_URI?.trim() || `http://localhost:${port}${PAYPAL_ORDER_RETURN_PATH}`,
      ),
      cancelUrl: absoluteUrl(
        "PAYPAL_CANCEL_URI",
        env.PAYPAL_CANCEL_URI?.trim() || `http://localhost:${port}${PAYPAL_ORDER_CANCEL_PATH}`,
      ),
    },
  };
}
