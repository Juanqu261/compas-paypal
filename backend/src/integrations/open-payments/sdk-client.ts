import {
  createAuthenticatedClient,
  type AuthenticatedClient,
} from "@interledger/open-payments";
import type { OpenPaymentsConfig } from "./config.ts";

/**
 * The SDK routes the gateway uses. Narrowing them keeps test doubles small
 * and shows at a glance which Open Payments calls COMPAS makes.
 */
export type OpenPaymentsSdk = {
  walletAddress: Pick<AuthenticatedClient["walletAddress"], "get">;
  grant: Pick<AuthenticatedClient["grant"], "request" | "continue" | "cancel">;
  token: Pick<AuthenticatedClient["token"], "rotate">;
  incomingPayment: Pick<
    AuthenticatedClient["incomingPayment"],
    "create" | "get" | "getPublic"
  >;
  quote: Pick<AuthenticatedClient["quote"], "create">;
  outgoingPayment: Pick<
    AuthenticatedClient["outgoingPayment"],
    "create" | "get" | "getGrantSpentAmounts"
  >;
};

/**
 * The only place COMPAS builds a signed Open Payments client.
 * Keep logLevel at "warn" or above. The SDK's debug logs print request and
 * response bodies, and grant responses carry access tokens.
 */
export function createOpenPaymentsSdk(
  config: OpenPaymentsConfig,
): Promise<OpenPaymentsSdk> {
  return createAuthenticatedClient({
    walletAddressUrl: config.clientWalletAddressUrl,
    keyId: config.keyId,
    privateKey: config.privateKey,
    logLevel: "warn",
  });
}
