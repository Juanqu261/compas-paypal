import { OpenPaymentsGatewayError } from "./errors.ts";

/**
 * Names match the official Node snippets for createAuthenticatedClient.
 * See backend/.env.example.
 */
export const REQUIRED_OPEN_PAYMENTS_ENV = [
  "CLIENT_WALLET_ADDRESS",
  "KEY_ID",
  "PRIVATE_KEY_PATH",
] as const;

export type OpenPaymentsConfig = {
  /** COMPAS's own wallet address. It identifies the client. Its balance is never used. */
  clientWalletAddressUrl: string;
  keyId: string;
  /** A path to the Ed25519 private key, or the key contents. The SDK accepts both. */
  privateKey: string;
  /** Where the payer's wallet sends the browser after consent. */
  finishUri: string;
};

export type OpenPaymentsConfigResult =
  | { configured: true; config: OpenPaymentsConfig }
  | { configured: false; missing: readonly string[] };

/**
 * Test wallets often show a payment pointer such as `$ilp.example/alice`.
 * Open Payments calls need the https URL form.
 */
export function toWalletAddressUrl(value: string): string {
  const trimmed = value.trim();
  const url = trimmed.startsWith("$") ? `https://${trimmed.slice(1)}` : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OpenPaymentsGatewayError(
      "INVALID_INPUT",
      `Not a wallet address URL or payment pointer: ${value}`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new OpenPaymentsGatewayError(
      "INVALID_INPUT",
      `Wallet address must use https: ${value}`,
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

/**
 * Reads the client configuration. Missing values are reported, not invented.
 * The caller decides to keep the throwing placeholder gateway in that case.
 * Never log the returned config. It holds the key path or the key itself.
 */
export function readOpenPaymentsConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenPaymentsConfigResult {
  const missing = REQUIRED_OPEN_PAYMENTS_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return { configured: false, missing };
  }

  const port = env.PORT?.trim() || "4000";
  const finishUri =
    env.OPEN_PAYMENTS_FINISH_URI?.trim() ||
    `http://localhost:${port}/open-payments/finish`;

  try {
    new URL(finishUri);
  } catch {
    throw new OpenPaymentsGatewayError(
      "INVALID_INPUT",
      `OPEN_PAYMENTS_FINISH_URI is not a URL: ${finishUri}`,
    );
  }

  return {
    configured: true,
    config: {
      clientWalletAddressUrl: toWalletAddressUrl(env.CLIENT_WALLET_ADDRESS!),
      keyId: env.KEY_ID!.trim(),
      privateKey: env.PRIVATE_KEY_PATH!.trim(),
      finishUri,
    },
  };
}
