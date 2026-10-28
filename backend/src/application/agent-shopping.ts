import { createHash } from "node:crypto";
import type { AgentPrincipal } from "../domain/agent.ts";
import { type Errand, errandWindowStart } from "../domain/errand.ts";
import type { Mandate } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyReasonCode } from "../domain/policy-decision.ts";
import type { CatalogMappingRepository } from "../ports/catalog-mapping-repository.ts";
import type { CumRegistry } from "../ports/cum-registry.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import type { MerchantCatalogRepository } from "../ports/merchant-catalog.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import { categoriesNeedingHistory, evaluateMerchantCategoryEvidence } from "../policy/merchant-category-evidence.ts";
import { formatAmount, logger } from "../lib/log.ts";
import { resolveCatalogLine } from "./catalog-mappings.ts";
import type { DelegatePurchaseService } from "./delegate-purchases.ts";
import type { MandateService } from "./mandates.ts";
import { loadMerchantHistory, type MerchantHistoryDeps } from "./merchant-history.ts";

// Ids, codes and counts only: an errand's items and a cart's SKUs are health data.
const log = logger("agent-shopping");

const SKU_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const MERCHANT_ID = /^[a-z0-9-]{1,64}$/;
const ERRAND_ID = /^errand-[A-Za-z0-9-]{1,80}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
export const MAX_AGENT_CART_ITEMS = 10;
export const MAX_AGENT_QUANTITY = 20;

/** What a tool returns. `isError` tells the model the call did not do what it asked. */
export type ToolResult = { isError: boolean; data: Record<string, unknown> };

/**
 * Compas's own words for each reason. The agent reads these, so they are fixed
 * text: nothing from a merchant's page or catalog reaches a tool result by way
 * of an explanation.
 */
const REASON_TEXT: Record<PolicyReasonCode, string> = {
  MANDATE_INACTIVE: "The payer's budget is not active.",
  MANDATE_EXPIRED: "The payer's budget is outside its validity window.",
  BUDGET_EXCEEDED: "The charge is more than the budget has left.",
  PURPOSE_MISMATCH: "A line is outside what this budget may buy.",
  MERCHANT_NOT_ELIGIBLE: "This shop is not registered to sell what this budget buys.",
  CLASSIFICATION_UNCERTAIN: "A line could not be verified as an eligible product.",
  MERCHANT_EVIDENCE_INSUFFICIENT: "Compas does not hold enough verified evidence about this shop.",
  MERCHANT_EVIDENCE_CONFLICT: "The evidence about this shop conflicts or is under review.",
  MERCHANT_HISTORY_CONTRADICTS: "This shop's purchase history contradicts what it says it sells.",
  MERCHANT_CONFIDENCE_LIMIT_EXCEEDED: "The charge is above what this budget allows at a shop with this level of evidence.",
  DELEGATE_NOT_AUTHORIZED: "This agent is not authorized for that errand.",
  PAYER_MONITORED_EXCEPTION: "The payer allowed this purchase although it was not fully approved.",
  ERRAND_MISMATCH: "The cart does not fit the errand the delegate confirmed: an item, a quantity or an amount outside it.",
};

function money(amount: MoneyAmount): Record<string, unknown> {
  return { ...amount, display: formatAmount(amount) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolError(error: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  return { isError: true, data: { error, message, ...extra } };
}

/**
 * One answer for an errand that does not exist, belongs to someone else, or
 * is not in this agent's grant, so an agent cannot probe for other people's errands.
 */
function notAuthorized(): ToolResult {
  return {
    isError: true,
    data: {
      outcome: "DENY",
      reasonCodes: ["DELEGATE_NOT_AUTHORIZED"],
      explanation: [REASON_TEXT.DELEGATE_NOT_AUTHORIZED],
      recorded: false,
    },
  };
}

export type AgentShoppingDeps = {
  errands: Pick<ErrandRepository, "get" | "usage">;
  mandates: Pick<MandateService, "forParticipant">;
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  history: Pick<MerchantHistoryDeps, "observations" | "matrix">;
  catalogs: MerchantCatalogRepository;
  mappings: CatalogMappingRepository;
  /** Product names come from INVIMA's record, not from the merchant's text. */
  cum: CumRegistry;
  /**
   * The only door to PayPal: the same service the delegate's own purchases
   * use. The agent layer holds no PayPal port, and a test keeps it that way.
   */
  purchases: Pick<DelegatePurchaseService, "preview" | "purchase">;
  now?: () => Date;
};

type CartRequest = { errandId: string; merchantId: string; items: { skuId: string; quantity: number }[]; idempotencyKey?: string };

/**
 * What an agent may do, as the MCP tools. It acts as its grant's delegate,
 * for the errands in the grant, and proposes SKUs and quantities only. It
 * never supplies an amount or a category: Compas reads the price from the
 * merchant's catalog and the category from the SKU's verified CUM, so an
 * injected instruction cannot inflate a charge or relabel a gift card.
 */
export class AgentShoppingService {
  readonly #deps: AgentShoppingDeps;

  constructor(deps: AgentShoppingDeps) {
    this.#deps = deps;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  /** The errand and its mandate, only if the grant names the errand and its delegate is still the grant's. */
  async #scope(principal: AgentPrincipal, errandId: unknown): Promise<{ errand: Errand; mandate: Mandate } | undefined> {
    if (typeof errandId !== "string" || !ERRAND_ID.test(errandId) || !principal.grant.errandIds.includes(errandId)) {
      return undefined;
    }
    const errand = await this.#deps.errands.get(errandId);
    if (!errand || errand.delegateId !== principal.grant.delegateId) return undefined;
    const access = await this.#deps.mandates.forParticipant({ partyId: errand.delegateId }, errand.mandateId);
    if (!access.ok || access.role !== "DELEGATE") return undefined;
    return { errand, mandate: access.mandate };
  }

  // -------------------------------------------------------------------------
  // search_eligible_merchants
  // -------------------------------------------------------------------------

  /**
   * Registry-first: only shops that already pass the mandate's merchant step,
   * and that list a priced SKU with a verified CUM the errand accepts. A shop
   * Compas has not vetted, or has flagged, is not offered, and is not named.
   */
  async searchEligibleMerchants(principal: AgentPrincipal, input: unknown): Promise<ToolResult> {
    const scope = await this.#scope(principal, isRecord(input) ? input.errandId : undefined);
    if (!scope) return notAuthorized();
    const { errand, mandate } = scope;
    const now = this.#now();

    const merchants = [];
    for (const merchant of await this.#deps.merchants.list()) {
      const resolution = await this.#deps.registry.resolve(merchant.paypalMerchantId);
      const history = await loadMerchantHistory(
        resolution.paypalMerchantId,
        categoriesNeedingHistory(resolution, mandate.purposePolicy),
        now,
        this.#deps.history,
      );
      const step = evaluateMerchantCategoryEvidence(resolution, mandate.purposePolicy, history);
      if (step.result !== "PASS") continue;

      const catalog = await this.#deps.catalogs.get(merchant.paypalMerchantId);
      const offers = [];
      for (const item of catalog?.items ?? []) {
        if (!item.price) continue;
        const line = await resolveCatalogLine(merchant.paypalMerchantId, item.skuId, this.#deps);
        const errandItem = line.cum ? errand.items.find((candidate) => candidate.acceptedCums.includes(line.cum!)) : undefined;
        if (!line.cum || !errandItem) continue;
        const record = await this.#deps.cum.getByCum(line.cum);
        offers.push({
          skuId: item.skuId,
          forErrandItem: errandItem.label,
          product: record ? `${record.product}${record.presentation ? ` (${record.presentation})` : ""}` : errandItem.label,
          unitPrice: money(item.price),
        });
      }
      if (offers.length > 0) {
        merchants.push({
          merchantId: merchant.id,
          displayName: merchant.displayName,
          confidence: step.confidence.confidence,
          offers,
        });
      }
    }
    log.info("merchants searched", { grantId: principal.grant.id, errandId: errand.id, eligible: merchants.length });
    return { isError: false, data: { merchants } };
  }

  // -------------------------------------------------------------------------
  // check_purchase and propose_purchase
  // -------------------------------------------------------------------------

  #parseCart(input: unknown): CartRequest | ToolResult {
    if (!isRecord(input)) return toolError("INVALID_INPUT", "Arguments must be an object.");
    const problems: string[] = [];
    if (typeof input.errandId !== "string" || !ERRAND_ID.test(input.errandId)) problems.push("errandId");
    if (typeof input.merchantId !== "string" || !MERCHANT_ID.test(input.merchantId)) problems.push("merchantId");
    const items: CartRequest["items"] = [];
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > MAX_AGENT_CART_ITEMS) {
      problems.push(`items (1 to ${MAX_AGENT_CART_ITEMS})`);
    } else {
      for (const raw of input.items) {
        const quantity = isRecord(raw) ? (raw.quantity ?? 1) : undefined;
        if (
          !isRecord(raw) ||
          typeof raw.skuId !== "string" ||
          !SKU_ID.test(raw.skuId) ||
          typeof quantity !== "number" ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > MAX_AGENT_QUANTITY
        ) {
          problems.push("items (each needs skuId and a quantity from 1 to " + MAX_AGENT_QUANTITY + ")");
          break;
        }
        items.push({ skuId: raw.skuId, quantity });
      }
      if (new Set(items.map((item) => item.skuId)).size !== items.length) problems.push("items (list each skuId once)");
    }
    let idempotencyKey: string | undefined;
    if (input.idempotencyKey !== undefined) {
      if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(input.idempotencyKey)) problems.push("idempotencyKey");
      else idempotencyKey = input.idempotencyKey;
    }
    if (problems.length > 0) return toolError("INVALID_INPUT", `Check: ${problems.join(", ")}.`);
    return {
      errandId: input.errandId as string,
      merchantId: input.merchantId as string,
      items,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
  }

  /**
   * The body `POST /purchases` takes, built from the catalog: price times
   * quantity per line, the SKU id, and no category and no description.
   */
  async #body(
    errand: Errand,
    cart: CartRequest,
    principal: AgentPrincipal,
  ): Promise<{ body: Record<string, unknown> } | ToolResult> {
    const merchant = await this.#deps.merchants.getById(cart.merchantId);
    if (!merchant) {
      return toolError("UNKNOWN_MERCHANT", "That shop is not a Compas merchant. Compas pays only registered shops: use search_eligible_merchants.");
    }
    const lineItems = [];
    let total = 0n;
    let unit: MoneyAmount | undefined;
    for (const { skuId, quantity } of cart.items) {
      const item = await this.#deps.catalogs.getItem(merchant.paypalMerchantId, skuId);
      if (!item) return toolError("UNKNOWN_SKU", "That shop does not list one of those SKUs.", { skuId });
      if (!item.price) return toolError("NO_PRICE", "That SKU has no price on file, so Compas cannot order it.", { skuId });
      unit ??= item.price;
      if (item.price.assetCode !== unit.assetCode || item.price.assetScale !== unit.assetScale) {
        return toolError("MIXED_CURRENCIES", "A cart is in one currency.");
      }
      const amount = BigInt(item.price.value) * BigInt(quantity);
      total += amount;
      lineItems.push({ catalogItemId: skuId, quantity, amount: { ...item.price, value: amount.toString() } });
    }
    const windowStart = errandWindowStart(errand, this.#now()).toISOString();
    // The same cart in the same errand window is the same attempt: a retry never orders twice.
    const derived = createHash("sha256")
      .update(JSON.stringify([principal.grant.id, errand.id, windowStart, cart.merchantId, [...cart.items].sort((a, b) => a.skuId.localeCompare(b.skuId))]))
      .digest("hex")
      .slice(0, 40);
    return {
      body: {
        mandateId: errand.mandateId,
        merchantId: cart.merchantId,
        errandId: errand.id,
        amount: { ...unit!, value: total.toString() },
        lineItems,
        idempotencyKey: cart.idempotencyKey ?? derived,
      },
    };
  }

  async #cart(principal: AgentPrincipal, input: unknown) {
    const cart = this.#parseCart(input);
    if ("isError" in cart) return cart;
    const scope = await this.#scope(principal, cart.errandId);
    if (!scope) return notAuthorized();
    const built = await this.#body(scope.errand, cart, principal);
    if ("isError" in built) return built;
    return { delegate: { partyId: scope.errand.delegateId }, body: built.body, cart };
  }

  /** A dry run of every check. Writes nothing and asks PayPal nothing. */
  async checkPurchase(principal: AgentPrincipal, input: unknown): Promise<ToolResult> {
    const prepared = await this.#cart(principal, input);
    if ("isError" in prepared) return prepared;
    const result = await this.#deps.purchases.preview(prepared.delegate, prepared.body);
    if (!result.ok) return toolError(result.code, result.message, result.fieldErrors ? { fieldErrors: result.fieldErrors } : {});

    const { preview } = result;
    const reasonCodes = [
      ...preview.mandateRules.reasonCodes,
      ...(preview.budget?.reasonCodes ?? []),
      ...(preview.purposeCheck?.reasonCodes ?? []),
      ...(preview.errand?.reasonCodes ?? []),
    ];
    const unique = [...new Set(reasonCodes)];
    return {
      isError: false,
      data: {
        // A preview is not a decision: another purchase can still use the capacity first.
        wouldHappen: preview.next === "ORDER" ? "ALLOW" : preview.next === "STOP_DENY" ? "DENY" : "REVIEW",
        reasonCodes: unique,
        explanation: unique.map((code) => REASON_TEXT[code]),
        amount: money(preview.requestedAmount),
        purchasesEnabled: preview.execution === "ENABLED",
      },
    };
  }

  /** The purchase itself: policy first, a PayPal order only after ALLOW, and then the payer approves it. */
  async proposePurchase(principal: AgentPrincipal, input: unknown): Promise<ToolResult> {
    const prepared = await this.#cart(principal, input);
    if ("isError" in prepared) return prepared;
    const result = await this.#deps.purchases.purchase(prepared.delegate, prepared.body);
    if (!result.ok) return toolError(result.code, result.message, result.fieldErrors ? { fieldErrors: result.fieldErrors } : {});

    const { purchase } = result;
    // A PayPal order exists only after ALLOW, and the payer has not approved it yet.
    const ordered = purchase.payment.status === "CREATED";
    // One errand hold can fire for several reasons (units, amount): the agent reads each code once.
    const reasonCodes = [...new Set(purchase.reasonCodes)];
    log.info("agent proposed a purchase", {
      grantId: principal.grant.id,
      clientId: principal.clientId,
      decisionId: purchase.decisionId,
      outcome: purchase.outcome,
      reasons: reasonCodes.join(","),
    });
    return {
      isError: false,
      data: {
        decisionId: purchase.decisionId,
        outcome: purchase.outcome,
        reasonCodes,
        explanation: reasonCodes.map((code) => REASON_TEXT[code]),
        amount: money(purchase.requestedAmount),
        payment: purchase.payment.status === "CREATED" ? { status: "ORDER_CREATED", state: purchase.payment.state } : { status: "NOT_CREATED" },
        replayed: result.replayed,
        nextStep: ordered
          ? "A PayPal order now waits for the payer to approve it in PayPal. You cannot pay or approve it. Tell the delegate the payer needs to approve it."
          : "Nothing was ordered and no PayPal order exists. Tell the delegate why. Do not retry the same cart.",
      },
    };
  }

  // -------------------------------------------------------------------------
  // get_mandate_status
  // -------------------------------------------------------------------------

  /** What is left of the errand and of the payer's budget. Capacity, not a balance. */
  async getMandateStatus(principal: AgentPrincipal, input: unknown): Promise<ToolResult> {
    const scope = await this.#scope(principal, isRecord(input) ? input.errandId : undefined);
    if (!scope) return notAuthorized();
    const { errand, mandate } = scope;
    const now = this.#now();
    const used = (await this.#deps.errands.usage(errand.id, errandWindowStart(errand, now))) ?? {
      units: errand.items.map(() => 0),
      amount: { ...errand.maxAmount, value: "0" },
    };
    const status =
      errand.status === "CANCELLED" ? "CANCELLED" : now.getTime() >= Date.parse(errand.expiresAt) ? "EXPIRED" : "ACTIVE";
    return {
      isError: false,
      data: {
        errand: {
          id: errand.id,
          status,
          kind: errand.kind,
          expiresAt: errand.expiresAt,
          items: errand.items.map((item, index) => ({
            label: item.label,
            unitsAllowed: item.maxUnits,
            unitsHeld: used.units[index] ?? 0,
          })),
          amountAllowed: money(errand.maxAmount),
          amountHeld: money(used.amount),
        },
        budget: {
          status: mandate.status,
          remaining: money(mandate.remainingAuthorizedAmount),
          expiresAt: mandate.expiresAt,
        },
      },
    };
  }
}
