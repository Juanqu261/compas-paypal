import type { Mandate } from "../../domain/mandate.ts";
import type { MerchantObservation } from "../../domain/merchant-history.ts";
import type { MoneyAmount } from "../../domain/money.ts";
import type { SpendingRecord } from "../../domain/spending.ts";
import type { MandateRepository } from "../../ports/mandate-repository.ts";
import type { MerchantObservationLog } from "../../ports/merchant-observation-log.ts";
import type { SpendingLog } from "../../ports/spending-log.ts";
import { DEMO_TIENDA_PAYPAL_ID } from "../merchant-registry/demo-category-seed.ts";
import type { PartyRefFn } from "./party-ref.ts";

/**
 * demo/test data. The tienda de barrio is in no Cámara de Comercio registry
 * and has no wallet KYB. It only self-declares FOOD (demo-category-seed.ts).
 * Its history below is fabricated for the demo.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_PAYERS = 12;
const FIRST_PURCHASE_DAYS_AGO = 90;
const DAYS_BETWEEN_PAYERS = 7;
const TIENDA_NAME = "Tienda Doña Gloria";
const BUDGET: MoneyAmount = { value: "2000", assetCode: "USD", assetScale: 2 };
const PAID: MoneyAmount = { value: "500", assetCode: "USD", assetScale: 2 };

/**
 * Where a persistent database keeps the purchases behind the history. Each
 * observation there must point at a spending record, and each record at a
 * mandate, so the seed writes those too. In memory, observations stand alone.
 */
export type DemoPurchaseStores = {
  mandates: Pick<MandateRepository, "save">;
  spending: Pick<SpendingLog, "append" | "listByMandate">;
};

/** One payer's food mandate and the paid purchase behind its observations. demo/test data. */
function demoPurchase(index: number, recordId: string, paidAt: Date): { mandate: Mandate; record: SpendingRecord } {
  const n = index + 1;
  const mandate: Mandate = {
    id: `demo-food-mandate-${n}`,
    payer: { id: `demo-food-payer-${n}`, displayName: `Demo food payer ${n}`, role: "PAYER" },
    delegate: { id: `demo-food-delegate-${n}`, displayName: `Demo food delegate ${n}`, role: "DELEGATE" },
    beneficiary: { id: `demo-food-beneficiary-${n}`, displayName: `Demo food beneficiary ${n}`, role: "BENEFICIARY" },
    budget: BUDGET,
    remainingAuthorizedAmount: { ...BUDGET, value: (BigInt(BUDGET.value) - BigInt(PAID.value)).toString() },
    purposePolicy: {
      id: "demo-food-policy",
      allowedPurposes: ["FOOD"],
      eligibleCategories: ["FOOD"],
      merchantConfidence: { minimum: "LOW" },
      enforcement: "MONITORED",
    },
    status: "ACTIVE",
    validFrom: new Date(paidAt.getTime() - DAY_MS).toISOString(),
    expiresAt: new Date(paidAt.getTime() + 365 * DAY_MS).toISOString(),
    createdAt: new Date(paidAt.getTime() - DAY_MS).toISOString(),
  };
  const record: SpendingRecord = {
    id: recordId,
    mandateId: mandate.id,
    purchaseIntentId: `${recordId}-intent`,
    paypalMerchantId: DEMO_TIENDA_PAYPAL_ID,
    merchantDisplayName: TIENDA_NAME,
    requestedAmount: PAID,
    decision: { outcome: "ALLOW", reasons: [] },
    purposeCheck: { outcome: "ALLOW", reasons: [], matchedCategories: ["FOOD"], enforced: false },
    merchantCategories: [{ category: "FOOD", trustLevel: "SELF_DECLARED" }],
    lineCategories: ["FOOD"],
    hasUncategorizedLines: false,
    monitoredException: false,
    // Not PayPal orders: references that name no PayPal resource.
    paypal: {
      orderId: `DEMOTIENDA${String(n).padStart(4, "0")}`,
      captureId: `DEMOTIENDACAPTURE${String(n).padStart(4, "0")}`,
      state: "COMPLETED",
    },
    recordedAt: paidAt.toISOString(),
  };
  return { mandate, record };
}

/**
 * Twelve simulated payers, a week apart over the last 90 days, each paid one
 * food purchase at the tienda under a MONITORED food budget and then confirmed
 * it. That is ESTABLISHED history: with only a self-declaration it reaches
 * MEDIUM confidence, never HIGH.
 */
export async function seedDemoMerchantHistory(options: {
  observations: MerchantObservationLog;
  partyRef: PartyRefFn;
  now?: Date;
  /** Required with a persistent observation log. See DemoPurchaseStores. */
  purchases?: DemoPurchaseStores;
}): Promise<number> {
  const now = (options.now ?? new Date()).getTime();
  const seeded: MerchantObservation[] = [];
  const purchases: ReturnType<typeof demoPurchase>[] = [];

  for (let index = 0; index < DEMO_PAYERS; index += 1) {
    const recordId = `demo-tienda-purchase-${index + 1}`;
    const paidAt = new Date(now - (FIRST_PURCHASE_DAYS_AGO - index * DAYS_BETWEEN_PAYERS) * DAY_MS);
    const payerRef = options.partyRef(`demo-food-payer-${index + 1}`);
    purchases.push(demoPurchase(index, recordId, paidAt));
    seeded.push(
      {
        type: "PAID",
        id: `${recordId}:paid`,
        spendingRecordId: recordId,
        paypalMerchantId: DEMO_TIENDA_PAYPAL_ID,
        payerRef,
        delegateRef: options.partyRef(`demo-food-delegate-${index + 1}`),
        mandateCategories: ["FOOD"],
        lineCategories: ["FOOD"],
        hasUncategorizedLines: false,
        enforcement: "MONITORED",
        paymentState: "COMPLETED",
        observedAt: paidAt.toISOString(),
      },
      {
        type: "PAYER_VERDICT",
        id: `${recordId}:verdict`,
        spendingRecordId: recordId,
        paypalMerchantId: DEMO_TIENDA_PAYPAL_ID,
        payerRef,
        verdict: "MATCH",
        observedAt: new Date(paidAt.getTime() + DAY_MS).toISOString(),
      },
    );
  }

  // Written in order, so the last observation present means an earlier start
  // finished. Otherwise resume: a start can stop halfway, and a persistent log keeps the half.
  const last = seeded[seeded.length - 1];
  if (await options.observations.findVerdict(last.spendingRecordId)) return 0;

  if (options.purchases) {
    for (const { mandate, record } of purchases) {
      await options.purchases.mandates.save(mandate);
      const recorded = await options.purchases.spending.listByMandate(mandate.id);
      if (!recorded.some((existing) => existing.id === record.id)) await options.purchases.spending.append(record);
    }
  }
  let appended = 0;
  for (const observation of seeded) {
    const present = observation.type === "PAID"
      ? await options.observations.findPaid(observation.spendingRecordId)
      : await options.observations.findVerdict(observation.spendingRecordId);
    if (present) continue;
    await options.observations.append(observation);
    appended += 1;
  }
  return appended;
}
