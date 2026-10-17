import type { MerchantObservation } from "../../domain/merchant-history.ts";
import type { MerchantObservationLog } from "../../ports/merchant-observation-log.ts";
import { DEMO_TIENDA_WALLET } from "../merchant-registry/demo-category-seed.ts";
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
}): Promise<number> {
  const now = (options.now ?? new Date()).getTime();
  const seeded: MerchantObservation[] = [];

  for (let index = 0; index < DEMO_PAYERS; index += 1) {
    const recordId = `demo-tienda-purchase-${index + 1}`;
    const paidAt = new Date(now - (FIRST_PURCHASE_DAYS_AGO - index * DAYS_BETWEEN_PAYERS) * DAY_MS);
    const payerRef = options.partyRef(`demo-food-payer-${index + 1}`);
    seeded.push(
      {
        type: "PAID",
        id: `${recordId}:paid`,
        spendingRecordId: recordId,
        merchantWalletAddressUrl: DEMO_TIENDA_WALLET,
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
        merchantWalletAddressUrl: DEMO_TIENDA_WALLET,
        payerRef,
        verdict: "MATCH",
        observedAt: new Date(paidAt.getTime() + DAY_MS).toISOString(),
      },
    );
  }

  for (const observation of seeded) await options.observations.append(observation);
  return seeded.length;
}
