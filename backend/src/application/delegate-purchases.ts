import { createHash, randomUUID } from "node:crypto";
import type { Mandate } from "../domain/mandate.ts";
import { type CompasCategory, COMPAS_CATEGORIES, isCompasCategory } from "../domain/merchant-category.ts";
import type { MerchantTrustLevel } from "../domain/merchant.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyOutcome, PolicyReasonCode, PurposeCheck } from "../domain/policy-decision.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { DirectoryMerchant, MerchantDirectory } from "../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import type { OpenPaymentsGateway, PaymentState } from "../ports/open-payments-gateway.ts";
import type { PartyDirectory } from "../ports/party-directory.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import { checkMandateRules, evaluatePurposeCheck } from "../policy/evaluate-purchase.ts";
import { categoriesNeedingHistory } from "../policy/merchant-category-evidence.ts";
import {
  type Actor,
  type FieldError,
  type MandateErrorCode,
  type MandateService,
  parseMoney,
  type PayerGrantStateReader,
} from "./mandates.ts";
import { loadMerchantHistory, type MerchantHistoryDeps } from "./merchant-history.ts";
import { type PaymentConfirmation, purchaseUnderMandate } from "./purchase-under-mandate.ts";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

const MANDATE_ID = /^mandate-[A-Za-z0-9-]{1,80}$/;
const MERCHANT_ID = /^[a-z0-9-]{1,64}$/;
/** Chosen by the client, once per purchase attempt. Retrying with the same key never pays twice. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
export const MAX_PURCHASE_LINES = 20;

export type PurchaseRequest = {
  mandateId: string;
  merchantId: string;
  /** What the merchant charges, in the merchant wallet's asset. */
  amount: MoneyAmount;
  /** Categories and amounts only. Descriptions can name a medicine, so COMPAS doesn't take them. */
  lines: readonly { category?: CompasCategory; amount: MoneyAmount }[];
  idempotencyKey?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the delegate's purchase. The delegate is never in it: it is the
 * authenticated actor. The merchant is an id from the server's directory, not
 * a wallet address or a category: those come from the backend.
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

  const amount = parseMoney(body.amount, "amount", errors);
  const lines: { category?: CompasCategory; amount: MoneyAmount }[] = [];
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
      const lineAmount = parseMoney(raw.amount, `${field}.amount`, errors);
      if (lineAmount) lines.push({ ...(raw.category !== undefined ? { category: raw.category as CompasCategory } : {}), amount: lineAmount });
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
  return { ok: true, value: { mandateId, merchantId, amount, lines, ...(idempotencyKey ? { idempotencyKey } : {}) } };
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
 * The checks COMPAS can run before Open Payments, with nothing written and
 * nothing asked of a wallet. It is not a decision: the budget and the cap for
 * a merchant below HIGH need the quoted debit, which only a quote gives.
 */
export type PurchasePreview = {
  mandateId: string;
  merchant: { id: string; displayName: string };
  requestedAmount: MoneyAmount;
  mandateRules: { passed: boolean; reasonCodes: readonly PolicyReasonCode[] };
  /** Absent when a mandate rule already stops the purchase. */
  purposeCheck?: PurposeCheckView;
  merchantCategories: readonly { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  /**
   * What `purchaseUnderMandate` would do next. STOP_*: it would decide here,
   * before any Open Payments call. QUOTE: it would ask Open Payments for an
   * incoming payment and a quote, then check the budget.
   */
  next: "STOP_DENY" | "STOP_REVIEW" | "QUOTE";
  /** Checks that need the quote, still to run when `next` is QUOTE. */
  pendingChecks: readonly ("BUDGET" | "CONFIDENCE_CAP")[];
  /** Whether POST /purchases may run here. */
  execution: "ENABLED" | "PURCHASES_DISABLED_FOR_DEMO" | "OPEN_PAYMENTS_NOT_CONFIGURED";
};

/** One purchase attempt as the delegate sees it. No wallet URL, quote id or token. */
export type PurchaseView = {
  decisionId: string;
  mandateId: string;
  merchant: { id: string; displayName: string };
  outcome: PolicyOutcome;
  reasonCodes: readonly PolicyReasonCode[];
  purposeCheck?: PurposeCheckView;
  monitoredException: boolean;
  requestedAmount: MoneyAmount;
  /** From the Open Payments quote. Absent when COMPAS stopped before quoting. */
  debitAmount?: MoneyAmount;
  /**
   * NOT_CREATED: no outgoing payment exists for this attempt. CREATED: Open
   * Payments accepted one. Its state is derived, and PENDING is not COMPLETED.
   */
  payment: { status: "NOT_CREATED" } | { status: "CREATED"; state: PaymentState };
  recordedAt: string;
};

function purchaseView(record: SpendingRecord, merchant: { id: string; displayName: string }): PurchaseView {
  const { outgoingPaymentUrl, state } = record.openPayments;
  return {
    decisionId: record.id,
    mandateId: record.mandateId,
    merchant,
    outcome: record.decision.outcome,
    reasonCodes: record.decision.reasons.map((reason) => reason.code),
    ...(record.purposeCheck ? { purposeCheck: purposeCheckView(record.purposeCheck) } : {}),
    monitoredException: record.monitoredException,
    requestedAmount: record.requestedAmount,
    ...(record.debitAmount ? { debitAmount: record.debitAmount } : {}),
    payment: outgoingPaymentUrl && state ? { status: "CREATED", state } : { status: "NOT_CREATED" },
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
  | "PURCHASES_DISABLED_FOR_DEMO"
  | "GRANT_NOT_ACTIVE"
  | "IDEMPOTENCY_KEY_REUSED"
  /** Nothing was paid: COMPAS failed before it asked Open Payments for the payment. Safe to retry. */
  | "PAYMENT_NOT_STARTED"
  /** COMPAS asked Open Payments for the payment and got no clear answer. Do not retry: read the activity. */
  | "PAYMENT_OUTCOME_UNKNOWN";

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
  | { allowed: false; code: "PURCHASES_DISABLED_FOR_DEMO" | "OPEN_PAYMENTS_NOT_CONFIGURED"; reason: string };

export type DelegatePurchaseDeps = {
  mandates: Pick<MandateService, "forDelegatePurchase">;
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  history: MerchantHistoryDeps;
  parties: PartyDirectory;
  /** The same GrantStore the gateway writes. Only `state` is read. */
  grants: PayerGrantStateReader;
  payments: Pick<OpenPaymentsGateway, "createIncomingPayment" | "createQuote" | "createOutgoingPayment">;
  /** The same log MandateService reads, so the payer sees every attempt. */
  spending: SpendingLog;
  /** Where the mandate's remaining capacity lives: an ALLOW reserves the quoted debit there. */
  capacity: Pick<MandateRepository, "reserveCapacity" | "releaseCapacity">;
  /** Reads a new PENDING payment again until the payer's wallet settles it. */
  confirmation?: PaymentConfirmation;
  /**
   * Whether this caller may spend a payer's grant. Anyone can start a demo
   * session as Andrea, so the server keeps it off unless the operator opted in.
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
 * merchant's wallet on the server and keeps a retried attempt from paying twice.
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
  ): Promise<PurchaseResult<{ mandate: Mandate; merchant: DirectoryMerchant }>> {
    const access = await this.#deps.mandates.forDelegatePurchase(actor, request.mandateId);
    if (!access.ok) return failure(access.code, access.message);
    const merchant = await this.#deps.merchants.getById(request.merchantId);
    if (!merchant) {
      return failure("UNKNOWN_MERCHANT", "That merchant does not take COMPAS payments here.", {
        fieldErrors: [{ field: "merchantId", code: "UNKNOWN_MERCHANT", message: "not a known merchant" }],
      });
    }
    return { ok: true, mandate: access.mandate, merchant };
  }

  #intent(actor: Actor, request: PurchaseRequest, id: string, merchant: DirectoryMerchant, now: Date): PurchaseIntent {
    return {
      id,
      mandateId: request.mandateId,
      delegateId: actor.partyId,
      merchantWalletAddressUrl: merchant.walletAddressUrl,
      merchantDisplayName: merchant.displayName,
      lineItems: request.lines.map((line, index) => ({
        id: `line-${index + 1}`,
        // Not the product name: COMPAS decides on categories and keeps no description.
        description: `line ${index + 1}`,
        ...(line.category ? { category: line.category } : {}),
        amount: line.amount,
      })),
      amount: request.amount,
      createdAt: now.toISOString(),
    };
  }

  /** The checks before Open Payments, with no write and no wallet call. Not a decision. */
  async preview(actor: Actor, body: unknown): Promise<PurchaseResult<{ preview: PurchasePreview }>> {
    const parsed = parsePurchaseRequest(body, { requireIdempotencyKey: false });
    if (!parsed.ok) return failure("INVALID_PURCHASE", "The purchase is not valid.", { fieldErrors: parsed.errors });
    const prepared = await this.#prepare(actor, parsed.value);
    if (!prepared.ok) return prepared;
    const { mandate, merchant } = prepared;
    const now = this.#now();
    const intent = this.#intent(actor, parsed.value, `preview-${this.#deps.newId?.() ?? randomUUID()}`, merchant, now);

    const base = {
      mandateId: mandate.id,
      merchant: { id: merchant.id, displayName: merchant.displayName },
      requestedAmount: intent.amount,
      execution: this.#deps.execution.allowed ? ("ENABLED" as const) : this.#deps.execution.code,
    };
    const mandateReasons = checkMandateRules(mandate, intent, now);
    if (mandateReasons.length > 0) {
      return {
        ok: true,
        preview: {
          ...base,
          mandateRules: { passed: false, reasonCodes: mandateReasons.map((reason) => reason.code) },
          merchantCategories: [],
          next: "STOP_DENY",
          pendingChecks: [],
        },
      };
    }

    const resolution = await this.#deps.registry.resolve(merchant.walletAddressUrl);
    const history = await loadMerchantHistory(
      resolution.walletAddressUrl,
      categoriesNeedingHistory(resolution, mandate.purposePolicy),
      now,
      this.#deps.history,
    );
    const check = evaluatePurposeCheck(mandate, intent, resolution, history);
    const stops = check.enforced && check.outcome !== "ALLOW";
    return {
      ok: true,
      preview: {
        ...base,
        mandateRules: { passed: true, reasonCodes: [] },
        purposeCheck: purposeCheckView(check),
        merchantCategories: resolution.categories.map(({ category, trustLevel }) => ({ category, trustLevel })),
        next: stops ? (check.outcome === "DENY" ? "STOP_DENY" : "STOP_REVIEW") : "QUOTE",
        pendingChecks: stops
          ? []
          : mandate.purposePolicy.merchantConfidence.maxDebitBelowHigh
            ? ["BUDGET", "CONFIDENCE_CAP"]
            : ["BUDGET"],
      },
    };
  }

  /**
   * Runs one purchase through `purchaseUnderMandate`: policy first, Open
   * Payments only after the checks pass, `createOutgoingPayment` only after
   * ALLOW. Every attempt is written to the spending log the payer reads.
   * The same idempotency key returns the first attempt instead of paying again.
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
    const fingerprint = JSON.stringify([request.mandateId, request.merchantId, request.amount, request.lines]);

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
    if (!settled.ok && settled.code !== "PAYMENT_OUTCOME_UNKNOWN" && settled.code !== "IDEMPOTENCY_KEY_REUSED") {
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
    const { mandate, merchant } = prepared;
    const merchantView = { id: merchant.id, displayName: merchant.displayName };

    // An attempt from before a restart is in the spending log.
    const recorded = (await this.#deps.spending.listByMandate(mandate.id)).find(
      (record) => record.purchaseIntentId === intentId,
    );
    if (recorded) {
      const same =
        recorded.merchantWalletAddressUrl === merchant.walletAddressUrl &&
        recorded.requestedAmount.value === request.amount.value &&
        recorded.requestedAmount.assetCode === request.amount.assetCode;
      if (!same) return failure("IDEMPOTENCY_KEY_REUSED", "This key was already used for a different purchase.");
      markReplayed();
      return { ok: true, purchase: purchaseView(recorded, merchantView) };
    }

    const payer = await this.#deps.parties.getById(mandate.payer.id);
    if (!payer?.walletAddressUrl) {
      return failure("PAYER_WALLET_NOT_CONFIGURED", "The payer has no Open Payments wallet configured.");
    }
    // An ACTIVE mandate always has the payer's consented grant. Fail closed if it doesn't.
    if (mandate.status === "ACTIVE" && (await this.#deps.grants.get(mandate.id))?.state !== "ACTIVE") {
      return failure("GRANT_NOT_ACTIVE", "The payer's wallet has no active permission for this budget.");
    }

    const now = this.#now();
    let reachedPayment = false;
    const payments: DelegatePurchaseDeps["payments"] = {
      createIncomingPayment: (input) => this.#deps.payments.createIncomingPayment(input),
      createQuote: (input) => this.#deps.payments.createQuote(input),
      createOutgoingPayment: (input) => {
        reachedPayment = true;
        return this.#deps.payments.createOutgoingPayment(input);
      },
    };

    try {
      const { record } = await purchaseUnderMandate(
        { mandate, intent: this.#intent(actor, request, intentId, merchant, now), payerWalletAddressUrl: payer.walletAddressUrl },
        {
          merchants: this.#deps.registry,
          payments,
          spending: this.#deps.spending,
          history: this.#deps.history,
          capacity: this.#deps.capacity,
          ...(this.#deps.confirmation ? { confirmation: this.#deps.confirmation } : {}),
          now: () => now,
          ...(this.#deps.newId ? { newId: this.#deps.newId } : {}),
        },
      );
      return { ok: true, purchase: purchaseView(record, merchantView) };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      this.#deps.logWarning?.(
        `Purchase ${intentId} on ${mandate.id} failed ${reachedPayment ? "at" : "before"} the outgoing payment: ${typeof code === "string" ? code : "error"}`,
      );
      return reachedPayment
        ? failure(
            "PAYMENT_OUTCOME_UNKNOWN",
            "COMPAS asked the payer's wallet for the payment and got no clear answer. Do not retry: check the budget's activity.",
          )
        : failure("PAYMENT_NOT_STARTED", "The purchase stopped before any payment was requested. Nothing was paid.");
    }
  }
}
