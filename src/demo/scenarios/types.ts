import type { Mandate } from "../../compas/domain/mandate";
import type {
  PolicyOutcome,
  PolicyReasonCode,
} from "../../compas/domain/policy-decision";
import type { PurchaseIntent } from "../../compas/domain/purchase";

export const DEMO_DATA_LABEL = "demo/test data" as const;

export type DemoScenarioId = "medication-pharmacy" | "alcohol-rejection";

/**
 * A scripted future case. `expectedPolicyResult` is the result a later
 * evaluator should be able to reach. It is not an executed decision.
 */
export type DemoScenario = {
  dataLabel: typeof DEMO_DATA_LABEL;
  id: DemoScenarioId;
  title: string;
  mandate: Mandate;
  purchaseIntent: PurchaseIntent;
  merchantSurface: string;
  expectedPolicyResult: {
    outcome: PolicyOutcome;
    reason?: PolicyReasonCode;
  };
};
