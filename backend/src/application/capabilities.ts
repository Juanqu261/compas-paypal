import { createHash, randomUUID } from "node:crypto";
import type { CarePlan, CarePlanStatus } from "../domain/care-plan.ts";
import { decideCycle, isValidTimeZone, periodIdOf, zonedYmd } from "../domain/care-plan.ts";
import type { Errand } from "../domain/errand.ts";
import {
  canonicalEvidenceBody,
  documentHash,
  evidenceViewStatus,
  extractReceiptText,
  parseStructuredReceipt,
  verifyFulfillment,
  VERIFIER_VERSION,
  type ClaimedItem,
  type EvidenceType,
  type VerificationStatus,
} from "../domain/fulfillment.ts";
import type { MoneyAmount } from "../domain/money.ts";
import { addMoney, zeroMoney } from "../domain/money-math.ts";
import { losartanComparisonFixture, type OfferComparison } from "../domain/offer-comparison.ts";
import { splitBasketFixture, type BasketPartition } from "../domain/basket-partition.ts";
import { decideRefund, type RefundStatus } from "../domain/refund-accounting.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { DelegatePurchaseService } from "./delegate-purchases.ts";
import type { Actor, MandateService } from "./mandates.ts";
import { DEMO_MERCHANT_IDS } from "../integrations/merchants/demo-merchant-directory.ts";

/**
 * The five capabilities, on one visitor's demo. Receipts, comparisons,
 * partitions, refunds and care plans stay in memory with the rest of that
 * demo. A simulated capture is labeled and never claims a PayPal payment.
 * AI is not given a way to capture or refund.
 */

const LOSARTAN_CUM = "19996998-1";
const usd = (value: string): MoneyAmount => ({ value, assetCode: "USD", assetScale: 2 });
const SIMULATED_CAPTURE = usd("1500");
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

export type CapabilityFailure = { ok: false; status: number; error: string; message: string };
export type CapabilitySuccess<T> = { ok: true; value: T };
export type CapabilityResult<T> = CapabilitySuccess<T> | CapabilityFailure;

export type TrackedPurchase = {
  id: string;
  mandateId: string;
  merchantId: string;
  captureId: string;
  paypalOrderId?: string;
  amount: MoneyAmount;
  status: "COMPLETED" | "AWAITING_PAYER_APPROVAL";
  source: "DEMO_SIMULATION" | "PAYPAL";
  cum: string;
  quantity: number;
  /** A simulated capture does not create a PayPal order. */
  paypalOrderCreated: boolean;
  createdAt: string;
};

export type EvidenceRecord = {
  id: string;
  purchaseId: string;
  mandateId: string;
  merchantId: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  evidenceType: EvidenceType;
  submittedAt: string;
  submittedBy: string;
  documentHash: string;
  canonical: string;
  claimedItems: readonly ClaimedItem[];
  verificationStatus: VerificationStatus;
  reasonCodes: readonly string[];
  verifierVersion: string;
  reviewStatus: "NONE" | "REVIEW_REQUIRED";
  reviewedAt?: string;
};

export type RefundRecord = {
  refundId: string;
  paypalRefundId: string;
  paypalCaptureId: string;
  purchaseId: string;
  mandateId: string;
  amount: MoneyAmount;
  currency: string;
  status: RefundStatus;
  requestedAt: string;
  completedAt?: string;
  idempotencyKey: string;
  source: "DEMO_SIMULATION" | "PAYPAL_WEBHOOK";
  capacityRestored: MoneyAmount;
  capacityApplied: boolean;
  reason?: string;
  lastVerifiedAt: string;
};

export type CareCycle = {
  planId: string;
  periodId: string;
  status: "PREPARED" | "CONFIRMED";
  dueDay: number;
  errandId?: string;
  paypalOrderCreated: false;
  createdAt: string;
};

export type AuthoritativeRefund = {
  paypalRefundId: string;
  paypalCaptureId: string;
  amount: MoneyAmount;
  status: "COMPLETED" | "PENDING" | "CANCELLED" | "FAILED";
};

export type CapabilitiesDeps = {
  mandates: Pick<MandateService, "create" | "authorize" | "forParticipant" | "revoke">;
  capacity: Pick<MandateRepository, "getById" | "reserveCapacity" | "releaseCapacity">;
  errands: Pick<ErrandRepository, "create" | "get">;
  purchases: Pick<DelegatePurchaseService, "preview">;
  now?: () => Date;
  newId?: () => string;
  retentionDays?: number;
  /** Test hook. Throws before a refund is stored, so a failed write credits nothing. */
  onBeforeRefundWrite?: () => void;
};

type Story = {
  mandateId: string;
  purchaseId: string;
  carePlanId: string;
  dataLabel: "demo/test data";
};

function fail(status: number, error: string, message: string): CapabilityFailure {
  return { ok: false, status, error, message };
}

export function coveredPurchaseBody(mandateId: string, idempotencyKey: string): Record<string, unknown> {
  const partition = splitBasketFixture();
  return {
    mandateId,
    merchantId: DEMO_MERCHANT_IDS.drogueria,
    amount: partition.totals.eligible,
    lineItems: partition.eligible.map((line) => ({ category: "MEDICATION", amount: line.amount })),
    idempotencyKey,
  };
}

/**
 * What a delegate would send for the covered lines only. The personal lines
 * are absent, so they cannot be paid by the mandate through this body.
 */
export function mixedCartIsNotCovered(body: Record<string, unknown>): boolean {
  const lines = body.lineItems;
  return Array.isArray(lines) && lines.some((line) => {
    const category = (line as { category?: string }).category;
    return category !== "MEDICATION";
  });
}

export class CapabilitiesService {
  readonly #deps: CapabilitiesDeps;
  readonly #purchases = new Map<string, TrackedPurchase>();
  readonly #byCapture = new Map<string, string>();
  readonly #evidence = new Map<string, EvidenceRecord[]>();
  readonly #refunds = new Map<string, RefundRecord>();
  readonly #refundsByPurchase = new Map<string, string[]>();
  readonly #credited = new Set<string>();
  readonly #plans = new Map<string, CarePlan>();
  readonly #cycles = new Map<string, CareCycle>();
  readonly #pendingRefunds: AuthoritativeRefund[] = [];
  /** Applied webhook ids. A failure is removed so PayPal can deliver the event again. Process memory only. */
  readonly #events = new Map<string, "processing" | "applied">();
  readonly #locks = new Map<string, Promise<unknown>>();
  #story: Story | undefined;
  #ids = 0;

  constructor(deps: CapabilitiesDeps) {
    this.#deps = deps;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  #id(prefix: string): string {
    this.#ids += 1;
    return `${prefix}-${this.#deps.newId?.() ?? randomUUID()}-${this.#ids}`;
  }

  async #exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    this.#locks.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  async #access(actor: Actor, mandateId: string) {
    const access = await this.#deps.mandates.forParticipant(actor, mandateId);
    if (!access.ok) return undefined;
    return access;
  }

  /** One simulated story per demo. A second call does not reserve again. */
  async openStory(actor: Actor): Promise<CapabilityResult<{
    story: Story;
    remaining: MoneyAmount;
    comparison: OfferComparison;
    partition: BasketPartition;
    purchase?: TrackedPurchase;
    paypalOrderCreated: false;
  }>> {
    if (this.#story) return this.#storyView();
    const now = this.#now();
    const starts = new Date(now.getTime() - 60_000);
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const created = await this.#deps.mandates.create(actor, {
      delegateId: "demo-delegate-andrea",
      beneficiaryId: "demo-beneficiary-gladys",
      categories: ["MEDICATION"],
      budget: usd("4000"),
      validFrom: starts.toISOString(),
      expiresAt: expires.toISOString(),
    });
    if (!created.ok) return fail(400, created.code, created.message);
    const mandateId = created.mandate.id;
    const authorized = await this.#deps.mandates.authorize(actor, mandateId);
    if (!authorized.ok) return fail(400, authorized.code, authorized.message);
    const plan = await this.#createPlan(actor, {
      mandateId,
      name: "Gladys monthly medication",
      productLabel: "Losartan 50 mg",
      authorizedCums: [LOSARTAN_CUM],
      maxAmountPerPeriod: usd("4000"),
      timezone: "America/Bogota",
    });
    if (!plan.ok) return plan;
    this.#story = { mandateId, purchaseId: "", carePlanId: plan.value.plan.id, dataLabel: "demo/test data" };
    return this.#storyView();
  }

  /** Reserves the simulated losartan capture once. It is not a PayPal order. */
  async recordSimulatedCapture(actor: Actor): Promise<CapabilityResult<{ purchase: TrackedPurchase; remaining: MoneyAmount; paypalOrderCreated: false }>> {
    if (!this.#story) return fail(404, "NOT_FOUND", "Open the care story first.");
    const access = await this.#access(actor, this.#story.mandateId);
    if (!access || access.role !== "PAYER") return fail(403, "NOT_THE_PAYER", "The payer's demo records the simulated capture.");
    if (this.#story.purchaseId) {
      const purchase = this.#purchases.get(this.#story.purchaseId);
      const mandate = await this.#deps.capacity.getById(this.#story.mandateId);
      if (!purchase || !mandate) return fail(404, "NOT_FOUND", "The simulated capture is missing.");
      return { ok: true, value: { purchase, remaining: mandate.remainingAuthorizedAmount, paypalOrderCreated: false } };
    }
    const reserved = await this.#deps.capacity.reserveCapacity(this.#story.mandateId, SIMULATED_CAPTURE);
    if (!reserved) return fail(409, "CAPACITY_NOT_RESERVED", "The simulated capture could not reserve capacity.");
    const purchase: TrackedPurchase = {
      id: this.#id("cap"),
      mandateId: this.#story.mandateId,
      merchantId: DEMO_MERCHANT_IDS.drogueria,
      captureId: `SIM${createHash("sha256").update(this.#story.mandateId).digest("hex").slice(0, 16).toUpperCase()}`,
      amount: SIMULATED_CAPTURE,
      status: "COMPLETED",
      source: "DEMO_SIMULATION",
      cum: LOSARTAN_CUM,
      quantity: 1,
      paypalOrderCreated: false,
      createdAt: this.#now().toISOString(),
    };
    this.#purchases.set(purchase.id, purchase);
    this.#byCapture.set(purchase.captureId, purchase.id);
    this.#story.purchaseId = purchase.id;
    const mandate = await this.#deps.capacity.getById(this.#story.mandateId);
    return { ok: true, value: { purchase, remaining: mandate?.remainingAuthorizedAmount ?? usd("0"), paypalOrderCreated: false } };
  }

  async #storyView(): Promise<CapabilityResult<{
    story: Story;
    remaining: MoneyAmount;
    comparison: OfferComparison;
    partition: BasketPartition;
    purchase?: TrackedPurchase;
    paypalOrderCreated: false;
  }>> {
    const story = this.#story;
    if (!story) return fail(404, "NOT_FOUND", "No care story is open.");
    const mandate = await this.#deps.capacity.getById(story.mandateId);
    const purchase = story.purchaseId ? this.#purchases.get(story.purchaseId) : undefined;
    if (!mandate) return fail(404, "NOT_FOUND", "The care story is incomplete.");
    return {
      ok: true,
      value: {
        story,
        remaining: mandate.remainingAuthorizedAmount,
        comparison: losartanComparisonFixture(1, mandate.remainingAuthorizedAmount),
        partition: splitBasketFixture(mandate.remainingAuthorizedAmount),
        ...(purchase ? { purchase } : {}),
        paypalOrderCreated: false as const,
      },
    };
  }

  async storyFor(actor: Actor) {
    if (!this.#story) return fail(404, "NOT_FOUND", "No care story is open.");
    const access = await this.#access(actor, this.#story.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No care story is open.");
    return this.#storyView();
  }

  async previewFixture(actor: Actor, fixture: "medication" | "alcohol"): Promise<CapabilityResult<{
    next: string;
    reasonCodes: readonly string[];
    paypalOrderCreated: false;
    amount: MoneyAmount;
  }>> {
    if (!this.#story) return fail(404, "NOT_FOUND", "Open the care story first.");
    const access = await this.#access(actor, this.#story.mandateId);
    if (!access || access.role !== "DELEGATE") return fail(403, "NOT_THE_DELEGATE", "Andrea previews a purchase.");
    const medication = fixture === "medication";
    const amount = usd("1500");
    const result = await this.#deps.purchases.preview(actor, {
      mandateId: this.#story.mandateId,
      merchantId: medication ? DEMO_MERCHANT_IDS.drogueria : DEMO_MERCHANT_IDS.liquor,
      amount,
      lineItems: [{ category: medication ? "MEDICATION" : "ALCOHOL", amount }],
    });
    if (!result.ok) return fail(400, result.code, result.message);
    const reasonCodes = [
      ...result.preview.mandateRules.reasonCodes,
      ...(result.preview.purposeCheck?.reasonCodes ?? []),
    ];
    return {
      ok: true,
      value: { next: result.preview.next, reasonCodes, paypalOrderCreated: false, amount },
    };
  }

  async previewCovered(actor: Actor): Promise<CapabilityResult<{ next: string; amount: MoneyAmount; paypalOrderCreated: false; lineCount: number }>> {
    if (!this.#story) return fail(404, "NOT_FOUND", "Open the care story first.");
    const access = await this.#access(actor, this.#story.mandateId);
    if (!access || access.role !== "DELEGATE") return fail(403, "NOT_THE_DELEGATE", "Andrea previews the covered lines.");
    const body = coveredPurchaseBody(this.#story.mandateId, "preview-covered-01");
    const result = await this.#deps.purchases.preview(actor, body);
    if (!result.ok) return fail(400, result.code, result.message);
    const lines = body.lineItems as unknown[];
    return {
      ok: true,
      value: {
        next: result.preview.next,
        amount: result.preview.requestedAmount,
        paypalOrderCreated: false,
        lineCount: lines.length,
      },
    };
  }

  compareFixture(): OfferComparison {
    return losartanComparisonFixture();
  }

  partitionFixture(remaining?: MoneyAmount): BasketPartition {
    return splitBasketFixture(remaining);
  }

  async submitEvidence(actor: Actor, input: unknown): Promise<CapabilityResult<{ evidence: EvidenceRecord; duplicate: boolean; paymentStatus: TrackedPurchase["status"] }>> {
    if (!isRecord(input) || typeof input.purchaseId !== "string") return fail(400, "INVALID_INPUT", "purchaseId is required.");
    const purchase = this.#purchases.get(input.purchaseId);
    if (!purchase) return fail(404, "NOT_FOUND", "No such purchase.");
    const access = await this.#access(actor, purchase.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No such purchase.");
    if (purchase.status !== "COMPLETED") return fail(409, "INVALID_PURCHASE_STATE", "Evidence is accepted after the purchase is completed.");
    const parsed = input.text !== undefined ? extractReceiptText(String(input.text)) : parseStructuredReceipt(input.receipt);
    if (!parsed.ok) return fail(400, "MALFORMED", "The receipt could not be read. Nothing was marked verified.");
    const canonical = canonicalEvidenceBody({ merchantId: parsed.merchantId, items: parsed.items, total: parsed.total });
    const hash = documentHash(canonical);
    return this.#exclusive(`evidence:${purchase.id}`, async () => {
      const existing = (this.#evidence.get(purchase.id) ?? []).find((record) => record.documentHash === hash);
      if (existing) {
        return { ok: true as const, value: { evidence: this.#present(existing), duplicate: true, paymentStatus: purchase.status } };
      }
      const verification = verifyFulfillment({
        merchantId: purchase.merchantId,
        lines: [{ cum: purchase.cum, quantity: purchase.quantity, lineTotal: purchase.amount }],
        total: purchase.amount,
        claimedMerchantId: parsed.merchantId,
        claimedItems: parsed.items,
        claimedTotal: parsed.total,
        extractionUncertain: parsed.uncertain,
      });
      const record: EvidenceRecord = {
        id: this.#id("evidence"),
        purchaseId: purchase.id,
        mandateId: purchase.mandateId,
        merchantId: purchase.merchantId,
        ...(purchase.paypalOrderId ? { paypalOrderId: purchase.paypalOrderId } : {}),
        paypalCaptureId: purchase.captureId,
        evidenceType: input.text !== undefined ? "RECEIPT_TEXT" : "STRUCTURED_RECEIPT",
        submittedAt: this.#now().toISOString(),
        submittedBy: actor.partyId,
        documentHash: hash,
        canonical,
        claimedItems: parsed.items,
        verificationStatus: verification.status,
        reasonCodes: verification.reasonCodes,
        verifierVersion: VERIFIER_VERSION,
        reviewStatus: verification.status === "REVIEW_REQUIRED" || verification.status === "MISMATCH" ? "REVIEW_REQUIRED" : "NONE",
      };
      const list = this.#evidence.get(purchase.id) ?? [];
      list.push(record);
      this.#evidence.set(purchase.id, list);
      return { ok: true as const, value: { evidence: this.#present(record), duplicate: false, paymentStatus: purchase.status } };
    });
  }

  async listEvidence(actor: Actor, purchaseId: string): Promise<CapabilityResult<{ evidence: EvidenceRecord[]; paymentStatus: TrackedPurchase["status"]; provesPhysicalDelivery: false }>> {
    const purchase = this.#purchases.get(purchaseId);
    if (!purchase) return fail(404, "NOT_FOUND", "No such purchase.");
    const access = await this.#access(actor, purchase.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No such purchase.");
    const cutoff = this.#now().getTime() - (this.#deps.retentionDays ?? 30) * 24 * 60 * 60 * 1000;
    const evidence = (this.#evidence.get(purchaseId) ?? [])
      .filter((record) => Date.parse(record.submittedAt) >= cutoff)
      .map((record) => this.#present(record));
    return { ok: true, value: { evidence, paymentStatus: purchase.status, provesPhysicalDelivery: false } };
  }

  #present(record: EvidenceRecord): EvidenceRecord {
    const status = evidenceViewStatus(record.verificationStatus, record.documentHash, documentHash(record.canonical));
    if (status === record.verificationStatus) return { ...record };
    return { ...record, verificationStatus: status, reasonCodes: [...record.reasonCodes, "TAMPERED"], reviewStatus: "REVIEW_REQUIRED" };
  }

  /** Test hook: change a stored receipt without updating its hash. */
  tamperEvidenceForTests(evidenceId: string): void {
    for (const list of this.#evidence.values()) {
      const record = list.find((item) => item.id === evidenceId);
      if (record) record.canonical = `${record.canonical} `;
    }
  }

  async simulateRefund(actor: Actor, input: unknown): Promise<CapabilityResult<{ refund: RefundRecord; remaining: MoneyAmount; duplicate: boolean }>> {
    if (!isRecord(input) || typeof input.purchaseId !== "string" || typeof input.idempotencyKey !== "string" || !KEY.test(input.idempotencyKey)) {
      return fail(400, "INVALID_INPUT", "purchaseId and an idempotencyKey of 16 to 64 characters are required.");
    }
    const amount = moneyOf(input.amount);
    if (!amount) return fail(400, "INVALID_AMOUNT", "The refund amount must be minor units.");
    const purchase = this.#purchases.get(input.purchaseId);
    if (!purchase) return fail(404, "NOT_FOUND", "No such purchase.");
    const access = await this.#access(actor, purchase.mandateId);
    if (!access || access.role !== "PAYER") return fail(403, "NOT_THE_PAYER", "The payer reconciles a refund.");
    if (purchase.source !== "DEMO_SIMULATION") return fail(409, "NOT_SIMULATED", "A PayPal capture is refunded from PayPal, then verified. This button does not call PayPal.");
    const fact: AuthoritativeRefund = {
      paypalRefundId: `sim-${input.idempotencyKey}`,
      paypalCaptureId: purchase.captureId,
      amount,
      status: "COMPLETED",
    };
    const applied = await this.applyAuthoritativeRefund(fact, "DEMO_SIMULATION", input.idempotencyKey);
    if (!applied.ok) return applied;
    const mandate = await this.#deps.capacity.getById(purchase.mandateId);
    return { ok: true, value: { refund: applied.value.refund, remaining: mandate?.remainingAuthorizedAmount ?? usd("0"), duplicate: applied.value.duplicate } };
  }

  /**
   * Applies a refund whose amount and status already came from PayPal, or
   * from the simulated path above. Caller-supplied webhook amounts never
   * reach this method until a verifier and a refund read have accepted them.
   */
  async applyAuthoritativeRefund(
    fact: AuthoritativeRefund,
    source: RefundRecord["source"],
    idempotencyKey: string,
  ): Promise<CapabilityResult<{ refund: RefundRecord; duplicate: boolean }>> {
    const purchaseId = this.#byCapture.get(fact.paypalCaptureId);
    if (!purchaseId) {
      this.#pendingRefunds.push(fact);
      return fail(202, "PENDING_CAPTURE", "The capture is not on file yet. The refund is held and applied when it is.");
    }
    return this.#exclusive(`refund:${purchaseId}`, async () => this.#applyLocked(purchaseId, fact, source, idempotencyKey));
  }

  async #applyLocked(
    purchaseId: string,
    fact: AuthoritativeRefund,
    source: RefundRecord["source"],
    idempotencyKey: string,
  ): Promise<CapabilityResult<{ refund: RefundRecord; duplicate: boolean }>> {
    this.#deps.onBeforeRefundWrite?.();
    const existing = this.#refunds.get(fact.paypalRefundId);
    if (existing) {
      if (!existing.capacityApplied && existing.capacityRestored.value !== "0" && !this.#credited.has(fact.paypalRefundId)) {
        await this.#deps.capacity.releaseCapacity(existing.mandateId, existing.capacityRestored);
        this.#credited.add(fact.paypalRefundId);
        existing.capacityApplied = true;
      }
      return { ok: true, value: { refund: existing, duplicate: true } };
    }
    const purchase = this.#purchases.get(purchaseId);
    if (!purchase) return fail(404, "NOT_FOUND", "No such purchase.");
    const mandate = await this.#deps.capacity.getById(purchase.mandateId);
    if (!mandate) return fail(404, "NOT_FOUND", "The mandate is gone.");
    const already = this.#refunded(purchaseId);
    const decision = decideRefund({
      captured: purchase.amount,
      alreadyRefunded: already,
      amount: fact.amount,
      paypalStatus: fact.status,
      mandateStatus: mandate.status,
      mandateExpiresAt: mandate.expiresAt,
      now: this.#now(),
      duplicate: false,
    });
    const now = this.#now().toISOString();
    const record: RefundRecord = {
      refundId: this.#id("refund"),
      paypalRefundId: fact.paypalRefundId,
      paypalCaptureId: fact.paypalCaptureId,
      purchaseId,
      mandateId: purchase.mandateId,
      amount: decision.refundAmount,
      currency: fact.amount.assetCode,
      status: decision.status,
      requestedAt: now,
      ...(decision.status === "COMPLETED" ? { completedAt: now } : {}),
      idempotencyKey,
      source,
      capacityRestored: decision.capacityRestored,
      capacityApplied: false,
      ...(decision.reason ? { reason: decision.reason } : {}),
      lastVerifiedAt: now,
    };
    this.#refunds.set(fact.paypalRefundId, record);
    const ids = this.#refundsByPurchase.get(purchaseId) ?? [];
    ids.push(fact.paypalRefundId);
    this.#refundsByPurchase.set(purchaseId, ids);
    if (decision.capacityRestored.value !== "0") {
      await this.#deps.capacity.releaseCapacity(purchase.mandateId, decision.capacityRestored);
      this.#credited.add(fact.paypalRefundId);
      record.capacityApplied = true;
    }
    return { ok: true, value: { refund: record, duplicate: false } };
  }

  #refunded(purchaseId: string): MoneyAmount {
    const sample = usd("0");
    const amounts = (this.#refundsByPurchase.get(purchaseId) ?? [])
      .map((id) => this.#refunds.get(id))
      .filter((refund): refund is RefundRecord => Boolean(refund && refund.status === "COMPLETED" && refund.amount.value !== "0"))
      .map((refund) => refund.amount);
    return amounts.reduce((sum, amount) => {
      const next = addMoney(sum, amount);
      return next.ok ? next.amount : sum;
    }, sample);
  }

  /** A PayPal capture landed. Applies any refund event that arrived first. */
  async noteCapture(record: SpendingRecord): Promise<void> {
    if (record.paypal.state !== "COMPLETED" || !record.paypal.captureId) return;
    if (this.#byCapture.has(record.paypal.captureId)) return;
    const purchase: TrackedPurchase = {
      id: record.id,
      mandateId: record.mandateId,
      merchantId: record.paypalMerchantId,
      captureId: record.paypal.captureId,
      ...(record.paypal.orderId ? { paypalOrderId: record.paypal.orderId } : {}),
      amount: record.requestedAmount,
      status: "COMPLETED",
      source: "PAYPAL",
      cum: "",
      quantity: 1,
      paypalOrderCreated: true,
      createdAt: record.recordedAt,
    };
    this.#purchases.set(purchase.id, purchase);
    this.#byCapture.set(purchase.captureId, purchase.id);
    const pending = this.#pendingRefunds.filter((refund) => refund.paypalCaptureId === purchase.captureId);
    for (const refund of pending) {
      await this.applyAuthoritativeRefund(refund, "PAYPAL_WEBHOOK", `wh-${refund.paypalRefundId}`);
    }
  }

  /**
   * Claims a webhook id. `applied` means a previous attempt finished.
   * `processing` means another delivery is in flight. A new claim is held
   * until `finishEvent`. This map is process memory: it is not a durable
   * exactly-once store across a server restart.
   */
  claimEvent(eventId: string): "new" | "applied" | "processing" {
    const state = this.#events.get(eventId);
    if (state === "applied" || state === "processing") return state;
    this.#events.set(eventId, "processing");
    return "new";
  }

  /** `applied` keeps the id. A failure drops it so the same event can be retried. */
  finishEvent(eventId: string, applied: boolean): void {
    if (!this.#events.has(eventId)) return;
    if (applied) this.#events.set(eventId, "applied");
    else this.#events.delete(eventId);
  }

  async listRefunds(actor: Actor, purchaseId: string): Promise<CapabilityResult<{ refunds: RefundRecord[]; remaining?: MoneyAmount }>> {
    const purchase = this.#purchases.get(purchaseId);
    if (!purchase) return fail(404, "NOT_FOUND", "No such purchase.");
    const access = await this.#access(actor, purchase.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No such purchase.");
    const mandate = await this.#deps.capacity.getById(purchase.mandateId);
    const refunds = (this.#refundsByPurchase.get(purchaseId) ?? []).map((id) => this.#refunds.get(id)).filter((refund): refund is RefundRecord => Boolean(refund));
    return { ok: true, value: { refunds, ...(mandate ? { remaining: mandate.remainingAuthorizedAmount } : {}) } };
  }

  async #createPlan(actor: Actor, input: {
    mandateId: string;
    name: string;
    productLabel: string;
    authorizedCums: readonly string[];
    maxAmountPerPeriod: MoneyAmount;
    timezone: string;
    endsAt?: string;
  }): Promise<CapabilityResult<{ plan: CarePlan }>> {
    const access = await this.#access(actor, input.mandateId);
    if (!access || access.role !== "PAYER") return fail(403, "NOT_THE_PAYER", "The payer creates a care plan.");
    if (!isValidTimeZone(input.timezone)) return fail(400, "INVALID_TIME_ZONE", "The time zone is not recognized.");
    const now = this.#now();
    const zoned = zonedYmd(now, input.timezone);
    if (!zoned) return fail(400, "INVALID_TIME_ZONE", "The time zone is not recognized.");
    const plan: CarePlan = {
      id: this.#id("care"),
      payerId: access.mandate.payer.id,
      delegateId: access.mandate.delegate.id,
      beneficiaryId: access.mandate.beneficiary.id,
      mandateId: input.mandateId,
      name: input.name,
      purpose: "MEDICATION",
      authorizedCums: input.authorizedCums,
      productLabel: input.productLabel,
      maxAmountPerPeriod: input.maxAmountPerPeriod,
      currency: input.maxAmountPerPeriod.assetCode,
      recurrenceRule: "MONTHLY",
      timezone: input.timezone,
      anchorDay: zoned.day,
      startsAt: now.toISOString(),
      ...(input.endsAt ? { endsAt: input.endsAt } : {}),
      status: "ACTIVE",
      nextDueAt: periodIdOf(zoned.year, zoned.month),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.#plans.set(plan.id, plan);
    return { ok: true, value: { plan } };
  }

  async listPlans(actor: Actor): Promise<CapabilityResult<{ plans: CarePlan[] }>> {
    const plans = [];
    for (const plan of this.#plans.values()) {
      const access = await this.#access(actor, plan.mandateId);
      if (access) plans.push(plan);
    }
    return { ok: true, value: { plans } };
  }

  async getPlan(actor: Actor, planId: string): Promise<CapabilityResult<{ plan: CarePlan; cycles: CareCycle[] }>> {
    const plan = this.#plans.get(planId);
    if (!plan) return fail(404, "NOT_FOUND", "No such care plan.");
    const access = await this.#access(actor, plan.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No such care plan.");
    const cycles = [...this.#cycles.values()].filter((cycle) => cycle.planId === planId);
    return { ok: true, value: { plan, cycles } };
  }

  async setPlanStatus(actor: Actor, planId: string, status: CarePlanStatus): Promise<CapabilityResult<{ plan: CarePlan }>> {
    const plan = this.#plans.get(planId);
    if (!plan) return fail(404, "NOT_FOUND", "No such care plan.");
    const access = await this.#access(actor, plan.mandateId);
    if (!access || access.role !== "PAYER") return fail(403, "NOT_THE_PAYER", "The payer changes the plan.");
    if (plan.status === "REVOKED") return fail(409, "PLAN_REVOKED", "A revoked plan stays revoked.");
    if (status === "ACTIVE" && plan.status !== "PAUSED") return fail(409, "INVALID_STATE", "Only a paused plan can resume.");
    if (status === "PAUSED" && plan.status !== "ACTIVE") return fail(409, "INVALID_STATE", "Only an active plan can pause.");
    plan.status = status;
    plan.updatedAt = this.#now().toISOString();
    return { ok: true, value: { plan } };
  }

  async generateCycle(actor: Actor, planId: string): Promise<CapabilityResult<{ cycle: CareCycle; created: boolean; paypalOrderCreated: false }>> {
    const plan = this.#plans.get(planId);
    if (!plan) return fail(404, "NOT_FOUND", "No such care plan.");
    const access = await this.#access(actor, plan.mandateId);
    if (!access) return fail(404, "NOT_FOUND", "No such care plan.");
    return this.#exclusive(`plan:${planId}`, async () => {
      const existingIds = [...this.#cycles.values()].filter((cycle) => cycle.planId === planId).map((cycle) => cycle.periodId);
      const decision = decideCycle({
        status: plan.status,
        timeZone: plan.timezone,
        startsAt: plan.startsAt,
        ...(plan.endsAt ? { endsAt: plan.endsAt } : {}),
        anchorDay: plan.anchorDay,
        now: this.#now(),
        existingPeriodIds: existingIds,
      });
      if (decision.action === "SKIP") {
        if (decision.reason === "PLAN_ENDED") {
          plan.status = "COMPLETED";
          plan.updatedAt = this.#now().toISOString();
        }
        return fail(409, decision.reason, "No cycle was generated, and no PayPal order was created.");
      }
      const key = `${planId}:${decision.periodId}`;
      const found = this.#cycles.get(key);
      if (found || decision.action === "REPLAY") {
        const cycle = found ?? this.#cycles.get(key);
        if (!cycle) return fail(409, "PLAN_NOT_ACTIVE", "No cycle was generated.");
        return { ok: true, value: { cycle, created: false, paypalOrderCreated: false } };
      }
      const cycle: CareCycle = {
        planId,
        periodId: decision.periodId,
        status: "PREPARED",
        dueDay: decision.dueDay,
        paypalOrderCreated: false,
        createdAt: this.#now().toISOString(),
      };
      this.#cycles.set(key, cycle);
      plan.lastGeneratedPeriod = decision.periodId;
      plan.updatedAt = this.#now().toISOString();
      return { ok: true, value: { cycle, created: true, paypalOrderCreated: false } };
    });
  }

  async confirmCycle(actor: Actor, planId: string, periodId: string): Promise<CapabilityResult<{ cycle: CareCycle; paypalOrderCreated: false }>> {
    const plan = this.#plans.get(planId);
    if (!plan) return fail(404, "NOT_FOUND", "No such care plan.");
    const access = await this.#access(actor, plan.mandateId);
    if (!access || access.role !== "DELEGATE") return fail(403, "NOT_THE_DELEGATE", "The delegate confirms the cycle.");
    if (plan.status !== "ACTIVE") return fail(409, "PLAN_NOT_ACTIVE", "This plan cannot prepare a purchase.");
    const cycle = this.#cycles.get(`${planId}:${periodId}`);
    if (!cycle) return fail(404, "NOT_FOUND", "Generate the cycle first.");
    if (cycle.errandId) return { ok: true, value: { cycle, paypalOrderCreated: false } };
    const mandate = await this.#deps.capacity.getById(plan.mandateId);
    if (!mandate || mandate.status !== "ACTIVE") return fail(409, "MANDATE_NOT_USABLE", "The mandate cannot back this cycle.");
    const remaining = mandate.remainingAuthorizedAmount;
    if (
      remaining.assetCode !== plan.maxAmountPerPeriod.assetCode ||
      remaining.assetScale !== plan.maxAmountPerPeriod.assetScale ||
      BigInt(remaining.value) < BigInt(plan.maxAmountPerPeriod.value)
    ) {
      return fail(409, "INSUFFICIENT_CAPACITY", "The mandate does not have enough capacity for this cycle. No errand was created.");
    }
    const now = this.#now().toISOString();
    const errand: Errand = {
      id: this.#id("errand"),
      mandateId: plan.mandateId,
      delegateId: plan.delegateId,
      kind: "ONE_OFF",
      status: "ACTIVE",
      items: [{ label: plan.productLabel, acceptedCums: plan.authorizedCums, maxUnits: 1 }],
      maxAmount: plan.maxAmountPerPeriod,
      expiresAt: mandate.expiresAt,
      draftedBy: "DELEGATE",
      confirmedAt: now,
      createdAt: now,
    };
    await this.#deps.errands.create(errand);
    cycle.errandId = errand.id;
    cycle.status = "CONFIRMED";
    return { ok: true, value: { cycle, paypalOrderCreated: false } };
  }

  /** The cycles and credited refunds, so a restarted processor does not generate or credit twice. */
  exportState(): string {
    return JSON.stringify({
      story: this.#story ?? null,
      purchases: [...this.#purchases.values()],
      evidence: [...this.#evidence.entries()],
      refunds: [...this.#refunds.values()],
      plans: [...this.#plans.values()],
      cycles: [...this.#cycles.values()],
      credited: [...this.#credited],
      appliedEvents: [...this.#events.entries()].filter((entry) => entry[1] === "applied").map((entry) => entry[0]),
    });
  }

  importState(serialized: string): void {
    const parsed = JSON.parse(serialized) as {
      story: Story | null;
      purchases: TrackedPurchase[];
      evidence: [string, EvidenceRecord[]][];
      refunds: RefundRecord[];
      plans: CarePlan[];
      cycles: CareCycle[];
      credited: string[];
      appliedEvents?: string[];
    };
    this.#story = parsed.story ?? undefined;
    this.#purchases.clear();
    this.#byCapture.clear();
    for (const purchase of parsed.purchases) {
      this.#purchases.set(purchase.id, purchase);
      this.#byCapture.set(purchase.captureId, purchase.id);
    }
    this.#evidence.clear();
    for (const [id, records] of parsed.evidence) this.#evidence.set(id, records);
    this.#refunds.clear();
    this.#refundsByPurchase.clear();
    for (const refund of parsed.refunds) {
      this.#refunds.set(refund.paypalRefundId, refund);
      const ids = this.#refundsByPurchase.get(refund.purchaseId) ?? [];
      ids.push(refund.paypalRefundId);
      this.#refundsByPurchase.set(refund.purchaseId, ids);
    }
    this.#plans.clear();
    for (const plan of parsed.plans) this.#plans.set(plan.id, plan);
    this.#cycles.clear();
    for (const cycle of parsed.cycles) this.#cycles.set(`${cycle.planId}:${cycle.periodId}`, cycle);
    this.#credited.clear();
    for (const id of parsed.credited) this.#credited.add(id);
    this.#events.clear();
    for (const id of parsed.appliedEvents ?? []) this.#events.set(id, "applied");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function moneyOf(value: unknown): MoneyAmount | undefined {
  if (!isRecord(value) || typeof value.value !== "string" || typeof value.assetCode !== "string" || typeof value.assetScale !== "number") {
    return undefined;
  }
  if (!/^(0|[1-9]\d{0,30})$/.test(value.value)) return undefined;
  return { value: value.value, assetCode: value.assetCode, assetScale: value.assetScale };
}

export function zeroCapacity(sample: MoneyAmount = usd("0")): MoneyAmount {
  return zeroMoney(sample);
}
