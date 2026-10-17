import type { DemoScenario, DemoScenarioId } from "../../demo/scenarios.ts";
import {
  COMPAS_CATEGORIES,
  type CompasCategory,
  type Money,
  type PurchasePreview,
  type PurchaseView,
} from "../compas/api/contracts.ts";
import { DEMO_MERCHANT_BY_SCENARIO } from "../compas/demo-identities.ts";

/**
 * SIMULATED: a charge the merchant phone hands to the delegate phone inside
 * this browser. COMPAS has no merchant authentication yet, so the backend
 * stores no charge: Andrea's phone sends it as her purchase, and the backend
 * finds the merchant's wallet and categories itself. `result` is the
 * backend's answer to Andrea, relayed here so the merchant phone can show it.
 */
export type DemoCharge = {
  id: string;
  scenarioId: DemoScenarioId;
  merchantId: string;
  merchantDisplayName: string;
  amount: Money;
  /** Categories and amounts only. Product names stay on the merchant's phone. */
  lineItems: readonly { category?: CompasCategory; amount: Money }[];
  createdAt: string;
  /** PREVIEW is the backend's check before Open Payments, not a decision. */
  result?:
    | { kind: "PREVIEW"; preview: PurchasePreview }
    | { kind: "PURCHASE"; purchase: PurchaseView }
    | { kind: "ERROR"; code: string };
};

function isCategory(value: string): value is CompasCategory {
  return (COMPAS_CATEGORIES as readonly string[]).includes(value);
}

/** The charge the scenario's fixture describes, without its product names. demo/test data. */
export function chargeFromScenario(scenario: DemoScenario, now = new Date()): DemoCharge {
  const merchant = DEMO_MERCHANT_BY_SCENARIO[scenario.id];
  return {
    id: `charge-${now.getTime().toString(36)}`,
    scenarioId: scenario.id,
    merchantId: merchant.id,
    merchantDisplayName: merchant.displayName,
    amount: scenario.purchaseIntent.amount,
    lineItems: scenario.purchaseIntent.lineItems.map((line) => ({
      ...(isCategory(line.category) ? { category: line.category } : {}),
      amount: line.amount,
    })),
    createdAt: now.toISOString(),
  };
}
