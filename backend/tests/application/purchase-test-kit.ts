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
import type { CreateOrderInput, PayPalOrder } from "../../src/ports/paypal-gateway.ts";

export const NOW = new Date("2026-10-16T15:00:00Z");
/** The payer's PayPal sandbox account in the tests. Not a real account. */
export const PAYER_PAYPAL_ID = "TESTPAYERPEDR";
export const PHARMACY_PAYPAL_ID = "TESTPHARMACY2";
export const LIQUOR_PAYPAL_ID = "TESTLAGERBAR2";

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
  paypalMerchantId: string,
  lineCategory: string | undefined,
  overrides: Partial<PurchaseIntent> = {},
): PurchaseIntent {
  const amount = { value: "1120", assetCode: "USD", assetScale: 2 };
  return {
    id: `intent-${lineCategory ?? "uncategorized"}`,
    mandateId: "demo-mandate-medication",
    delegateId: "demo-delegate-andrea",
    paypalMerchantId,
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
  paypalMerchantId: string,
  categories: readonly [CompasCategory, MerchantTrustLevel][],
  declarations?: readonly [CompasCategory, CorroborationTier][],
): MerchantCategoryResolution {
  return {
    paypalMerchantId,
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
  byMerchant: Record<string, MerchantCategoryResolution> = {
    [PHARMACY_PAYPAL_ID]: resolution(PHARMACY_PAYPAL_ID, [["MEDICATION", "PROVIDER_VERIFIED"]]),
    [LIQUOR_PAYPAL_ID]: resolution(LIQUOR_PAYPAL_ID, [["ALCOHOL", "PROVIDER_VERIFIED"], ["TOBACCO", "PROVIDER_VERIFIED"]]),
  },
): MerchantRegistry {
  return {
    async resolve(paypalMerchantId) {
      return byMerchant[paypalMerchantId] ?? resolution(paypalMerchantId, []);
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
  paypalMerchantId: string,
  category: CompasCategory,
  counts: Partial<Omit<MerchantHistorySummary, "paypalMerchantId" | "category">> = {},
): MerchantHistorySummary {
  return {
    ...summarizeMerchantHistory({ observations: [], paypalMerchantId, category, asOf: NOW, matrix: TRUST_MATRIX }),
    ...counts,
  };
}

/** No history for any declared category: the decision rests on corroboration alone. */
export function noHistory(merchant: MerchantCategoryResolution): MerchantHistoryInput {
  return {
    matrix: TRUST_MATRIX,
    summaries: merchant.declarations.map((declared) => summary(merchant.paypalMerchantId, declared.category)),
  };
}

type FakeOrder = PayPalOrder & { requestId: string; input: CreateOrderInput };

/**
 * A stand-in for PayPal's Orders API, with the order lifecycle the adapter
 * reports: created waiting for the payer, approved, captured. Not a PayPal
 * response. `approve` stands in for the payer approving at PayPal.
 */
export function fakePayPal(options: { captureStatus?: "COMPLETED" | "PENDING" | "DECLINED" } = {}) {
  const orders = new Map<string, FakeOrder>();
  const calls = { create: [] as CreateOrderInput[], get: [] as string[], capture: [] as { orderId: string; requestId: string }[] };
  const failures: { create?: Error; get?: Error; capture?: Error } = {};
  const view = (order: FakeOrder): PayPalOrder => {
    const { requestId: _requestId, input: _input, ...rest } = order;
    return structuredClone(rest);
  };
  const notFound = () => Object.assign(new Error("PayPal get order failed (404)"), { code: "NOT_FOUND" });

  return {
    calls,
    orders,
    failures,
    totalCalls: () => calls.create.length + calls.get.length + calls.capture.length,
    /** The payer approved the order at PayPal, logged in as `payerId`. */
    approve(orderId: string, payerId = PAYER_PAYPAL_ID) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no order ${orderId}`);
      order.status = "APPROVED";
      order.payerId = payerId;
      delete order.approvalUrl;
    },
    /** PayPal no longer knows the order, as after it expired unapproved. */
    forget(orderId: string) {
      orders.delete(orderId);
    },
    gateway: {
      async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
        calls.create.push(input);
        if (failures.create) throw failures.create;
        const existing = [...orders.values()].find((order) => order.requestId === input.requestId);
        if (existing) return view(existing);
        const id = `TESTORDER${String(orders.size + 1).padStart(8, "0")}`;
        const order: FakeOrder = {
          id,
          status: "PAYER_ACTION_REQUIRED",
          approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
          payeeMerchantId: input.payeeMerchantId,
          amount: input.amount,
          customId: input.metadata.compasDecisionId,
          requestId: input.requestId,
          input,
        };
        orders.set(id, order);
        return view(order);
      },
      async getOrder(orderId: string): Promise<PayPalOrder> {
        calls.get.push(orderId);
        if (failures.get) throw failures.get;
        const order = orders.get(orderId);
        if (!order) throw notFound();
        return view(order);
      },
      async captureOrder(input: { orderId: string; requestId: string }): Promise<PayPalOrder> {
        calls.capture.push(input);
        if (failures.capture) throw failures.capture;
        const order = orders.get(input.orderId);
        if (!order) throw notFound();
        if (order.status === "COMPLETED") {
          throw Object.assign(new Error("PayPal capture order failed (422 ORDER_ALREADY_CAPTURED)"), {
            code: "ORDER_ALREADY_CAPTURED",
          });
        }
        if (order.status !== "APPROVED") {
          throw Object.assign(new Error("PayPal capture order failed (422 ORDER_NOT_APPROVED)"), { code: "ORDER_NOT_APPROVED" });
        }
        order.status = "COMPLETED";
        order.capture = {
          id: `TESTCAPTURE${order.id.slice(-8)}`,
          status: options.captureStatus ?? "COMPLETED",
          amount: order.amount!,
        };
        return view(order);
      },
    },
  };
}
