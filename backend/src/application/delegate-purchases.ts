import { createHash, randomUUID } from "node:crypto";
import type { Mandate } from "../domain/mandate.ts";
import { type CompasCategory, COMPAS_CATEGORIES, isCompasCategory } from "../domain/merchant-category.ts";
import type { MerchantTrustLevel } from "../domain/merchant.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyOutcome, PolicyReasonCode, PurposeCheck } from "../domain/policy-decision.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { PaymentState } from "../domain/spending.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { DirectoryMerchant, MerchantDirectory } from "../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import type { PayPalGateway } from "../ports/paypal-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import {
  applyConfidenceCap,
  checkBudget,
  checkMandateRules,
  composeDecision,
  evaluatePurposeCheck,
} from "../policy/evaluate-purchase.ts";
import { categoriesNeedingHistory } from "../policy/merchant-category-evidence.ts";
import { type Actor, type FieldError, type MandateErrorCode, type MandateService, parseMoney } from "./mandates.ts";
import { loadMerchantHistory, type MerchantHistoryDeps } from "./merchant-history.ts";
import { purchaseUnderMandate } from "./purchase-under-mandate.ts";
import { type Errand, errandWindowStart } from "../domain/errand.ts";
import type { CatalogMappingRepository } from "../ports/catalog-mapping-repository.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import type { MerchantCatalogRepository } from "../ports/merchant-catalog.ts";
import { checkErrand, type ErrandLine } from "../policy/errand-check.ts";
import { resolveCatalogLine } from "./catalog-mappings.ts";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

const MANDATE_ID = /^mandate-[A-Za-z0-9-]{1,80}$/;
const MERCHANT_ID = /^[a-z0-9-]{1,64}$/;
/** Chosen by the client, once per purchase attempt. Retrying with the same key never pays twice. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const ERRAND_ID = /^errand-[A-Za-z0-9-]{1,80}$/;
const CATALOG_ITEM_ID = /^[A-Za-z0-9._:-]{1,64}$/;
export const MAX_PURCHASE_LINES = 20;
export const MAX_LINE_QUANTITY = 99;

export type PurchaseLine = {
  category?: CompasCategory;
  amount: MoneyAmount;
  /** The merchant's SKU id. COMPAS reads its verified CUM from the catalog mapping, never from the request. */
  catalogItemId?: string;
  /** Units of the SKU on the line. Default 1. */
  quantity: number;
};

export type PurchaseRequest = {
  mandateId: string;
  merchantId: string;
  /** What the merchant charges. An allowed purchase's PayPal order is for exactly this. */
  amount: MoneyAmount;
  /** Categories, SKU ids and amounts only. Descriptions can name a medicine, so COMPAS doesn't take them. */
  lines: readonly PurchaseLine[];
  /** The errand the cart is bought under. Every line must then fit it. */
  errandId?: string;
  idempotencyKey?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the delegate's purchase. The delegate is never in it: it is the
 * authenticated actor. The merchant is an id from the server's directory, not
 * a PayPal account or a category: those come from the backend.
 */
export function parsePurchaseRequest(
  body: unknown,
  options: { requireIdempotencyKey: boolean },
): { ok: true; value: PurchaseRequest } | { ok: false; errors: readonly FieldError[] } {
  const errors: FieldError[] = [];
  if (!isRecord(body)) {
    return { ok: false, errors: [{ field: "", code: "INVALID_BODY", message: "a JSON object is required" }] };
  }

  const mandateId = typeof body.mandateId === "string" ? body.mandateId : "";
  if (!MANDATE_ID.test(mandateId)) errors.push({ field: "mandateId", code: "INVALID_ID", message: "a mandate id" });
  const merchantId = typeof body.merchantId === "string" ? body.merchantId : "";
  if (!MERCHANT_ID.test(merchantId)) errors.push({ field: "merchantId", code: "INVALID_ID", message: "a merchant id" });

  let idempotencyKey: string | undefined;
  if (options.requireIdempotencyKey || body.idempotencyKey !== undefined) {
    if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(body.idempotencyKey)) {
      errors.push({ field: "idempotencyKey", code: "INVALID_KEY", message: "16 to 64 letters, digits, - or _" });
    } else {
      idempotencyKey = body.idempotencyKey;
    }
  }

  let errandId: string | undefined;
  if (body.errandId !== undefined) {
    if (typeof body.errandId !== "string" || !ERRAND_ID.test(body.errandId)) {
      errors.push({ field: "errandId", code: "INVALID_ID", message: "an errand id" });
    } else {
      errandId = body.errandId;
    }
  }

  const amount = parseMoney(body.amount, "amount", errors);
  const lines: PurchaseLine[] = [];
  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0 || body.lineItems.length > MAX_PURCHASE_LINES) {
    errors.push({ field: "lineItems", code: "REQUIRED", message: `1 to ${MAX_PURCHASE_LINES} lines` });
  } else {
    body.lineItems.forEach((raw: unknown, index: number) => {
      const field = `lineItems.${index}`;
      if (!isRecord(raw)) {
        errors.push({ field, code: "INVALID_LINE", message: "{ category?, amount }" });
        return;
      }
      if (raw.category !== undefined && !isCompasCategory(raw.category)) {
        errors.push({ field: `${field}.category`, code: "UNKNOWN_CATEGORY", message: `one of ${COMPAS_CATEGORIES.join(", ")}` });
        return;
      }
      if (raw.catalogItemId !== undefined && (typeof raw.catalogItemId !== "string" || !CATALOG_ITEM_ID.test(raw.catalogItemId))) {
        errors.push({ field: `${field}.catalogItemId`, code: "INVALID_ID", message: "the merchant's SKU id" });
        return;
      }
      const quantity = raw.quantity ?? 1;
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
        errors.push({ field: `${field}.quantity`, code: "INVALID_QUANTITY", message: `a whole number from 1 to ${MAX_LINE_QUANTITY}` });
        return;
      }
      const lineAmount = parseMoney(raw.amount, `${field}.amount`, errors);
      if (lineAmount) {
        lines.push({
          ...(raw.category !== undefined ? { category: raw.category as CompasCategory } : {}),
          amount: lineAmount,
          ...(typeof raw.catalogItemId === "string" ? { catalogItemId: raw.catalogItemId } : {}),
          quantity,
        });
      }
    });
  }

  if (amount && lines.length > 0 && errors.length === 0) {
    if (lines.some((line) => line.amount.assetCode !== amount.assetCode || line.amount.assetScale !== amount.assetScale)) {
      errors.push({ field: "lineItems", code: "ASSET_MISMATCH", message: "every line uses the charge's asset" });
    } else if (lines.reduce((sum, line) => sum + BigInt(line.amount.value), 0n) !== BigInt(amount.value)) {
      errors.push({ field: "lineItems", code: "TOTAL_MISMATCH", message: "the lines must add up to the amount" });
    }
  }

  if (errors.length > 0 || !amount) return { ok: false, errors };
  return {
    ok: true,
    value: {
      mandateId,
      merchantId,
      amount,
      lines,
      ...(errandId ? { errandId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type PurposeCheckView = {
  outcome: PolicyOutcome;
  reasonCodes: readonly PolicyReasonCode[];
  matchedCategories: readonly CompasCategory[];
  enforced: boolean;
  /** The confidence of the best eligible category the merchant declared. */
  merchantConfidence?: string;
};

function purposeCheckView(check: PurposeCheck): PurposeCheckView {
  return {
    outcome: check.outcome,
    reasonCodes: check.reasons.map((reason) => reason.code),
    matchedCategories: check.matchedCategories,
    enforced: check.enforced,
    ...(check.merchantConfidence ? { merchantConfidence: check.merchantConfidence.confidence } : {}),
  };
}

/**
 * Every check COMPAS runs before PayPal, with nothing written, nothing
 * reserved and nothing asked of PayPal. It is not a decision: another
 * purchase can still use the capacity before this one is made.
 */
export type PurchasePreview = {
  mandateId: string;
  merchant: { id: string; displayName: string };
  requestedAmount: MoneyAmount;
  mandateRules: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  /** The charge against the remaining capacity. Absent when a mandate rule already stops the purchase. */
  budget?: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  /** Absent when a mandate rule already stops the purchase. */
  purposeCheck?: PurposeCheckView;
  /** Present when the purchase names an errand. ERRAND_MISMATCH holds; DELEGATE_NOT_AUTHORIZED denies. */
  errand?: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  merchantCategories: readonly { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  /**
   * What `purchaseUnderMandate` would do now. STOP_*: it would decide DENY
   * or REVIEW, and no PayPal order would exist. ORDER: it would decide ALLOW
   * and create a PayPal order for the payer to approve.
   */
  next: "STOP_DENY" | "STOP_REVIEW" | "ORDER";
  /** Whether POST /purchases may run here. */
  execution: "ENABLED" | "PURCHASES_DISABLED_FOR_DEMO" | "PAYPAL_NOT_CONFIGURED";
};

/** One purchase attempt as the delegate sees it. No PayPal account, order id, approval link or token. */
export type PurchaseView = {
  decisionId: string;
  mandateId: string;
  merchant: { id: string; displayName: string };
  outcome: PolicyOutcome;
  reasonCodes: readonly PolicyReasonCode[];
  purposeCheck?: PurposeCheckView;
  monitoredException: boolean;
  requestedAmount: MoneyAmount;
  /**
   * NOT_CREATED: no PayPal order exists for this attempt. CREATED: PayPal
   * holds one. AWAITING_PAYER_APPROVAL means the payer has not approved it
   * yet, and only COMPLETED means the merchant was paid.
   */
  payment: { status: "NOT_CREATED" } | { status: "CREATED"; state: PaymentState };
  recordedAt: string;
};

function purchaseView(record: SpendingRecord, merchant: { id: string; displayName: string }): PurchaseView {
  const { orderId, state } = record.paypal;
  return {
    decisionId: record.id,
    mandateId: record.mandateId,
    merchant,
    outcome: record.decision.outcome,
    reasonCodes: record.decision.reasons.map((reason) => reason.code),
    ...(record.purposeCheck ? { purposeCheck: purposeCheckView(record.purposeCheck) } : {}),
    monitoredException: record.monitoredException,
    requestedAmount: record.requestedAmount,
    payment: orderId && state ? { status: "CREATED", state } : { status: "NOT_CREATED" },
    recordedAt: record.recordedAt,
  };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type PurchaseErrorCode =
  | MandateErrorCode
  | "INVALID_PURCHASE"
  | "UNKNOWN_MERCHANT"
  | "UNKNOWN_ERRAND"
  | "PURCHASES_DISABLED_FOR_DEMO"
  | "PAYPAL_NOT_CONFIGURED"
  | "IDEMPOTENCY_KEY_REUSED"
  /**
   * Nothing was paid: the purchase stopped before COMPAS held a PayPal order
   * for it. An order PayPal may have created anyway can never be captured,
   * because no COMPAS purchase names it.
   */
  | "PAYMENT_NOT_STARTED";

export type PurchaseFailure = {
  ok: false;
  code: PurchaseErrorCode;
  message: string;
  fieldErrors?: readonly FieldError[];
};

export type PurchaseResult<T> = ({ ok: true } & T) | PurchaseFailure;

function failure(code: PurchaseErrorCode, message: string, extra: Partial<PurchaseFailure> = {}): PurchaseFailure {
  return { ok: false, code, message, ...extra };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type PurchaseExecutionMode =
  | { allowed: true }
  | { allowed: false; code: "PURCHASES_DISABLED_FOR_DEMO" | "PAYPAL_NOT_CONFIGURED"; reason: string };

export type DelegatePurchaseDeps = {
  mandates: Pick<MandateService, "forDelegatePurchase">;
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  history: MerchantHistoryDeps;
  payments: Pick<PayPalGateway, "createOrder">;
  /** The same log MandateService reads, so the payer sees every attempt. */
  spending: SpendingLog;
  /** Where the mandate's remaining capacity lives: an ALLOW reserves the charge there. */
  capacity: Pick<MandateRepository, "reserveCapacity" | "releaseCapacity">;
  /** Merchant catalogs and their verified CUM mappings. Without them, a SKU on a line resolves to nothing. */
  catalog?: { catalogs: MerchantCatalogRepository; mappings: CatalogMappingRepository };
  /** Errands. Without them, a purchase that names an errand is refused as UNKNOWN_ERRAND. */
  errands?: ErrandRepository;
  /**
   * Whether this caller may create PayPal orders for the payer to approve.
   * Anyone can start a demo session as Andrea, so the server keeps it off
   * unless the operator opted in.
   */
  execution: PurchaseExecutionMode;
  now?: () => Date;
  newId?: () => string;
  logWarning?: (message: string) => void;
};

type Attempt = { fingerprint: string; result: Promise<PurchaseResult<{ purchase: PurchaseView }>> };

/**
 * A delegate's purchase under a mandate. The policy and the payment are
 * `purchaseUnderMandate`'s: this service only checks who is asking, finds the
 * merchant's PayPal account on the server and keeps a retried attempt from ordering twice.
 */
export class DelegatePurchaseService {
  readonly #deps: DelegatePurchaseDeps;
  /** Attempts of this process by intent id. The spending log answers for older ones. */
  readonly #attempts = new Map<string, Attempt>();

  constructor(deps: DelegatePurchaseDeps) {
    this.#deps = deps;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  get execution(): PurchaseExecutionMode {
    return this.#deps.execution;
  }

  async #prepare(
    actor: Actor,
    request: PurchaseRequest,
  ): Promise<PurchaseResult<{ mandate: Mandate; merchant: DirectoryMerchant; errand?: Errand; resolved: readonly ErrandLine[] }>> {
    const access = await this.#deps.mandates.forDelegatePurchase(actor, request.mandateId);
    if (!access.ok) return failure(access.code, access.message);
    const merchant = await this.#deps.merchants.getById(request.merchantId);
    if (!merchant) {
      return failure("UNKNOWN_MERCHANT", "That merchant does not take COMPAS payments here.", {
        fieldErrors: [{ field: "merchantId", code: "UNKNOWN_MERCHANT", message: "not a known merchant" }],
      });
    }
    let errand: Errand | undefined;
    if (request.errandId) {
      errand = await this.#deps.errands?.get(request.errandId);
      if (!errand) {
        return failure("UNKNOWN_ERRAND", "There is no such errand.", {
          fieldErrors: [{ field: "errandId", code: "UNKNOWN_ERRAND", message: "not a known errand" }],
        });
      }
    }
    return { ok: true, mandate: access.mandate, merchant, ...(errand ? { errand } : {}), resolved: await this.#resolveLines(merchant, request) };
  }

  /** Each line's verified CUM, from the merchant's catalog mapping. A line without a SKU, or an unmapped SKU, has none. */
  async #resolveLines(merchant: DirectoryMerchant, request: PurchaseRequest): Promise<ErrandLine[]> {
    const catalog = this.#deps.catalog;
    return Promise.all(
      request.lines.map(async (line) => {
        if (!line.catalogItemId || !catalog) return { quantity: line.quantity };
        const resolved = await resolveCatalogLine(merchant.paypalMerchantId, line.catalogItemId, catalog);
        return { quantity: line.quantity, ...(resolved.cum ? { cum: resolved.cum } : {}) };
      }),
    );
  }

  /**
   * A line with no category whose SKU has a verified CUM is MEDICATION: the
   * deterministic first step of classification. A category the merchant
   * gave is kept, so its own label can still contradict.
   */
  #intent(
    actor: Actor,
    request: PurchaseRequest,
    id: string,
    merchant: DirectoryMerchant,
    now: Date,
    resolved: readonly ErrandLine[] = [],
  ): PurchaseIntent {
    return {
      id,
      mandateId: request.mandateId,
      delegateId: actor.partyId,
      paypalMerchantId: merchant.paypalMerchantId,
      merchantDisplayName: merchant.displayName,
      lineItems: request.lines.map((line, index) => {
        const category = line.category ?? (resolved[index]?.cum ? ("MEDICATION" as const) : undefined);
        return {
          id: `line-${index + 1}`,
          // Not the product name: COMPAS decides on categories and keeps no description.
          description: `line ${index + 1}`,
          ...(category ? { category } : {}),
          amount: line.amount,
        };
      }),
      amount: request.amount,
      createdAt: now.toISOString(),
    };
  }

  /** Every check before PayPal, with no write, no reservation and no PayPal call. Not a decision. */
  async preview(actor: Actor, body: unknown): Promise<PurchaseResult<{ preview: PurchasePreview }>> {
    const parsed = parsePurchaseRequest(body, { requireIdempotencyKey: false });
    if (!parsed.ok) return failure("INVALID_PURCHASE", "The purchase is not valid.", { fieldErrors: parsed.errors });
    const prepared = await this.#prepare(actor, parsed.value);
    if (!prepared.ok) return prepared;
    const { mandate, merchant, errand, resolved } = prepared;
    const now = this.#now();
    const intent = this.#intent(actor, parsed.value, `preview-${this.#deps.newId?.() ?? randomUUID()}`, merchant, now, resolved);

    const base = {
      mandateId: mandate.id,
      merchant: { id: merchant.id, displayName: merchant.displayName },
      requestedAmount: intent.amount,
      execution: this.#deps.execution.allowed ? ("ENABLED" as const) : this.#deps.execution.code,
    };
    const errandCheck = errand
      ? checkErrand({
          errand,
          mandateId: mandate.id,
          delegateId: intent.delegateId,
          lines: resolved,
          amount: intent.amount,
          used: (await this.#deps.errands!.usage(errand.id, errandWindowStart(errand, now)))!,
          now,
        })
      : undefined;
    const errandView = errandCheck
      ? {
          errand: {
            passed: errandCheck.hardReasons.length === 0 && errandCheck.holdReasons.length === 0,
            reasonCodes: [...errandCheck.hardReasons, ...errandCheck.holdReasons].map((reason) => reason.code),
          },
        }
      : {};
    const mandateReasons = [...checkMandateRules(mandate, intent, now), ...(errandCheck?.hardReasons ?? [])];
    if (mandateReasons.length > 0) {
      return {
        ok: true,
        preview: {
          ...base,
          mandateRules: { passed: false, reasonCodes: mandateReasons.map((reason) => reason.code) },
          ...errandView,
          merchantCategories: [],
          next: "STOP_DENY",
        },
      };
    }

    const resolution = await this.#deps.registry.resolve(merchant.paypalMerchantId);
    const history = await loadMerchantHistory(
      resolution.paypalMerchantId,
      categoriesNeedingHistory(resolution, mandate.purposePolicy),
      now,
      this.#deps.history,
    );
    const check = applyConfidenceCap(
      mandate,
      evaluatePurposeCheck(mandate, intent, resolution, history),
      intent.amount,
    );
    const budgetReasons = checkBudget(mandate, intent.amount);
    const decision = composeDecision({
      decisionId: intent.id,
      mandate,
      intent,
      hardReasons: budgetReasons,
      holdReasons: errandCheck?.holdReasons ?? [],
      purposeCheck: check,
      evaluatedAt: now,
    });
    return {
      ok: true,
      preview: {
        ...base,
        mandateRules: { passed: true, reasonCodes: [] },
        budget: { passed: budgetReasons.length === 0, reasonCodes: budgetReasons.map((reason) => reason.code) },
        purposeCheck: purposeCheckView(check),
        ...errandView,
        merchantCategories: resolution.categories.map(({ category, trustLevel }) => ({ category, trustLevel })),
        next: decision.outcome === "ALLOW" ? "ORDER" : decision.outcome === "DENY" ? "STOP_DENY" : "STOP_REVIEW",
      },
    };
  }

  /**
   * Runs one purchase through `purchaseUnderMandate`: policy first, a PayPal
   * order only after ALLOW, for the payer to approve at PayPal. Every attempt
   * is written to the spending log the payer reads. The same idempotency key
   * returns the first attempt instead of ordering again.
   */
  async purchase(
    actor: Actor,
    body: unknown,
  ): Promise<PurchaseResult<{ purchase: PurchaseView; replayed: boolean }>> {
    const execution = this.#deps.execution;
    if (!execution.allowed) return failure(execution.code, execution.reason);

    const parsed = parsePurchaseRequest(body, { requireIdempotencyKey: true });
    if (!parsed.ok) return failure("INVALID_PURCHASE", "The purchase is not valid.", { fieldErrors: parsed.errors });
    const request = parsed.value;
    const intentId = `intent-${createHash("sha256").update(`${actor.partyId}\n${request.idempotencyKey}`).digest("hex").slice(0, 32)}`;
    const fingerprint = JSON.stringify([request.mandateId, request.merchantId, request.amount, request.lines, request.errandId]);

    const running = this.#attempts.get(intentId);
    if (running) {
      if (running.fingerprint !== fingerprint) {
        return failure("IDEMPOTENCY_KEY_REUSED", "This key was already used for a different purchase.");
      }
      const result = await running.result;
      return result.ok ? { ...result, replayed: true } : result;
    }

    // Registered before the first await, so a concurrent request with the same key joins this attempt.
    let replayed = false;
    const result = this.#run(actor, request, intentId, () => {
      replayed = true;
    });
    this.#attempts.set(intentId, { fingerprint, result });
    const settled = await result;
    // Nothing was paid, so the same key may try again. A refusal before the policy ran is not kept either.
    if (!settled.ok && settled.code !== "IDEMPOTENCY_KEY_REUSED") {
      this.#attempts.delete(intentId);
    }
    return settled.ok ? { ...settled, replayed } : settled;
  }

  async #run(
    actor: Actor,
    request: PurchaseRequest,
    intentId: string,
    markReplayed: () => void,
  ): Promise<PurchaseResult<{ purchase: PurchaseView }>> {
    const prepared = await this.#prepare(actor, request);
    if (!prepared.ok) return prepared;
    const { mandate, merchant, errand, resolved } = prepared;
    const merchantView = { id: merchant.id, displayName: merchant.displayName };

    // An attempt from before a restart is in the spending log.
    const recorded = (await this.#deps.spending.listByMandate(mandate.id)).find(
      (record) => record.purchaseIntentId === intentId,
    );
    if (recorded) {
      const same =
        recorded.paypalMerchantId === merchant.paypalMerchantId &&
        recorded.requestedAmount.value === request.amount.value &&
        recorded.requestedAmount.assetCode === request.amount.assetCode;
      if (!same) return failure("IDEMPOTENCY_KEY_REUSED", "This key was already used for a different purchase.");
      markReplayed();
      return { ok: true, purchase: purchaseView(recorded, merchantView) };
    }

    const now = this.#now();
    try {
      const { record } = await purchaseUnderMandate(
        {
          mandate,
          intent: this.#intent(actor, request, intentId, merchant, now, resolved),
          ...(errand ? { errand: { errand, lines: resolved } } : {}),
        },
        {
          merchants: this.#deps.registry,
          payments: this.#deps.payments,
          spending: this.#deps.spending,
          history: this.#deps.history,
          capacity: this.#deps.capacity,
          ...(this.#deps.errands ? { errands: this.#deps.errands } : {}),
          now: () => now,
          ...(this.#deps.newId ? { newId: this.#deps.newId } : {}),
        },
      );
      return { ok: true, purchase: purchaseView(record, merchantView) };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      this.#deps.logWarning?.(
        `Purchase ${intentId} on ${mandate.id} failed before a PayPal order was recorded: ${typeof code === "string" ? code : "error"}`,
      );
      return failure("PAYMENT_NOT_STARTED", "The purchase stopped before a PayPal order existed for it. Nothing was paid.");
    }
  }
}
