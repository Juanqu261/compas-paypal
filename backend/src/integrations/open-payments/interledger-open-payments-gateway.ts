import { randomBytes } from "node:crypto";
import {
  isFinalizedGrantWithAccessToken,
  isPendingGrant,
  type IncomingPayment,
  type OutgoingPayment,
} from "@interledger/open-payments";
import type {
  ActivePayerGrant,
  GrantStore,
  PendingPayerGrant,
} from "../../ports/grant-store";
import type {
  CreateIncomingPaymentInput,
  CreateOutgoingPaymentInput,
  CreateQuoteInput,
  FinishPayerGrantInput,
  GrantSpentAmounts,
  IncomingPaymentRef,
  OpenPaymentsGateway,
  OutgoingPaymentRef,
  PayerGrantFinished,
  PayerGrantStarted,
  QuoteRef,
  ReadOutgoingPaymentInput,
  StartPayerGrantInput,
  WalletAddressInfo,
} from "../../ports/open-payments-gateway";
import { toWalletAddressUrl } from "./config.ts";
import { OpenPaymentsGatewayError, toGatewayError } from "./errors.ts";
import { interactionHashMatches } from "./interaction-hash.ts";
import {
  assertWalletAsset,
  deriveOutgoingPaymentState,
  toMoneyAmount,
  toOpenPaymentsAmount,
  toSafeMetadata,
} from "./mappers.ts";
import type { OpenPaymentsSdk } from "./sdk-client.ts";

export type InterledgerOpenPaymentsGatewayDeps = {
  sdk: OpenPaymentsSdk;
  grants: GrantStore;
  /** The finish redirect target. `grantKey` is appended as a query parameter. */
  finishUri: string;
  now?: () => Date;
  createNonce?: () => string;
};

type ClientGrantType = "incoming-payment" | "quote";

type CachedToken = { value: string; expiresAtMs?: number };

/** Refresh a token a little before the auth server's stated expiry. */
const TOKEN_EXPIRY_MARGIN_MS = 5_000;

/**
 * The real Open Payments adapter. Every method talks to the network through
 * the SDK. Nothing here returns a fabricated wallet, grant, quote or payment.
 *
 * Kept in memory for the hackathon: wallet lookups, non-interactive grant
 * tokens, quote expiries and the decision-to-payment map. A restart clears
 * them, which is safe. The payer grant lives in the GrantStore.
 */
export class InterledgerOpenPaymentsGateway implements OpenPaymentsGateway {
  readonly #sdk: OpenPaymentsSdk;
  readonly #grants: GrantStore;
  readonly #finishUri: string;
  readonly #now: () => Date;
  readonly #createNonce: () => string;

  readonly #wallets = new Map<string, WalletAddressInfo>();
  readonly #clientTokens = new Map<string, CachedToken>();
  readonly #incomingPaymentAuthServers = new Map<string, string>();
  readonly #quoteExpiries = new Map<string, number>();
  readonly #paymentsByDecision = new Map<
    string,
    Promise<{ grantKey: string; url: string }>
  >();

  constructor(deps: InterledgerOpenPaymentsGatewayDeps) {
    this.#sdk = deps.sdk;
    this.#grants = deps.grants;
    this.#finishUri = deps.finishUri;
    this.#now = deps.now ?? (() => new Date());
    this.#createNonce =
      deps.createNonce ?? (() => randomBytes(32).toString("base64url"));
  }

  async resolveWallet(walletAddressUrl: string): Promise<WalletAddressInfo> {
    const url = toWalletAddressUrl(walletAddressUrl);
    const cached = this.#wallets.get(url);
    if (cached) return cached;

    const wallet = await this.#call("walletAddress.get", () =>
      this.#sdk.walletAddress.get({ url }),
    );
    const info: WalletAddressInfo = {
      walletAddressUrl: wallet.id,
      authServer: wallet.authServer,
      resourceServer: wallet.resourceServer,
      assetCode: wallet.assetCode,
      assetScale: wallet.assetScale,
    };
    this.#wallets.set(url, info);
    this.#wallets.set(wallet.id, info);
    return info;
  }

  async startPayerGrant(input: StartPayerGrantInput): Promise<PayerGrantStarted> {
    const existing = await this.#grants.get(input.grantKey);
    if (existing?.state === "ACTIVE") {
      throw new OpenPaymentsGatewayError(
        "INVALID_INPUT",
        `Grant ${input.grantKey} is already active. Cancel it before asking for consent again.`,
      );
    }

    const payer = await this.resolveWallet(input.payerWalletAddressUrl);
    assertWalletAsset(input.debitLimit, payer, "debitLimit");

    const clientNonce = this.#createNonce();
    const finish = new URL(this.#finishUri);
    finish.searchParams.set("grantKey", input.grantKey);

    // No `receiver`: Pedro authorizes a budget before Andrea picks a pharmacy.
    const grant = await this.#call("grant.request (outgoing-payment)", () =>
      this.#sdk.grant.request(
        { url: payer.authServer },
        {
          access_token: {
            access: [
              {
                type: "outgoing-payment",
                actions: ["create", "read"],
                identifier: payer.walletAddressUrl,
                limits: {
                  debitAmount: toOpenPaymentsAmount(input.debitLimit, "debitLimit"),
                  ...(input.interval ? { interval: input.interval } : {}),
                },
              },
            ],
          },
          interact: {
            start: ["redirect"],
            finish: {
              method: "redirect",
              uri: finish.toString(),
              nonce: clientNonce,
            },
          },
        },
      ),
    );

    if (!isPendingGrant(grant)) {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_FINALIZED",
        "The payer's auth server did not ask for interactive consent. COMPAS requires it for outgoing payments.",
      );
    }

    const pending: PendingPayerGrant = {
      state: "PENDING",
      grantKey: input.grantKey,
      payerWalletAddressUrl: payer.walletAddressUrl,
      resourceServer: payer.resourceServer,
      grantEndpoint: payer.authServer,
      clientNonce,
      finishNonce: grant.interact.finish,
      continueUri: grant.continue.uri,
      continueAccessToken: grant.continue.access_token.value,
    };
    await this.#grants.put(pending);

    return { redirectUrl: grant.interact.redirect };
  }

  async finishPayerGrant(input: FinishPayerGrantInput): Promise<PayerGrantFinished> {
    const stored = await this.#grants.get(input.grantKey);
    if (!stored) {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_FOUND",
        `No pending grant for ${input.grantKey}`,
      );
    }
    // A repeated redirect, for example a browser refresh, changes nothing.
    if (stored.state === "ACTIVE") {
      return { status: "GRANTED" };
    }

    // The auth server may write its endpoint with or without a trailing slash.
    // Both name the same endpoint, and the secret nonces still have to match.
    const endpoint = stored.grantEndpoint;
    const endpointForms = [
      endpoint,
      endpoint.endsWith("/") ? endpoint.slice(0, -1) : `${endpoint}/`,
    ];
    const hashOk = endpointForms.some((grantEndpoint) =>
      interactionHashMatches({
        clientNonce: stored.clientNonce,
        finishNonce: stored.finishNonce,
        interactRef: input.interactRef,
        grantEndpoint,
        receivedHash: input.hash,
      }),
    );
    if (!hashOk) {
      throw new OpenPaymentsGatewayError(
        "INVALID_INTERACTION_HASH",
        "The finish redirect hash does not match this grant request.",
      );
    }

    const result = await this.#call("grant.continue", () =>
      this.#sdk.grant.continue(
        { url: stored.continueUri, accessToken: stored.continueAccessToken },
        { interact_ref: input.interactRef },
      ),
    );
    if (!isFinalizedGrantWithAccessToken(result)) {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_FINALIZED",
        "The payer's auth server did not issue an access token after consent.",
      );
    }

    const active: ActivePayerGrant = {
      state: "ACTIVE",
      grantKey: stored.grantKey,
      payerWalletAddressUrl: stored.payerWalletAddressUrl,
      resourceServer: stored.resourceServer,
      accessToken: result.access_token.value,
      manageUrl: result.access_token.manage,
      accessTokenExpiresAt: this.#expiryIso(result.access_token.expires_in),
      continueUri: result.continue.uri,
      continueAccessToken: result.continue.access_token.value,
    };
    await this.#grants.put(active);

    return { status: "GRANTED" };
  }

  async cancelPayerGrant(grantKey: string): Promise<void> {
    const stored = await this.#grants.get(grantKey);
    if (!stored) return;

    try {
      await this.#call("grant.cancel", () =>
        this.#sdk.grant.cancel({
          url: stored.continueUri,
          accessToken: stored.continueAccessToken,
        }),
      );
    } catch (error) {
      // Already gone at the auth server. Forget it here too.
      if (!(error instanceof OpenPaymentsGatewayError && error.code === "NOT_FOUND")) {
        throw error;
      }
    }
    await this.#grants.delete(grantKey);
  }

  async createIncomingPayment(
    input: CreateIncomingPaymentInput,
  ): Promise<IncomingPaymentRef> {
    const merchant = await this.resolveWallet(input.merchantWalletAddressUrl);
    assertWalletAsset(input.incomingAmount, merchant, "incomingAmount");
    const metadata = toSafeMetadata(input.metadata);

    const payment = await this.#withClientToken(
      "incoming-payment",
      merchant.authServer,
      "incomingPayment.create",
      (accessToken) =>
        this.#sdk.incomingPayment.create(
          { url: merchant.resourceServer, accessToken },
          {
            walletAddress: merchant.walletAddressUrl,
            incomingAmount: toOpenPaymentsAmount(input.incomingAmount, "incomingAmount"),
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
            ...(metadata ? { metadata } : {}),
          },
        ),
    );

    this.#incomingPaymentAuthServers.set(payment.id, merchant.authServer);
    return toIncomingPaymentRef(payment);
  }

  async readIncomingPayment(incomingPaymentUrl: string): Promise<IncomingPaymentRef> {
    let authServer = this.#incomingPaymentAuthServers.get(incomingPaymentUrl);
    if (!authServer) {
      const publicView = await this.#call("incomingPayment.getPublic", () =>
        this.#sdk.incomingPayment.getPublic({ url: incomingPaymentUrl }),
      );
      authServer = publicView.authServer;
      this.#incomingPaymentAuthServers.set(incomingPaymentUrl, authServer);
    }

    const payment = await this.#withClientToken(
      "incoming-payment",
      authServer,
      "incomingPayment.get",
      (accessToken) =>
        this.#sdk.incomingPayment.get({ url: incomingPaymentUrl, accessToken }),
    );
    return toIncomingPaymentRef(payment);
  }

  async createQuote(input: CreateQuoteInput): Promise<QuoteRef> {
    const payer = await this.resolveWallet(input.payerWalletAddressUrl);

    const quote = await this.#withClientToken(
      "quote",
      payer.authServer,
      "quote.create",
      (accessToken) =>
        this.#sdk.quote.create(
          { url: payer.resourceServer, accessToken },
          {
            walletAddress: payer.walletAddressUrl,
            receiver: input.incomingPaymentUrl,
            method: "ilp",
          },
        ),
    );

    if (quote.expiresAt) {
      this.#quoteExpiries.set(quote.id, Date.parse(quote.expiresAt));
    }

    return {
      id: quote.id,
      debitAmount: toMoneyAmount(quote.debitAmount, "quote.debitAmount"),
      receiveAmount: toMoneyAmount(quote.receiveAmount, "quote.receiveAmount"),
      ...(quote.expiresAt ? { expiresAt: quote.expiresAt } : {}),
    };
  }

  async createOutgoingPayment(
    input: CreateOutgoingPaymentInput,
  ): Promise<OutgoingPaymentRef> {
    const metadata = toSafeMetadata(input.metadata);
    const decisionId = metadata?.compasDecisionId;

    // One decision pays at most once, even if the caller retries.
    if (decisionId) {
      const prior = this.#paymentsByDecision.get(decisionId);
      if (prior) {
        const { grantKey, url } = await prior;
        return this.readOutgoingPayment({ grantKey, outgoingPaymentUrl: url });
      }
    }

    const expiresAtMs = this.#quoteExpiries.get(input.quoteId);
    if (expiresAtMs !== undefined && expiresAtMs <= this.#now().getTime()) {
      throw new OpenPaymentsGatewayError(
        "QUOTE_EXPIRED",
        `Quote ${input.quoteId} has expired. Re-quote and re-evaluate policy with the new debit amount.`,
      );
    }

    const create = this.#withPayerToken(
      input.grantKey,
      "outgoingPayment.create",
      (grant, accessToken) =>
        this.#sdk.outgoingPayment.create(
          { url: grant.resourceServer, accessToken },
          {
            walletAddress: grant.payerWalletAddressUrl,
            quoteId: input.quoteId,
            ...(metadata ? { metadata } : {}),
          },
        ),
    );

    if (decisionId) {
      const record = create.then((payment) => ({
        grantKey: input.grantKey,
        url: payment.id,
      }));
      this.#paymentsByDecision.set(decisionId, record);
      // A failed attempt created nothing. Let the caller try again.
      record.catch(() => this.#paymentsByDecision.delete(decisionId));
    }

    return toOutgoingPaymentRef(await create);
  }

  async readOutgoingPayment(
    input: ReadOutgoingPaymentInput,
  ): Promise<OutgoingPaymentRef> {
    const payment = await this.#withPayerToken(
      input.grantKey,
      "outgoingPayment.get",
      (_grant, accessToken) =>
        this.#sdk.outgoingPayment.get({
          url: input.outgoingPaymentUrl,
          accessToken,
        }),
    );
    return toOutgoingPaymentRef(payment);
  }

  async readGrantSpentAmounts(grantKey: string): Promise<GrantSpentAmounts> {
    const spent = await this.#withPayerToken(
      grantKey,
      "outgoingPayment.getGrantSpentAmounts",
      (grant, accessToken) =>
        this.#sdk.outgoingPayment.getGrantSpentAmounts({
          url: grant.resourceServer,
          accessToken,
        }),
    );
    return {
      ...(spent.spentDebitAmount
        ? { spentDebitAmount: toMoneyAmount(spent.spentDebitAmount, "spentDebitAmount") }
        : {}),
      ...(spent.spentReceiveAmount
        ? {
            spentReceiveAmount: toMoneyAmount(
              spent.spentReceiveAmount,
              "spentReceiveAmount",
            ),
          }
        : {}),
    };
  }

  async #call<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toGatewayError(operation, error);
    }
  }

  #expiryIso(expiresInSeconds: number | undefined): string | undefined {
    if (expiresInSeconds === undefined) return undefined;
    return new Date(this.#now().getTime() + expiresInSeconds * 1000).toISOString();
  }

  #isExpired(expiresAtMs: number | undefined): boolean {
    return (
      expiresAtMs !== undefined &&
      expiresAtMs - TOKEN_EXPIRY_MARGIN_MS <= this.#now().getTime()
    );
  }

  /**
   * Incoming-payment and quote grants are non-interactive. COMPAS requests
   * them as a client and caches the token per auth server until it expires.
   */
  async #clientToken(type: ClientGrantType, authServer: string): Promise<string> {
    const key = `${type} ${authServer}`;
    const cached = this.#clientTokens.get(key);
    if (cached && !this.#isExpired(cached.expiresAtMs)) return cached.value;

    const grant = await this.#call(`grant.request (${type})`, () =>
      this.#sdk.grant.request(
        { url: authServer },
        type === "incoming-payment"
          ? {
              access_token: {
                access: [{ type: "incoming-payment", actions: ["create", "read"] }],
              },
            }
          : {
              access_token: {
                access: [{ type: "quote", actions: ["create", "read"] }],
              },
            },
      ),
    );

    if (isPendingGrant(grant) || !isFinalizedGrantWithAccessToken(grant)) {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_FINALIZED",
        `The ${type} grant at ${authServer} asked for interaction. COMPAS expects it to be non-interactive.`,
      );
    }

    const expiresIn = grant.access_token.expires_in;
    this.#clientTokens.set(key, {
      value: grant.access_token.value,
      ...(expiresIn !== undefined
        ? { expiresAtMs: this.#now().getTime() + expiresIn * 1000 }
        : {}),
    });
    return grant.access_token.value;
  }

  /** Runs an SDK call with a client token. Re-requests the grant once on 401. */
  async #withClientToken<T>(
    type: ClientGrantType,
    authServer: string,
    operation: string,
    run: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const token = await this.#clientToken(type, authServer);
    try {
      return await this.#call(operation, () => run(token));
    } catch (error) {
      if (!(error instanceof OpenPaymentsGatewayError && error.code === "UNAUTHORIZED")) {
        throw error;
      }
      this.#clientTokens.delete(`${type} ${authServer}`);
      const fresh = await this.#clientToken(type, authServer);
      return this.#call(operation, () => run(fresh));
    }
  }

  async #activePayerGrant(grantKey: string): Promise<ActivePayerGrant> {
    const stored = await this.#grants.get(grantKey);
    if (!stored) {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_FOUND",
        `No payer grant for ${grantKey}`,
      );
    }
    if (stored.state !== "ACTIVE") {
      throw new OpenPaymentsGatewayError(
        "GRANT_NOT_ACTIVE",
        `The payer has not finished consent for ${grantKey}`,
      );
    }
    return stored;
  }

  async #rotatePayerToken(grant: ActivePayerGrant): Promise<ActivePayerGrant> {
    let rotated;
    try {
      rotated = await this.#sdk.token.rotate({
        url: grant.manageUrl,
        accessToken: grant.accessToken,
      });
    } catch (error) {
      throw new OpenPaymentsGatewayError(
        "GRANT_EXPIRED",
        `The payer's access token for ${grant.grantKey} could not be rotated. The payer must consent again.`,
        { cause: toGatewayError("token.rotate", error) },
      );
    }

    const next: ActivePayerGrant = {
      ...grant,
      accessToken: rotated.access_token.value,
      manageUrl: rotated.access_token.manage,
      accessTokenExpiresAt: this.#expiryIso(rotated.access_token.expires_in),
    };
    await this.#grants.put(next);
    return next;
  }

  /**
   * Runs an SDK call with the payer's grant token. Rotates an expired token
   * first, and rotates once more and retries on 401. A 401 means the request
   * was not processed, so the retry cannot double a payment.
   */
  async #withPayerToken<T>(
    grantKey: string,
    operation: string,
    run: (grant: ActivePayerGrant, accessToken: string) => Promise<T>,
  ): Promise<T> {
    let grant = await this.#activePayerGrant(grantKey);
    const expiresAtMs = grant.accessTokenExpiresAt
      ? Date.parse(grant.accessTokenExpiresAt)
      : undefined;
    if (this.#isExpired(expiresAtMs)) {
      grant = await this.#rotatePayerToken(grant);
    }

    try {
      return await this.#call(operation, () => run(grant, grant.accessToken));
    } catch (error) {
      if (!(error instanceof OpenPaymentsGatewayError && error.code === "UNAUTHORIZED")) {
        throw error;
      }
      const rotated = await this.#rotatePayerToken(grant);
      return this.#call(operation, () => run(rotated, rotated.accessToken));
    }
  }
}

function toIncomingPaymentRef(payment: IncomingPayment): IncomingPaymentRef {
  return {
    url: payment.id,
    walletAddressUrl: payment.walletAddress,
    ...(payment.incomingAmount
      ? { incomingAmount: toMoneyAmount(payment.incomingAmount, "incomingAmount") }
      : {}),
    receivedAmount: toMoneyAmount(payment.receivedAmount, "receivedAmount"),
    completed: payment.completed,
    ...(payment.expiresAt ? { expiresAt: payment.expiresAt } : {}),
  };
}

function toOutgoingPaymentRef(payment: OutgoingPayment): OutgoingPaymentRef {
  return {
    url: payment.id,
    state: deriveOutgoingPaymentState(payment),
    receiverUrl: payment.receiver,
    debitAmount: toMoneyAmount(payment.debitAmount, "debitAmount"),
    receiveAmount: toMoneyAmount(payment.receiveAmount, "receiveAmount"),
    sentAmount: toMoneyAmount(payment.sentAmount, "sentAmount"),
    createdAt: payment.createdAt,
  };
}
