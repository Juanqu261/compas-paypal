import type { PayPalGateway } from "../../ports/paypal-gateway.ts";
import { readPayPalConfig } from "./config.ts";
import { PayPalRestGateway } from "./paypal-rest-gateway.ts";
import { type FetchLike, PayPalRestClient } from "./rest-client.ts";
import { UnimplementedPayPalGateway } from "./unimplemented-paypal-gateway.ts";

export type PayPalGatewaySetup =
  | { configured: true; gateway: PayPalGateway; environment: "sandbox" }
  | { configured: false; gateway: PayPalGateway; missing: readonly string[] };

/**
 * Composition root for PayPal. With the app credentials set, it returns the
 * REST adapter on the sandbox. Without them, it returns the gateway that
 * throws on every call, never a fake one.
 */
export function createPayPalGateway(
  options: {
    env?: NodeJS.ProcessEnv;
    returnUrl?: string;
    cancelUrl?: string;
    fetch?: FetchLike;
  } = {},
): PayPalGatewaySetup {
  const result = readPayPalConfig(options.env);
  if (!result.configured) {
    return { configured: false, gateway: new UnimplementedPayPalGateway(), missing: result.missing };
  }
  const { config } = result;
  return {
    configured: true,
    environment: config.environment,
    gateway: new PayPalRestGateway({
      client: new PayPalRestClient({ config, ...(options.fetch ? { fetch: options.fetch } : {}) }),
      returnUrl: options.returnUrl ?? config.returnUrl,
      cancelUrl: options.cancelUrl ?? config.cancelUrl,
    }),
  };
}
