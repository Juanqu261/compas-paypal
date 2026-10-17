import type { MerchantHistoryDeps } from "../../src/application/merchant-history.ts";
import type { Mandate, PurposeEnforcement } from "../../src/domain/mandate.ts";
import type {
  CompasCategory,
  CorroborationTier,
  MerchantCategoryResolution,
} from "../../src/domain/merchant-category.ts";
import type { MerchantHistorySummary } from "../../src/domain/merchant-history.ts";
import type { MerchantTrustLevel } from "../../src/domain/merchant.ts";
import type { PurchaseIntent } from "../../src/domain/purchase.ts";
import { InMemoryObservationLog } from "../../src/integrations/merchant-history/in-memory-observation-log.ts";
import { loadTrustMatrix } from "../../src/integrations/merchant-history/json-trust-matrix.ts";
import { createPartyRefFn } from "../../src/integrations/merchant-history/party-ref.ts";
import type { MerchantRegistry } from "../../src/ports/merchant-registry.ts";
import type { MerchantHistoryInput } from "../../src/policy/merchant-category-evidence.ts";
import { summarizeMerchantHistory } from "../../src/policy/merchant-history.ts";
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
      merchantConfidence: { minimum: "HIGH" },
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

const CORROBORATION_BY_LEVEL: Record<MerchantTrustLevel, CorroborationTier> = {
  SELF_DECLARED: "UNCORROBORATED",
  PROVIDER_VERIFIED: "PROVIDER_VERIFIED",
  EXTERNAL_VERIFIED: "EXTERNAL_VERIFIED",
};

/**
 * Every listed category is declared by the merchant and corroborated at its
 * level: SELF_DECLARED means only the merchant says so.
 */
export function resolution(
  walletAddressUrl: string,
  categories: readonly [CompasCategory, MerchantTrustLevel][],
  declarations?: readonly [CompasCategory, CorroborationTier][],
): MerchantCategoryResolution {
  return {
    walletAddressUrl,
    categories: categories.map(([category, trustLevel]) => ({
      category,
      trustLevel,
      supportingEntryIds: ["entry"],
      sourceIds: ["source"],
    })),
    declarations: (declarations ?? categories.map(([category, level]) => [category, CORROBORATION_BY_LEVEL[level]] as const)).map(
      ([category, corroboration]) => ({
        category,
        corroboration,
        declarationEntryIds: ["declaration"],
        supportingEntryIds: corroboration === "UNCORROBORATED" ? [] : ["entry"],
        contradictingEntryIds: corroboration === "CONTRADICTED" ? ["contradiction"] : [],
      }),
    ),
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

export const TRUST_MATRIX = loadTrustMatrix();
export const partyRef = createPartyRefFn("test-party-key-test-party-key-test-party-key");

/** An empty observation log, the seeded trust matrix and a fixed party HMAC key. */
export function historyDeps(): MerchantHistoryDeps & { observations: InMemoryObservationLog } {
  return { observations: new InMemoryObservationLog(), matrix: TRUST_MATRIX, partyRef };
}

/** A history summary with the given counts. Everything else is empty. */
export function summary(
  walletAddressUrl: string,
  category: CompasCategory,
  counts: Partial<Omit<MerchantHistorySummary, "walletAddressUrl" | "category">> = {},
): MerchantHistorySummary {
  return {
    ...summarizeMerchantHistory({ observations: [], walletAddressUrl, category, asOf: NOW, matrix: TRUST_MATRIX }),
    ...counts,
  };
}

/** No history for any declared category: the decision rests on corroboration alone. */
export function noHistory(merchant: MerchantCategoryResolution): MerchantHistoryInput {
  return {
    matrix: TRUST_MATRIX,
    summaries: merchant.declarations.map((declared) => summary(merchant.walletAddressUrl, declared.category)),
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
