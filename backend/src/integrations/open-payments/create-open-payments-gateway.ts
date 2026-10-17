import type { GrantStore } from "../../ports/grant-store";
import type { OpenPaymentsGateway } from "../../ports/open-payments-gateway";
import { readOpenPaymentsConfig } from "./config.ts";
import { InMemoryGrantStore } from "./in-memory-grant-store.ts";
import { InterledgerOpenPaymentsGateway } from "./interledger-open-payments-gateway.ts";
import { createOpenPaymentsSdk } from "./sdk-client.ts";
import { UnimplementedOpenPaymentsGateway } from "./unimplemented-open-payments-gateway.ts";

export type OpenPaymentsGatewaySetup =
  | { configured: true; gateway: OpenPaymentsGateway }
  | {
      configured: false;
      gateway: OpenPaymentsGateway;
      missing: readonly string[];
    };

/**
 * Composition root for Open Payments. With the client env set, it returns
 * the real adapter. Without it, it returns the gateway that throws on every
 * call, never a fake one.
 */
export async function createOpenPaymentsGateway(
  options: {
    env?: NodeJS.ProcessEnv;
    finishUri?: string;
    /** Default: in memory, so a restart loses every grant. */
    grants?: GrantStore;
  } = {},
): Promise<OpenPaymentsGatewaySetup> {
  const result = readOpenPaymentsConfig(options.env);
  if (!result.configured) {
    return {
      configured: false,
      gateway: new UnimplementedOpenPaymentsGateway(),
      missing: result.missing,
    };
  }

  const sdk = await createOpenPaymentsSdk(result.config);
  return {
    configured: true,
    gateway: new InterledgerOpenPaymentsGateway({
      sdk,
      grants: options.grants ?? new InMemoryGrantStore(),
      finishUri: options.finishUri ?? result.config.finishUri,
    }),
  };
}
