import type { DemoScenario, DemoScenarioId } from "../../demo/scenarios.ts";
import {
  COMPAS_CATEGORIES,
  type CompasCategory,
  type Money,
  type PurchasePreview,
  type PurchaseView,
} from "../compas/api/contracts.ts";
import { purchaseStatus } from "../compas/lib/labels.ts";

/**
 * SIMULATED: a charge the merchant phone hands to the delegate phone inside
 * this browser, through React state in /demo. Not NFC, not a sync between
 * devices and not stored by the backend: COMPAS has no merchant
 * authentication yet. Andrea's phone sends it as her purchase, and the backend
 * finds the merchant's PayPal account and categories itself. `result` is the
 * backend's answer to Andrea, relayed here so the merchant phone can show it.
 */
export type DemoCharge = {
  id: string;
  scenarioId?: DemoScenarioId;
  merchantId: string;
  merchantDisplayName: string;
  /** The sum of the lines. */
  amount: Money;
  /** Categories and amounts only. Product names stay on the merchant's phone. */
  lineItems: readonly ChargeLine[];
  createdAt: string;
  /** PREVIEW is the backend's check before PayPal, not a decision. */
  result?:
    | { kind: "PREVIEW"; preview: PurchasePreview }
    | { kind: "PURCHASE"; purchase: PurchaseView }
    | { kind: "ERROR"; code: string };
};

export type ChargeLine = { category?: CompasCategory; amount: Money };

function isCategory(value: string): value is CompasCategory {
  return (COMPAS_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A charge from these lines. The amount is their sum, so it always matches
 * what the backend checks. Undefined without a line, or with lines in two assets.
 */
export function buildCharge(
  merchant: { id: string; displayName: string },
  lines: readonly ChargeLine[],
  now = new Date(),
  scenarioId?: DemoScenarioId,
): DemoCharge | undefined {
  const first = lines[0]?.amount;
  if (!first || lines.some((line) => line.amount.assetCode !== first.assetCode || line.amount.assetScale !== first.assetScale)) {
    return undefined;
  }
  const total = lines.reduce((sum, line) => sum + BigInt(line.amount.value), BigInt(0));
  return {
    id: `charge-${now.getTime().toString(36)}`,
    ...(scenarioId ? { scenarioId } : {}),
    merchantId: merchant.id,
    merchantDisplayName: merchant.displayName,
    amount: { ...first, value: total.toString() },
    lineItems: lines.map((line) => ({ ...(line.category ? { category: line.category } : {}), amount: line.amount })),
    createdAt: now.toISOString(),
  };
}

/** The lines of a scenario fixture, without their product names. demo/test data. */
export function scenarioLines(scenario: DemoScenario): ChargeLine[] {
  return scenario.purchaseIntent.lineItems.map((line) => ({
    ...(isCategory(line.category) ? { category: line.category } : {}),
    amount: line.amount,
  }));
}

export type MerchantChargeTone = "wait" | "ok" | "stop";

/**
 * What the merchant's phone says about its charge. It follows the backend's
 * answer to the customer and never says "Pago realizado" before PayPal
 * captured the payment.
 */
export function merchantChargeStatus(charge: Pick<DemoCharge, "result">): { title: string; tone: MerchantChargeTone } {
  const result = charge.result;
  if (!result) return { title: "Waiting for the customer", tone: "wait" };
  if (result.kind === "PREVIEW") {
    if (result.preview.next === "STOP_DENY") return { title: "Purchase not allowed", tone: "stop" };
    if (result.preview.next === "STOP_REVIEW") return { title: "Held for review", tone: "wait" };
    return result.preview.execution === "ENABLED"
      ? { title: "Waiting for confirmation", tone: "wait" }
      : { title: "Fits the rules. Payments off in this demo", tone: "wait" };
  }
  if (result.kind === "ERROR") {
    if (result.code === "PURCHASES_DISABLED_FOR_DEMO") return { title: "Payments off in this demo", tone: "wait" };
    return { title: "Could not complete", tone: "stop" };
  }
  const payment = result.purchase.payment;
  if (payment.status === "CREATED" && payment.state === "AWAITING_PAYER_APPROVAL") {
    return { title: "Waiting for the payer to approve", tone: "wait" };
  }
  const status = purchaseStatus(result.purchase);
  if (status.tone === "stop" && result.purchase.outcome === "ALLOW") return { title: "Could not complete", tone: "stop" };
  return { title: status.title, tone: status.tone };
}

/**
 * Whether the merchant's phone may announce the payment: COMPAS allowed it and
 * PayPal captured it. An order waiting for the payer, or a pending capture,
 * is not received money.
 */
export function chargePaymentCompleted(charge: Pick<DemoCharge, "result"> | null): boolean {
  const result = charge?.result;
  return (
    result?.kind === "PURCHASE" &&
    result.purchase.outcome === "ALLOW" &&
    result.purchase.payment.status === "CREATED" &&
    result.purchase.payment.state === "COMPLETED"
  );
}
