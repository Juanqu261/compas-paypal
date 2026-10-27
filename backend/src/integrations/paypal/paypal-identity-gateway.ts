import type { FetchLike } from "../../lib/fetch-like.ts";
import { notImplemented } from "../../lib/not-implemented.ts";
import type { PayPalAccountIdentity, PayPalIdentityGateway } from "../../ports/paypal-identity.ts";
import { PAYPAL_SANDBOX_API_BASE_URL, readPayPalConfig } from "./config.ts";
import { PayPalGatewayError, toPayPalError } from "./errors.ts";

/** The sandbox login page. COMPAS runs on the PayPal sandbox only. */
export const PAYPAL_SANDBOX_AUTHORIZE_URL = "https://www.sandbox.paypal.com/signin/authorize";
export const PAYPAL_IDENTITY_RETURN_PATH = "/paypal/identity/return";
/** openid and email for the address, the attributes scope for verified_account. */
export const PAYPAL_IDENTITY_SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Log in with PayPal over fetch. The authorization code is exchanged with the
 * app's credentials, and the user's access token is used once, for userinfo,
 * then dropped. Neither the token nor the client secret is logged, returned
 * or put in an error.
 */
export class PayPalRestIdentityGateway implements PayPalIdentityGateway {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #returnUrl: string;
  readonly #apiBaseUrl: string;
  readonly #fetch: FetchLike;

  constructor(deps: { clientId: string; clientSecret: string; returnUrl: string; apiBaseUrl?: string; fetch?: FetchLike }) {
    this.#clientId = deps.clientId;
    this.#clientSecret = deps.clientSecret;
    this.#returnUrl = deps.returnUrl;
    this.#apiBaseUrl = deps.apiBaseUrl ?? PAYPAL_SANDBOX_API_BASE_URL;
    this.#fetch = deps.fetch ?? ((url, init) => fetch(url, init));
  }

  authorizeUrl(state: string): string {
    const url = new URL(PAYPAL_SANDBOX_AUTHORIZE_URL);
    url.searchParams.set("flowEntry", "static");
    url.searchParams.set("client_id", this.#clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", PAYPAL_IDENTITY_SCOPES);
    url.searchParams.set("redirect_uri", this.#returnUrl);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async #call(operation: string, path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#apiBaseUrl}${path}`, { ...init, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    } catch (error) {
      throw new PayPalGatewayError("UPSTREAM", `${operation} failed: ${error instanceof Error ? error.name : "network error"}`, {
        cause: error,
      });
    }
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new PayPalGatewayError("UPSTREAM", `${operation} returned a body that is not JSON (${response.status})`);
    }
    if (!response.ok) throw toPayPalError(operation, response.status, body);
    return body;
  }

  async exchange(code: string): Promise<PayPalAccountIdentity> {
    const basic = Buffer.from(`${this.#clientId}:${this.#clientSecret}`).toString("base64");
    const token = (await this.#call("PayPal login token", "/v1/oauth2/token", {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
    })) as { access_token?: unknown };
    if (typeof token.access_token !== "string") {
      throw new PayPalGatewayError("UPSTREAM", "PayPal login token response has no access_token");
    }

    const info = (await this.#call("PayPal userinfo", "/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
      method: "GET",
      headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
    })) as {
      payer_id?: unknown;
      emails?: { value?: unknown; primary?: unknown; confirmed?: unknown }[];
      verified_account?: unknown;
    };
    return toAccountIdentity(info);
  }
}

/** Userinfo as PayPal returns it (paypalv1.1), checked field by field. */
export function toAccountIdentity(info: {
  payer_id?: unknown;
  emails?: { value?: unknown; primary?: unknown; confirmed?: unknown }[];
  verified_account?: unknown;
}): PayPalAccountIdentity {
  const emails = Array.isArray(info.emails) ? info.emails : [];
  const primary = emails.find((email) => email?.primary === true || email?.primary === "true") ?? emails[0];
  if (typeof info.payer_id !== "string" || typeof primary?.value !== "string") {
    throw new PayPalGatewayError("UPSTREAM", "PayPal userinfo has no payer_id or email");
  }
  const truthy = (value: unknown) => value === true || value === "true";
  return {
    payerId: info.payer_id.trim().toUpperCase(),
    email: primary.value.trim().toLowerCase(),
    emailConfirmed: truthy(primary.confirmed),
    verifiedAccount: truthy(info.verified_account),
  };
}

/** Used when the PayPal app is not configured. It never returns a pretend identity. */
export class UnimplementedPayPalIdentityGateway implements PayPalIdentityGateway {
  authorizeUrl(): string {
    throw new PayPalGatewayError("INVALID_INPUT", "Log in with PayPal is not configured (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET).");
  }

  exchange(): Promise<PayPalAccountIdentity> {
    return notImplemented("PayPalIdentityGateway.exchange");
  }
}

export function createPayPalIdentityGateway(
  options: { env?: NodeJS.ProcessEnv; fetch?: FetchLike } = {},
): { configured: boolean; gateway: PayPalIdentityGateway } {
  const env = options.env ?? process.env;
  const result = readPayPalConfig(env);
  if (!result.configured) return { configured: false, gateway: new UnimplementedPayPalIdentityGateway() };
  const port = env.PORT?.trim() || "4000";
  const returnUrl = new URL(
    env.PAYPAL_IDENTITY_RETURN_URI?.trim() || `http://localhost:${port}${PAYPAL_IDENTITY_RETURN_PATH}`,
  ).toString();
  return {
    configured: true,
    gateway: new PayPalRestIdentityGateway({
      clientId: result.config.clientId,
      clientSecret: result.config.clientSecret,
      returnUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
  };
}
