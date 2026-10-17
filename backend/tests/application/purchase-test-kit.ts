import type { Mandate, PurposeEnforcement } from "../../src/domain/mandate.ts";
import type {
  CompasCategory,
  MerchantCategoryResolution,
} from "../../src/domain/merchant-category.ts";
import type { MerchantTrustLevel } from "../../src/domain/merchant.ts";
import type { PurchaseIntent } from "../../src/domain/purchase.ts";
import type { MerchantRegistry } from "../../src/ports/merchant-registry.ts";
import type {
  CreateIncomingPaymentInput,
  CreateOutgoingPaymentInput,
  CreateQuoteInput,
} from "../../src/ports/open-payments-gateway.ts";

export const NOW = new Date("2026-10-16T15:00:00Z");
export const PAYER_WALLET = "https://wallet.test/pedro";
export const PHARMACY_WALLET = "https://wallet.test/drogueria-central";
export const LIQUOR_WALLET = "https://wallet.test/liquor";

export function mandate(
  enforcement: PurposeEnforcement = "ENFORCED",
  overrides: Partial<Mandate> = {},
): Mandate {
  return {
    id: "demo-mandate-medication",
    payer: { id: "demo-payer-pedro", displayName: "Pedro", role: "PAYER" },
    delegate: { id: "demo-delegate-andrea", displayName: "Andrea", role: "DELEGATE" },
    beneficiary: { id: "demo-beneficiary-gladys", displayName: "Gladys", role: "BENEFICIARY" },
    budget: { value: "4000", assetCode: "USD", assetScale: 2 },
    remainingAuthorizedAmount: { value: "4000", assetCode: "USD", assetScale: 2 },
    purposePolicy: {
      id: "demo-policy-medication",
      allowedPurposes: ["MEDICATION"],
      eligibleCategories: ["MEDICATION"],
      acceptedTrustLevels: ["PROVIDER_VERIFIED", "EXTERNAL_VERIFIED"],
      enforcement,
    },
    status: "ACTIVE",
    validFrom: "2026-10-16T00:00:00Z",
    expiresAt: "2026-12-31T23:59:59Z",
    createdAt: "2026-10-16T12:00:00Z",
    ...overrides,
  };
}

export function intent(
  merchantWalletAddressUrl: string,
  lineCategory: string | undefined,
  overrides: Partial<PurchaseIntent> = {},
): PurchaseIntent {
  const amount = { value: "1000", assetCode: "EUR", assetScale: 2 };
  return {
    id: `intent-${lineCategory ?? "uncategorized"}`,
    mandateId: "demo-mandate-medication",
    delegateId: "demo-delegate-andrea",
    merchantWalletAddressUrl,
    merchantDisplayName: "Demo shop",
    lineItems: [
      { id: "line-1", description: "Item", ...(lineCategory ? { category: lineCategory } : {}), amount },
    ],
    amount,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

export function resolution(
  walletAddressUrl: string,
  categories: readonly [CompasCategory, MerchantTrustLevel][],
): MerchantCategoryResolution {
  return {
    walletAddressUrl,
    categories: categories.map(([category, trustLevel]) => ({
      category,
      trustLevel,
      supportingEntryIds: ["entry"],
      sourceIds: ["source"],
    })),
    conflicts: [],
    flags: [],
    unmappedEvidence: [],
    mappingVersion: "test",
    resolvedAt: NOW.toISOString(),
  };
}

/** Pharmacy: MEDICATION at PROVIDER_VERIFIED. Liquor: ALCOHOL and TOBACCO at PROVIDER_VERIFIED. */
export function stubRegistry(
  byWallet: Record<string, MerchantCategoryResolution> = {
    [PHARMACY_WALLET]: resolution(PHARMACY_WALLET, [["MEDICATION", "PROVIDER_VERIFIED"]]),
    [LIQUOR_WALLET]: resolution(LIQUOR_WALLET, [["ALCOHOL", "PROVIDER_VERIFIED"], ["TOBACCO", "PROVIDER_VERIFIED"]]),
  },
): MerchantRegistry {
  return {
    async resolve(walletAddressUrl) {
      return byWallet[walletAddressUrl] ?? resolution(walletAddressUrl, []);
    },
  };
}

/** A recording stand-in for the gateway methods the purchase flow uses. Not an Open Payments response. */
export function recordingPayments(debitValue = "1120") {
  const calls = {
    incoming: [] as CreateIncomingPaymentInput[],
    quote: [] as CreateQuoteInput[],
    outgoing: [] as CreateOutgoingPaymentInput[],
  };
  return {
    calls,
    totalCalls: () => calls.incoming.length + calls.quote.length + calls.outgoing.length,
    payments: {
      async createIncomingPayment(input: CreateIncomingPaymentInput) {
        calls.incoming.push(input);
        return {
          url: `${input.merchantWalletAddressUrl}/incoming-payments/1`,
          walletAddressUrl: input.merchantWalletAddressUrl,
          incomingAmount: input.incomingAmount,
          receivedAmount: { ...input.incomingAmount, value: "0" },
          completed: false,
        };
      },
      async createQuote(input: CreateQuoteInput) {
        calls.quote.push(input);
        return {
          id: `${input.payerWalletAddressUrl}/quotes/1`,
          debitAmount: { value: debitValue, assetCode: "USD", assetScale: 2 },
          receiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
        };
      },
      async createOutgoingPayment(input: CreateOutgoingPaymentInput) {
        calls.outgoing.push(input);
        return {
          url: `${PAYER_WALLET}/outgoing-payments/${calls.outgoing.length}`,
          state: "PENDING" as const,
          receiverUrl: "receiver",
          debitAmount: { value: debitValue, assetCode: "USD", assetScale: 2 },
          receiveAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
          sentAmount: { value: "0", assetCode: "USD", assetScale: 2 },
          createdAt: NOW.toISOString(),
        };
      },
    },
  };
}
