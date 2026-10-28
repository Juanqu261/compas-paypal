import { randomBytes } from "node:crypto";
import type {
  MerchantAccountVerification,
  MerchantAccountVerificationStore,
} from "../ports/merchant-account-verifications.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { PayPalIdentityGateway } from "../ports/paypal-identity.ts";
import { logger } from "../lib/log.ts";

const log = logger("merchant-login");

export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
export const MERCHANT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** A merchant at COMPAS, by directory id. `proof` says how it got here. */
export type MerchantActor = {
  merchantId: string;
  paypalMerchantId: string;
  /** PAYPAL_LOGIN: proved control of the PayPal account. DEMO: a demo session, which proves nothing. */
  proof: "PAYPAL_LOGIN" | "DEMO";
};

export type LoginResult =
  | { ok: true; token: string; actor: MerchantActor }
  | { ok: false; code: "INVALID_STATE" | "ACCOUNT_MISMATCH" | "UNKNOWN_MERCHANT"; message: string };

/**
 * Merchant identity. Log in with PayPal proves control of the merchant's
 * PayPal account and gives its verified email, which is stored for the
 * certificate binding, and starts a merchant session. A login state is
 * single use and expires. The account that logs in must be the merchant's
 * own: its payer id must equal the directory's PayPal merchant id.
 */
export class MerchantIdentityService {
  readonly #paypal: PayPalIdentityGateway;
  readonly #merchants: MerchantDirectory;
  readonly #verifications: MerchantAccountVerificationStore;
  readonly #now: () => Date;
  readonly #newToken: () => string;
  readonly #states = new Map<string, { merchantId: string; expiresAt: number }>();
  readonly #sessions = new Map<string, MerchantActor & { expiresAt: number }>();

  constructor(deps: {
    paypal: PayPalIdentityGateway;
    merchants: MerchantDirectory;
    verifications: MerchantAccountVerificationStore;
    now?: () => Date;
    newToken?: () => string;
  }) {
    this.#paypal = deps.paypal;
    this.#merchants = deps.merchants;
    this.#verifications = deps.verifications;
    this.#now = deps.now ?? (() => new Date());
    this.#newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
  }

  /** Where to send the merchant's browser. Undefined for a merchant COMPAS doesn't know. */
  async startLogin(merchantId: string): Promise<string | undefined> {
    if (!(await this.#merchants.getById(merchantId))) return undefined;
    const state = this.#newToken();
    this.#states.set(state, { merchantId, expiresAt: this.#now().getTime() + LOGIN_STATE_TTL_MS });
    log.info("Log in with PayPal started", { merchantId });
    return this.#paypal.authorizeUrl(state);
  }

  async completeLogin(state: string, code: string): Promise<LoginResult> {
    const pending = this.#states.get(state);
    // Single use, whatever happens next.
    this.#states.delete(state);
    if (!pending || this.#now().getTime() >= pending.expiresAt) {
      log.warn("login returned with an unknown or expired state");
      return { ok: false, code: "INVALID_STATE", message: "The login expired or was already used. Start again." };
    }
    const merchant = await this.#merchants.getById(pending.merchantId);
    if (!merchant) return { ok: false, code: "UNKNOWN_MERCHANT", message: "That merchant is no longer known." };

    const identity = await this.#paypal.exchange(code);
    if (identity.payerId !== merchant.paypalMerchantId) {
      log.warn("login with another PayPal account than the merchant's", { merchantId: merchant.id });
      return {
        ok: false,
        code: "ACCOUNT_MISMATCH",
        message: "That PayPal account is not this merchant's. Log in with the merchant's own PayPal business account.",
      };
    }
    const verification: MerchantAccountVerification = {
      paypalMerchantId: merchant.paypalMerchantId,
      email: identity.email,
      emailConfirmed: identity.emailConfirmed,
      verifiedAccount: identity.verifiedAccount,
      verifiedAt: this.#now().toISOString(),
    };
    await this.#verifications.put(verification);
    log.info("merchant PayPal account verified", {
      merchantId: merchant.id,
      emailConfirmed: identity.emailConfirmed,
      verifiedAccount: identity.verifiedAccount,
    });
    const actor: MerchantActor = { merchantId: merchant.id, paypalMerchantId: merchant.paypalMerchantId, proof: "PAYPAL_LOGIN" };
    return { ok: true, token: this.#startSession(actor), actor };
  }

  /** demo/test data: a merchant session without PayPal. It proves nothing, so it can never bind a certificate. */
  async startDemoSession(merchantId: string): Promise<{ token: string; actor: MerchantActor } | undefined> {
    const merchant = await this.#merchants.getById(merchantId);
    if (!merchant) return undefined;
    const actor: MerchantActor = { merchantId: merchant.id, paypalMerchantId: merchant.paypalMerchantId, proof: "DEMO" };
    return { token: this.#startSession(actor), actor };
  }

  #startSession(actor: MerchantActor): string {
    const token = this.#newToken();
    this.#sessions.set(token, { ...actor, expiresAt: this.#now().getTime() + MERCHANT_SESSION_TTL_MS });
    return token;
  }

  authenticate(authorization: string | undefined): MerchantActor | undefined {
    const match = authorization ? BEARER.exec(authorization.trim()) : null;
    if (!match) return undefined;
    const session = this.#sessions.get(match[1]);
    if (!session) return undefined;
    if (this.#now().getTime() >= session.expiresAt) {
      this.#sessions.delete(match[1]);
      return undefined;
    }
    const { expiresAt: _expires, ...actor } = session;
    return actor;
  }
}

/** In memory. A restart forgets every login, and the merchant logs in again. */
export class InMemoryMerchantAccountVerifications implements MerchantAccountVerificationStore {
  readonly #verifications = new Map<string, MerchantAccountVerification>();

  async put(verification: MerchantAccountVerification): Promise<void> {
    this.#verifications.set(verification.paypalMerchantId, { ...verification });
  }

  async get(paypalMerchantId: string): Promise<MerchantAccountVerification | undefined> {
    const verification = this.#verifications.get(paypalMerchantId);
    return verification ? { ...verification } : undefined;
  }
}
