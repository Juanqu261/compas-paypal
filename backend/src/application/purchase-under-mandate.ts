import { randomUUID } from "node:crypto";
import type { Mandate } from "../domain/mandate.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { MerchantCategoryResolution } from "../domain/merchant-category.ts";
import type { PolicyDecision, PurposeCheck } from "../domain/policy-decision.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import type {
  IncomingPaymentRef,
  OpenPaymentsGateway,
  OutgoingPaymentRef,
  QuoteRef,
} from "../ports/open-payments-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import {
  applyConfidenceCap,
  checkBudget,
  checkMandateRules,
  composeDecision,
  evaluatePurposeCheck,
} from "../policy/evaluate-purchase.ts";
import { categoriesNeedingHistory } from "../policy/merchant-category-evidence.ts";
import { createOutgoingPaymentIfAllowed } from "./create-outgoing-payment-if-allowed.ts";
import { loadMerchantHistory, type MerchantHistoryDeps, recordPaidPurchase } from "./merchant-history.ts";

/** An unused incoming payment at the merchant expires on its own. No money moves. */
const INCOMING_PAYMENT_TTL_MS = 10 * 60 * 1000;

export type PurchaseUnderMandateInput = {
  mandate: Mandate;
  intent: PurchaseIntent;
  /** The wallet the payer consented on. The grant is keyed by the mandate id. */
  payerWalletAddressUrl: string;
};

export type PurchaseUnderMandateDeps = {
  merchants: MerchantRegistry;
  payments: Pick<OpenPaymentsGateway, "createIncomingPayment" | "createQuote" | "createOutgoingPayment">;
  spending: SpendingLog;
  /** The observation log and the trust matrix. History is read at decision time and written after payment. */
  history: MerchantHistoryDeps;
  /**
   * Where the mandate's remaining capacity lives. With it, an ALLOW reserves
   * the quoted debit before it is recorded. Without it, the caller tracks capacity.
   */
  capacity?: Pick<MandateRepository, "reserveCapacity" | "releaseCapacity">;
  /** With it, a PENDING payment is read again until the payer's wallet settles it. */
  confirmation?: PaymentConfirmation;
  now?: () => Date;
  newId?: () => string;
};

/**
 * A new outgoing payment is usually PENDING: the wallet has not sent it yet.
 * The flow reads it again, up to `attempts` times, so the answer can say
 * COMPLETED once the wallet does. A failed read keeps the last known state:
 * the payment exists either way, so the purchase never fails here.
 */
export type PaymentConfirmation = {
  read: OpenPaymentsGateway["readOutgoingPayment"];
  attempts: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
  logWarning?: (message: string) => void;
};

async function confirmPayment(
  grantKey: string,
  payment: OutgoingPaymentRef,
  confirmation: PaymentConfirmation,
): Promise<OutgoingPaymentRef> {
  const sleep = confirmation.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let current = payment;
  for (let attempt = 0; attempt < confirmation.attempts && current.state === "PENDING"; attempt += 1) {
    await sleep(confirmation.intervalMs);
    try {
      current = await confirmation.read({ grantKey, outgoingPaymentUrl: payment.url });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      confirmation.logWarning?.(
        `Reading outgoing payment for ${grantKey} failed: ${typeof code === "string" ? code : "error"}. Keeping ${current.state}.`,
      );
      break;
    }
  }
  return current;
}

export type PurchaseUnderMandateResult = {
  decision: PolicyDecision;
  record: SpendingRecord;
  /** Present only after ALLOW. */
  payment?: OutgoingPaymentRef;
};

/**
 * COMPAS on top of Open Payments, one purchase:
 *
 * 1. Mandate rules (status, validity, delegate). A failure stops here, before any Open Payments call.
 * 2. Merchant categories from the trust log and history from the observation log,
 *    through the trust matrix, then the purpose checks.
 *    ENFORCED: a failure stops here too. MONITORED: the result is recorded and the flow goes on.
 * 3. Open Payments: an incoming payment on the merchant's wallet and a quote from the payer's wallet.
 *    Neither moves money.
 * 4. Budget against the quoted debit, and the mandate's cap for a merchant below HIGH confidence.
 * 5. One decision. Only ALLOW reaches createOutgoingPaymentIfAllowed, which spends the payer's grant.
 *
 * Every attempt is written to the spending log, allowed or not. A paid one is
 * also written to the observation log, so the payer can confirm it later.
 *
 * With `capacity`, an ALLOW reserves the quoted debit before it is recorded.
 * If another purchase used the capacity first, the decision becomes
 * DENY BUDGET_EXCEEDED. If creating the outgoing payment throws, the
 * reservation is given back.
 */
export async function purchaseUnderMandate(
  input: PurchaseUnderMandateInput,
  deps: PurchaseUnderMandateDeps,
): Promise<PurchaseUnderMandateResult> {
  const { mandate, intent } = input;
  const now = deps.now?.() ?? new Date();
  const decisionId = deps.newId?.() ?? randomUUID();

  const finish = async (
    hardReasons: Parameters<typeof composeDecision>[0]["hardReasons"],
    context: {
      resolution?: MerchantCategoryResolution;
      purposeCheck?: PurposeCheck;
      incoming?: IncomingPaymentRef;
      quote?: QuoteRef;
      /** The debit to reserve if the decision is ALLOW. */
      reserve?: MoneyAmount;
    },
  ) => {
    const decide = (reasons: Parameters<typeof composeDecision>[0]["hardReasons"]) =>
      composeDecision({
        decisionId,
        mandate,
        intent,
        hardReasons: reasons,
        ...(context.purposeCheck ? { purposeCheck: context.purposeCheck } : {}),
        evaluatedAt: now,
      });
    let decision = decide(hardReasons);
    if (decision.outcome === "ALLOW" && context.reserve && deps.capacity) {
      if (!(await deps.capacity.reserveCapacity(mandate.id, context.reserve))) {
        decision = decide([{
          code: "BUDGET_EXCEEDED",
          message: "The remaining authorized amount no longer covers the quoted debit.",
        }]);
      }
    }
    const record: SpendingRecord = {
      id: decisionId,
      mandateId: mandate.id,
      purchaseIntentId: intent.id,
      merchantWalletAddressUrl: context.resolution?.walletAddressUrl ?? intent.merchantWalletAddressUrl,
      ...(intent.merchantDisplayName ? { merchantDisplayName: intent.merchantDisplayName } : {}),
      requestedAmount: intent.amount,
      ...(context.quote ? { debitAmount: context.quote.debitAmount } : {}),
      decision: { outcome: decision.outcome, reasons: decision.reasons },
      ...(decision.purposeCheck ? { purposeCheck: decision.purposeCheck } : {}),
      merchantCategories: (context.resolution?.categories ?? []).map(({ category, trustLevel }) => ({
        category,
        trustLevel,
      })),
      monitoredException: decision.reasons.some((reason) => reason.code === "PAYER_MONITORED_EXCEPTION"),
      openPayments: {
        ...(context.incoming ? { incomingPaymentUrl: context.incoming.url } : {}),
        ...(context.quote ? { quoteId: context.quote.id } : {}),
      },
      recordedAt: now.toISOString(),
    };
    await deps.spending.append(record);
    return { decision, record };
  };

  const mandateReasons = checkMandateRules(mandate, intent, now);
  if (mandateReasons.length > 0) return finish(mandateReasons, {});

  const resolution = await deps.merchants.resolve(intent.merchantWalletAddressUrl);
  const merchantHistory = await loadMerchantHistory(
    resolution.walletAddressUrl,
    categoriesNeedingHistory(resolution, mandate.purposePolicy),
    now,
    deps.history,
  );
  const purposeCheck = evaluatePurposeCheck(mandate, intent, resolution, merchantHistory);
  if (purposeCheck.enforced && purposeCheck.outcome !== "ALLOW") {
    return finish([], { resolution, purposeCheck });
  }

  const incoming = await deps.payments.createIncomingPayment({
    merchantWalletAddressUrl: resolution.walletAddressUrl,
    incomingAmount: intent.amount,
    expiresAt: new Date(now.getTime() + INCOMING_PAYMENT_TTL_MS).toISOString(),
    metadata: { compasMandateId: mandate.id, externalReference: intent.id },
  });
  const quote = await deps.payments.createQuote({
    payerWalletAddressUrl: input.payerWalletAddressUrl,
    incomingPaymentUrl: incoming.url,
  });

  const { decision, record } = await finish(checkBudget(mandate, quote.debitAmount), {
    resolution,
    purposeCheck: applyConfidenceCap(mandate, purposeCheck, quote.debitAmount),
    incoming,
    quote,
    reserve: quote.debitAmount,
  });

  let payment: OutgoingPaymentRef | undefined;
  try {
    payment = await createOutgoingPaymentIfAllowed(decision.outcome, deps.payments, {
      grantKey: mandate.id,
      quoteId: quote.id,
      metadata: { compasMandateId: mandate.id, compasDecisionId: decision.id },
    });
  } catch (error) {
    if (decision.outcome === "ALLOW") await deps.capacity?.releaseCapacity(mandate.id, quote.debitAmount);
    throw error;
  }
  if (!payment) return { decision, record };
  if (deps.confirmation) payment = await confirmPayment(mandate.id, payment, deps.confirmation);

  const paidRecord = await deps.spending.recordPayment(record.id, {
    outgoingPaymentUrl: payment.url,
    state: payment.state,
  });
  await recordPaidPurchase(
    {
      spendingRecordId: record.id,
      mandate,
      intent,
      merchantWalletAddressUrl: resolution.walletAddressUrl,
      paymentState: payment.state,
      observedAt: now,
    },
    deps.history,
  );
  return { decision, record: paidRecord, payment };
}
