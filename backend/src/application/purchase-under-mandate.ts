import { randomUUID } from "node:crypto";
import type { Mandate } from "../domain/mandate.ts";
import { type CompasCategory, isCompasCategory, type MerchantCategoryResolution } from "../domain/merchant-category.ts";
import type { PolicyDecision, PurposeCheck } from "../domain/policy-decision.ts";
import type { PurchaseIntent } from "../domain/purchase.ts";
import type { SpendingRecord } from "../domain/spending.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import type { PayPalGateway, PayPalOrder } from "../ports/paypal-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import {
  applyConfidenceCap,
  checkBudget,
  checkMandateRules,
  composeDecision,
  evaluatePurposeCheck,
} from "../policy/evaluate-purchase.ts";
import { categoriesNeedingHistory } from "../policy/merchant-category-evidence.ts";
import { checkErrand, type ErrandCheck, type ErrandLine } from "../policy/errand-check.ts";
import { type Errand, errandWindowStart } from "../domain/errand.ts";
import type { ErrandRepository } from "../ports/errand-repository.ts";
import { createPayPalOrderIfAllowed } from "./create-paypal-order-if-allowed.ts";
import { loadMerchantHistory, type MerchantHistoryDeps } from "./merchant-history.ts";
import { formatAmount, logger } from "../lib/log.ts";

const log = logger("policy");

export type PurchaseUnderMandateInput = {
  mandate: Mandate;
  intent: PurchaseIntent;
  /** The errand the purchase is made under, with each cart line's verified CUM. */
  errand?: { errand: Errand; lines: readonly ErrandLine[] };
};

export type PurchaseUnderMandateDeps = {
  merchants: MerchantRegistry;
  payments: Pick<PayPalGateway, "createOrder">;
  spending: SpendingLog;
  /** The observation log and the trust matrix. History is read at decision time. */
  history: MerchantHistoryDeps;
  /**
   * Where the mandate's remaining capacity lives. With it, an ALLOW reserves
   * the charge before it is recorded. Without it, the caller tracks capacity.
   */
  capacity?: Pick<MandateRepository, "reserveCapacity" | "releaseCapacity">;
  /** Required when the input names an errand. An ALLOW reserves the cart's units there, after the capacity. */
  errands?: Pick<ErrandRepository, "usage" | "reserve" | "release">;
  now?: () => Date;
  newId?: () => string;
};

export type PurchaseUnderMandateResult = {
  decision: PolicyDecision;
  record: SpendingRecord;
  /** Present only after ALLOW. It waits for the payer's approval at PayPal: no money has moved. */
  order?: PayPalOrder;
};

/** What the cart's lines were, in COMPAS categories. Never a description. */
export function summarizeLines(intent: PurchaseIntent): Pick<SpendingRecord, "lineCategories" | "hasUncategorizedLines"> {
  const lineCategories = new Set<CompasCategory>();
  let hasUncategorizedLines = false;
  for (const line of intent.lineItems) {
    if (isCompasCategory(line.category)) lineCategories.add(line.category);
    else hasUncategorizedLines = true;
  }
  return { lineCategories: [...lineCategories], hasUncategorizedLines };
}

/**
 * COMPAS on top of PayPal, one purchase:
 *
 * 1. Mandate rules (status, validity, delegate). A failure stops here, before any PayPal call.
 * 2. Merchant categories from the trust log and history from the observation log,
 *    through the trust matrix, then the purpose checks.
 *    ENFORCED: a failure stops here too. MONITORED: the result is recorded and the flow goes on.
 * 3. Budget against the charge, and the mandate's cap for a merchant below HIGH confidence.
 *    Under an errand: every line must be a verified CUM on the errand, within
 *    its units and amount. An errand that is not the delegate's denies; a
 *    cart that doesn't fit holds (REVIEW, even under MONITORED).
 * 4. One decision. Only ALLOW reaches createPayPalOrderIfAllowed, which
 *    creates one PayPal order for exactly this cart, payable to the merchant.
 *
 * The order moves no money. The payer approves it at PayPal, and the
 * settlement (settle-paypal-order.ts) captures it after checking the mandate
 * again. Every attempt is written to the spending log, allowed or not.
 *
 * With `capacity`, an ALLOW reserves the charge before it is recorded. If
 * another purchase used the capacity first, the decision becomes DENY
 * BUDGET_EXCEEDED. Under an errand, the cart's units are reserved next; if
 * another purchase used them first, the capacity is given back and the
 * decision becomes REVIEW ERRAND_MISMATCH. If creating the order throws,
 * both reservations are given back.
 */
export async function purchaseUnderMandate(
  input: PurchaseUnderMandateInput,
  deps: PurchaseUnderMandateDeps,
): Promise<PurchaseUnderMandateResult> {
  const { mandate, intent } = input;
  const now = deps.now?.() ?? new Date();
  const decisionId = deps.newId?.() ?? randomUUID();

  type Reasons = Parameters<typeof composeDecision>[0]["hardReasons"];
  const finish = async (
    hardReasons: Reasons,
    context: { resolution?: MerchantCategoryResolution; purposeCheck?: PurposeCheck; holdReasons?: Reasons },
  ) => {
    const decide = (reasons: Reasons, holds: Reasons = context.holdReasons ?? []) =>
      composeDecision({
        decisionId,
        mandate,
        intent,
        hardReasons: reasons,
        holdReasons: holds,
        ...(context.purposeCheck ? { purposeCheck: context.purposeCheck } : {}),
        evaluatedAt: now,
      });
    let decision = decide(hardReasons);
    if (decision.outcome === "ALLOW" && deps.capacity) {
      if (!(await deps.capacity.reserveCapacity(mandate.id, intent.amount))) {
        decision = decide([{
          code: "BUDGET_EXCEEDED",
          message: "The remaining authorized amount no longer covers the charge.",
        }]);
      }
    }
    if (decision.outcome === "ALLOW" && input.errand && errandCheck?.usage) {
      const reserved = await errands!.reserve(
        { decisionId, errandId: input.errand.errand.id, usage: errandCheck.usage, reservedAt: now.toISOString() },
        errandWindowStart(input.errand.errand, now),
      );
      if (!reserved) {
        await deps.capacity?.releaseCapacity(mandate.id, intent.amount);
        decision = decide([], [{
          code: "ERRAND_MISMATCH",
          message: "Another purchase used what was left of the errand first.",
        }]);
      }
    }
    const record: SpendingRecord = {
      id: decisionId,
      mandateId: mandate.id,
      purchaseIntentId: intent.id,
      paypalMerchantId: context.resolution?.paypalMerchantId ?? intent.paypalMerchantId,
      ...(intent.merchantDisplayName ? { merchantDisplayName: intent.merchantDisplayName } : {}),
      requestedAmount: intent.amount,
      decision: { outcome: decision.outcome, reasons: decision.reasons },
      ...(decision.purposeCheck ? { purposeCheck: decision.purposeCheck } : {}),
      merchantCategories: (context.resolution?.categories ?? []).map(({ category, trustLevel }) => ({
        category,
        trustLevel,
      })),
      ...summarizeLines(intent),
      monitoredException: decision.reasons.some((reason) => reason.code === "PAYER_MONITORED_EXCEPTION"),
      paypal: {},
      recordedAt: now.toISOString(),
    };
    await deps.spending.append(record);
    const level = decision.outcome === "ALLOW" ? "info" : "warn";
    log[level](`decision ${decision.outcome}`, {
      decisionId,
      mandateId: mandate.id,
      merchant: record.paypalMerchantId,
      amount: formatAmount(intent.amount),
      enforcement: mandate.purposePolicy.enforcement,
      reasons: decision.reasons.map((reason) => reason.code).join(","),
      errand: input.errand?.errand.id,
    });
    return { decision, record };
  };

  const errands = deps.errands;
  let errandCheck: ErrandCheck | undefined;
  if (input.errand) {
    if (!errands) throw new Error("A purchase under an errand needs the errand repository.");
    const { errand } = input.errand;
    const used = (await errands.usage(errand.id, errandWindowStart(errand, now))) ?? {
      units: errand.items.map(() => 0),
      amount: { ...errand.maxAmount, value: "0" },
    };
    errandCheck = checkErrand({
      errand,
      mandateId: mandate.id,
      delegateId: intent.delegateId,
      lines: input.errand.lines,
      amount: intent.amount,
      used,
      now,
    });
  }

  const mandateReasons = [...checkMandateRules(mandate, intent, now), ...(errandCheck?.hardReasons ?? [])];
  if (mandateReasons.length > 0) return finish(mandateReasons, {});

  const resolution = await deps.merchants.resolve(intent.paypalMerchantId);
  log.debug("merchant categories resolved", {
    decisionId,
    merchant: resolution.paypalMerchantId,
    categories: resolution.categories.map(({ category, trustLevel }) => `${category}:${trustLevel}`).join(","),
  });
  const merchantHistory = await loadMerchantHistory(
    resolution.paypalMerchantId,
    categoriesNeedingHistory(resolution, mandate.purposePolicy),
    now,
    deps.history,
  );
  const purposeCheck = applyConfidenceCap(
    mandate,
    evaluatePurposeCheck(mandate, intent, resolution, merchantHistory),
    intent.amount,
  );
  const { decision, record } = await finish(checkBudget(mandate, intent.amount), {
    resolution,
    purposeCheck,
    holdReasons: errandCheck?.holdReasons ?? [],
  });

  let order: PayPalOrder | undefined;
  try {
    order = await createPayPalOrderIfAllowed(decision.outcome, deps.payments, {
      // A retry of this decision returns the same order instead of a second one.
      requestId: decision.id,
      payeeMerchantId: resolution.paypalMerchantId,
      amount: intent.amount,
      lineAmounts: intent.lineItems.map((line) => line.amount),
      metadata: { compasMandateId: mandate.id, compasDecisionId: decision.id, externalReference: intent.id },
    });
  } catch (error) {
    if (decision.outcome === "ALLOW") {
      await deps.capacity?.releaseCapacity(mandate.id, intent.amount);
      await errands?.release(decision.id);
    }
    throw error;
  }
  if (!order) return { decision, record };
  log.info("PayPal order created, waiting for the payer", { decisionId, orderId: order.id, status: order.status });

  const ordered = await deps.spending.recordOrder(record.id, {
    orderId: order.id,
    ...(order.approvalUrl ? { approvalUrl: order.approvalUrl } : {}),
    state: "AWAITING_PAYER_APPROVAL",
  });
  return { decision, record: ordered, order };
}
