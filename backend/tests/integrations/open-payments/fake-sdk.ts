import {
  mockAccessToken,
  mockGrant,
  mockIncomingPaymentWithPaymentMethods,
  mockOutgoingPayment,
  mockOutgoingPaymentGrantSpentAmounts,
  mockPendingGrant,
  mockPublicIncomingPayment,
  mockQuote,
  mockWalletAddress,
} from "@interledger/open-payments";
import type { OpenPaymentsSdk } from "../../../src/integrations/open-payments/sdk-client.ts";

/**
 * Test double for the SDK routes the gateway uses. It is not an Open
 * Payments response and must never be wired into the running backend.
 * Every token value contains "TOKEN" so tests can assert none leaks.
 */
export const PAYER = mockWalletAddress({
  id: "https://wallet.test/pedro",
  authServer: "https://auth.wallet.test",
  resourceServer: "https://wallet.test/op",
  assetCode: "USD",
  assetScale: 2,
});

export const MERCHANT = mockWalletAddress({
  id: "https://wallet.test/drogueria-central",
  authServer: "https://auth.merchant.test",
  resourceServer: "https://merchant.test/op",
  assetCode: "EUR",
  assetScale: 2,
});

export const PAYER_CONSENT = {
  redirect: "https://auth.wallet.test/interact/abc",
  finishNonce: "AS-FINISH-NONCE",
  continueUri: "https://auth.wallet.test/continue/1",
  continueToken: "CONTINUE-TOKEN-1",
};

export type SdkCall = { method: string; args: unknown[] };

export function createFakeSdk() {
  const calls: SdkCall[] = [];
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };
  let payerTokenGeneration = 1;
  let quoteCount = 0;
  let outgoingCount = 0;

  const sdk: OpenPaymentsSdk = {
    walletAddress: {
      async get(args) {
        record("walletAddress.get", args);
        if (args.url === PAYER.id) return PAYER;
        if (args.url === MERCHANT.id) return MERCHANT;
        throw new Error(`unknown wallet ${args.url}`);
      },
    },
    grant: {
      async request(postArgs, args) {
        record("grant.request", postArgs, args);
        const type = args.access_token?.access[0]?.type;
        if (type === "outgoing-payment") {
          return mockPendingGrant({
            interact: {
              redirect: PAYER_CONSENT.redirect,
              finish: PAYER_CONSENT.finishNonce,
            },
            continue: {
              access_token: { value: PAYER_CONSENT.continueToken },
              uri: PAYER_CONSENT.continueUri,
            },
          });
        }
        return mockGrant({
          access_token: {
            value: `CLIENT-TOKEN-${type}`,
            manage: `${postArgs.url}/token/${type}`,
            access: [],
            expires_in: 600,
          },
        });
      },
      async continue(postArgs, args) {
        record("grant.continue", postArgs, args);
        return mockGrant({
          access_token: {
            value: "PAYER-TOKEN-1",
            manage: "https://auth.wallet.test/token/payer",
            access: [],
            expires_in: 600,
          },
          continue: {
            access_token: { value: "CONTINUE-TOKEN-2" },
            uri: "https://auth.wallet.test/continue/2",
          },
        });
      },
      async cancel(postArgs) {
        record("grant.cancel", postArgs);
      },
    },
    token: {
      async rotate(args) {
        record("token.rotate", args);
        payerTokenGeneration += 1;
        return mockAccessToken({
          access_token: {
            value: `PAYER-TOKEN-${payerTokenGeneration}`,
            manage: "https://auth.wallet.test/token/payer",
            access: [],
            expires_in: 600,
          },
        });
      },
    },
    incomingPayment: {
      async create(requestArgs, createArgs) {
        record("incomingPayment.create", requestArgs, createArgs);
        return mockIncomingPaymentWithPaymentMethods({
          id: `${MERCHANT.id}/incoming-payments/1`,
          walletAddress: createArgs.walletAddress,
          incomingAmount: createArgs.incomingAmount,
          receivedAmount: { value: "0", assetCode: "EUR", assetScale: 2 },
          completed: false,
          metadata: createArgs.metadata,
        });
      },
      async get(args) {
        record("incomingPayment.get", args);
        return mockIncomingPaymentWithPaymentMethods({
          id: args.url,
          walletAddress: MERCHANT.id,
          incomingAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
          receivedAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
          completed: true,
        });
      },
      async getPublic(args) {
        record("incomingPayment.getPublic", args);
        return mockPublicIncomingPayment({ authServer: MERCHANT.authServer });
      },
    },
    quote: {
      async create(requestArgs, createArgs) {
        record("quote.create", requestArgs, createArgs);
        quoteCount += 1;
        return mockQuote({
          id: `${PAYER.id}/quotes/${quoteCount}`,
          walletAddress: createArgs.walletAddress,
          receiver: createArgs.receiver,
          debitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
          receiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
          expiresAt: "2026-10-16T12:05:00.000Z",
        });
      },
    },
    outgoingPayment: {
      async create(requestArgs, createArgs) {
        record("outgoingPayment.create", requestArgs, createArgs);
        outgoingCount += 1;
        return {
          ...mockOutgoingPayment({
            id: `${PAYER.id}/outgoing-payments/${outgoingCount}`,
            walletAddress: PAYER.id,
            receiver: `${MERCHANT.id}/incoming-payments/1`,
            debitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
            receiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
            sentAmount: { value: "0", assetCode: "USD", assetScale: 2 },
            failed: false,
            metadata: createArgs.metadata,
          }),
          grantSpentDebitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
          grantSpentReceiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
        };
      },
      async get(args) {
        record("outgoingPayment.get", args);
        return mockOutgoingPayment({
          id: args.url,
          walletAddress: PAYER.id,
          receiver: `${MERCHANT.id}/incoming-payments/1`,
          debitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
          receiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
          sentAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
          failed: false,
        });
      },
      async getGrantSpentAmounts(args) {
        record("outgoingPayment.getGrantSpentAmounts", args);
        return mockOutgoingPaymentGrantSpentAmounts({
          spentDebitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
          spentReceiveAmount: null,
        });
      },
    },
  };

  return {
    sdk,
    calls,
    callsTo(method: string) {
      return calls.filter((call) => call.method === method);
    },
  };
}
