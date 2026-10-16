import type { DemoScenario } from "./types";
import { DEMO_DATA_LABEL } from "./types";
import { medicationPharmacyScenario } from "./medication-pharmacy";

const usd15 = {
  value: "1500",
  assetCode: "USD",
  assetScale: 2,
} as const;

/**
 * Rejection fixture. The same medication mandate must not pay for alcohol.
 * Expected future result: DENY / PURPOSE_MISMATCH, with no outgoing payment.
 */
export const alcoholRejectionScenario: DemoScenario = {
  dataLabel: DEMO_DATA_LABEL,
  id: "alcohol-rejection",
  title: "Liquor-store rejection",
  merchantSurface: "Nequi Negocios simulation",
  mandate: medicationPharmacyScenario.mandate,
  purchaseIntent: {
    id: "demo-intent-liquor",
    mandateId: medicationPharmacyScenario.mandate.id,
    delegateId: medicationPharmacyScenario.mandate.delegate.id,
    merchant: {
      id: "demo-merchant-example-liquor",
      displayName: "Example liquor store",
      categoryClaims: [
        {
          category: "ALCOHOL",
          trustLevel: "SELF_DECLARED",
          evidenceRef: "demo-claim-only",
        },
      ],
    },
    lineItems: [
      {
        id: "demo-line-alcohol",
        description: "Alcohol",
        category: "ALCOHOL",
        amount: usd15,
      },
    ],
    amount: usd15,
    createdAt: "2026-10-16T16:00:00Z",
  },
  expectedPolicyResult: {
    outcome: "DENY",
    reason: "PURPOSE_MISMATCH",
  },
};
