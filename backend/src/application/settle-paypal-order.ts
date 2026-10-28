import type { Mandate } from "../domain/mandate.ts";
import type { PaymentFailureCode, PaymentState, SpendingRecord } from "../domain/spending.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { PartyDirectory } from "../ports/party-directory.ts";
import type { PayPalGateway, PayPalOrder } from "../ports/paypal-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import { type MerchantHistoryDeps, recordPaidPurchase } from "./merchant-history.ts";
import { formatAmount, logger } from "../lib/log.ts";

const log = logger("settlement");

/** What a settlement step left the payment in. UNKNOWN_ORDER: no COMPAS purchase has that PayPal order. */
export type SettlementResult = PaymentState | "UNKNOWN_ORDER";

export type SettlementOutcome = { result: SettlementResult; mandateId?: string };

export type PayPalSettlementDeps = {
  payments: Pick<PayPalGateway, "getOrder" | "captureOrder">;
  spending: Pick<SpendingLog, "findByPayPalOrderId" | "transitionPayment" | "listByMandate">;
  /** The mandate is read again before every capture, and its capacity is given back when nothing is paid. */
  mandates: Pick<MandateRepository, "getById" | "releaseCapacity">;
  /** The payer's `paypalPayerId`, when set, is the only account whose approval COMPAS captures. */
  parties: Pick<PartyDirectory, "getById">;
  /** A captured order joins the merchant's history. */
  history: Pick<MerchantHistoryDeps, "observations" | "partyRef">;
  /** An errand's units held by a purchase are given back with its capacity. */
  errands?: Pick<ErrandRepository, "release">;
  now?: () => Date;
  logWarning?: (message: string) => void;
};

const AWAITING: readonly PaymentState[] = ["AWAITING_PAYER_APPROVAL"];

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

function sameAmount(order: PayPalOrder, record: SpendingRecord): boolean {
  const amount = order.amount;
  const expected = record.requestedAmount;
  return Boolean(
    amount &&
      amount.assetCode === expected.assetCode &&
      amount.assetScale === expected.assetScale &&
      BigInt(amount.value) === BigInt(expected.value),
  );
}

/**
 * Settles an allowed purchase's PayPal order after the payer acted at PayPal.
 * It is the only caller of `captureOrder`, and it captures only when:
 *
 * - the purchase is still waiting for the payer, so a second return captures nothing new;
 * - the mandate is still ACTIVE and inside its window, so a revocation while
 *   the payer was at PayPal stops the payment;
 * - PayPal says the payer approved the order;
 * - the order still pays this merchant this amount for this decision;
 * - the approving account is the payer's, when the payer's PayPal id is known.
 *
 * Anything else closes the purchase unpaid and gives its capacity back.
 * Each state change is one conditional transition in the spending log: only
 * the caller that wins it releases capacity or records history.
 */
export class PayPalOrderSettlement {
  readonly #deps: PayPalSettlementDeps;

  constructor(deps: PayPalSettlementDeps) {
    this.#deps = deps;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  /** Nothing was paid: the mandate's capacity and any errand units go back. */
  async #release(record: SpendingRecord): Promise<void> {
    await this.#deps.mandates.releaseCapacity(record.mandateId, record.requestedAmount);
    await this.#deps.errands?.release(record.id);
  }

  /** PayPal sent the payer back after approval. */
  async approved(orderId: string): Promise<SettlementOutcome> {
    const record = await this.#deps.spending.findByPayPalOrderId(orderId);
    if (!record) {
      log.warn("payer returned with an unknown order", { orderId });
      return { result: "UNKNOWN_ORDER" };
    }
    log.info("payer returned from PayPal", { orderId, decisionId: record.id, state: record.paypal.state });
    return { result: await this.#settle(record), mandateId: record.mandateId };
  }

  /** PayPal sent the payer back after "Cancel and return". */
  async cancelled(orderId: string): Promise<SettlementOutcome> {
    const record = await this.#deps.spending.findByPayPalOrderId(orderId);
    if (!record) {
      log.warn("payer cancelled an unknown order", { orderId });
      return { result: "UNKNOWN_ORDER" };
    }
    log.info("payer cancelled at PayPal", { orderId, decisionId: record.id, state: record.paypal.state });
    if (record.paypal.state !== "AWAITING_PAYER_APPROVAL") {
      return { result: record.paypal.state ?? "FAILED", mandateId: record.mandateId };
    }
    // PayPal's word wins over the redirect: an order it holds as approved is settled, not cancelled.
    const order = await this.#deps.payments.getOrder(orderId).catch(() => undefined);
    if (order && (order.status === "APPROVED" || order.status === "COMPLETED")) {
      return { result: await this.#settle(record), mandateId: record.mandateId };
    }
    const moved = await this.#deps.spending.transitionPayment(record.id, AWAITING, { state: "CANCELLED" });
    if (moved) {
      await this.#release(record);
      log.info("purchase cancelled, capacity released", {
        decisionId: record.id,
        mandateId: record.mandateId,
        amount: formatAmount(record.requestedAmount),
      });
    }
    return { result: moved?.paypal.state ?? (await this.#current(record)), mandateId: record.mandateId };
  }

  /**
   * Reconciles the mandate's open orders with PayPal: captures one the payer
   * approved but whose return never reached COMPAS, closes one PayPal
   * expired, and completes a pending capture. A failed read leaves the order
   * as it was for the next refresh.
   */
  async refresh(mandateId: string): Promise<void> {
    const records = await this.#deps.spending.listByMandate(mandateId);
    const open = records.filter((record) => record.paypal.state === "AWAITING_PAYER_APPROVAL" || record.paypal.state === "PENDING");
    if (open.length > 0) log.debug("reconciling open orders", { mandateId, open: open.length });
    for (const record of records) {
      try {
        if (record.paypal.state === "AWAITING_PAYER_APPROVAL") await this.#settle(record);
        else if (record.paypal.state === "PENDING") await this.#settlePending(record);
      } catch (error) {
        this.#deps.logWarning?.(
          `PayPal order of ${record.id} not reconciled: ${errorCode(error) ?? "error"}. It stays ${record.paypal.state}.`,
        );
      }
    }
  }

  async #current(record: SpendingRecord): Promise<SettlementResult> {
    const current = record.paypal.orderId
      ? await this.#deps.spending.findByPayPalOrderId(record.paypal.orderId)
      : undefined;
    return current?.paypal.state ?? "FAILED";
  }

  #usable(mandate: Mandate | undefined): mandate is Mandate {
    const now = this.#now().getTime();
    return Boolean(
      mandate &&
        mandate.status === "ACTIVE" &&
        now >= Date.parse(mandate.validFrom) &&
        now < Date.parse(mandate.expiresAt),
    );
  }

  async #fail(record: SpendingRecord, failureCode: PaymentFailureCode): Promise<SettlementResult> {
    const moved = await this.#deps.spending.transitionPayment(record.id, AWAITING, { state: "FAILED", failureCode });
    if (!moved) return this.#current(record);
    await this.#release(record);
    this.#deps.logWarning?.(
      `PayPal order of ${record.id} closed unpaid: ${failureCode}. ${formatAmount(record.requestedAmount)} of capacity released.`,
    );
    return "FAILED";
  }

  async #settle(record: SpendingRecord): Promise<SettlementResult> {
    const orderId = record.paypal.orderId;
    if (record.paypal.state !== "AWAITING_PAYER_APPROVAL" || !orderId) return record.paypal.state ?? "FAILED";

    const mandate = await this.#deps.mandates.getById(record.mandateId);
    if (!this.#usable(mandate)) return this.#fail(record, "MANDATE_NOT_USABLE");

    let order: PayPalOrder;
    try {
      order = await this.#deps.payments.getOrder(orderId);
    } catch (error) {
      if (errorCode(error) === "NOT_FOUND") return this.#fail(record, "ORDER_EXPIRED");
      throw error;
    }
    log.debug("PayPal order read", { decisionId: record.id, orderId, status: order.status });
    if (order.status === "VOIDED") return this.#fail(record, "ORDER_EXPIRED");
    if (order.status === "COMPLETED") return this.#recordCapture(record, mandate, order);
    if (order.status !== "APPROVED") return "AWAITING_PAYER_APPROVAL";

    if (order.payeeMerchantId !== record.paypalMerchantId || !sameAmount(order, record) || order.customId !== record.id) {
      return this.#fail(record, "ORDER_MISMATCH");
    }
    const payerPayPalId = (await this.#deps.parties.getById(mandate.payer.id))?.paypalPayerId;
    if (payerPayPalId && order.payerId !== payerPayPalId) return this.#fail(record, "PAYER_ACCOUNT_MISMATCH");

    let captured: PayPalOrder;
    try {
      // The same request id returns the first capture, so a retried return never pays twice.
      log.info("checks passed, capturing", { decisionId: record.id, orderId });
      captured = await this.#deps.payments.captureOrder({ orderId, requestId: `${record.id}-capture` });
    } catch (error) {
      const code = errorCode(error);
      if (code === "ORDER_ALREADY_CAPTURED") captured = await this.#deps.payments.getOrder(orderId);
      else if (code === "INSTRUMENT_DECLINED") return this.#fail(record, "CAPTURE_DECLINED");
      // No clear answer: the order stays AWAITING, and the next refresh reads it from PayPal.
      else throw error;
    }
    return this.#recordCapture(record, mandate, captured);
  }

  async #recordCapture(record: SpendingRecord, mandate: Mandate, order: PayPalOrder): Promise<SettlementResult> {
    const status = order.capture?.status;
    if (status === "DECLINED" || status === "FAILED") return this.#fail(record, "CAPTURE_DECLINED");
    const state: PaymentState | undefined =
      status === "PENDING" ? "PENDING" : status === undefined ? undefined : "COMPLETED";
    if (!state || !order.capture) {
      this.#deps.logWarning?.(`PayPal order of ${record.id} is ${order.status} with no capture. It stays waiting.`);
      return "AWAITING_PAYER_APPROVAL";
    }

    const moved = await this.#deps.spending.transitionPayment(record.id, AWAITING, {
      state,
      captureId: order.capture.id,
    });
    if (!moved) return this.#current(record);
    log.info(state === "COMPLETED" ? "payment captured" : "capture pending at PayPal", {
      decisionId: record.id,
      mandateId: record.mandateId,
      orderId: order.id,
      captureId: order.capture.id,
      amount: formatAmount(record.requestedAmount),
    });
    await recordPaidPurchase(
      { record: moved, mandate, paymentState: state, observedAt: this.#now() },
      this.#deps.history,
    );
    return state;
  }

  async #settlePending(record: SpendingRecord): Promise<void> {
    if (!record.paypal.orderId) return;
    const order = await this.#deps.payments.getOrder(record.paypal.orderId);
    const status = order.capture?.status;
    if (status === "COMPLETED" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED") {
      const moved = await this.#deps.spending.transitionPayment(record.id, ["PENDING"], { state: "COMPLETED" });
      if (moved) log.info("pending capture completed", { decisionId: record.id, orderId: record.paypal.orderId });
    } else if (status === "DECLINED" || status === "FAILED") {
      const moved = await this.#deps.spending.transitionPayment(record.id, ["PENDING"], {
        state: "FAILED",
        failureCode: "CAPTURE_DECLINED",
      });
      if (moved) {
        await this.#release(record);
        log.warn("pending capture declined, capacity released", { decisionId: record.id, orderId: record.paypal.orderId });
      }
    }
  }
}
