import type { DemoScenario } from "./types";
import { DEMO_DATA_LABEL } from "./types";

const usd40 = {
  value: "4000",
  assetCode: "USD",
  assetScale: 2,
} as const;

/**
 * Happy-path fixture for the hackathon story.
 * `expectedPolicyResult` is the outcome the story should reach once eligible
 * evidence exists. It is not a decision this scaffold computed.
 * The category claim is SELF_DECLARED demo data and is not verification.
 * Droguería Central is simulated. No wallet address or quote is included.
 */
export const medicationPharmacyScenario: DemoScenario = {
  dataLabel: DEMO_DATA_LABEL,
  id: "medication-pharmacy",
  title: "Pharmacy medication purchase",
  merchantSurface: "Nequi Negocios simulation",
  mandate: {
    id: "demo-mandate-medication",
    payer: {
      id: "demo-payer-pedro",
      displayName: "Pedro",
      role: "PAYER",
    },
    delegate: {
      id: "demo-delegate-andrea",
      displayName: "Andrea",
      role: "DELEGATE",
    },
    beneficiary: {
      id: "demo-beneficiary-gladys",
      displayName: "Gladys",
      role: "BENEFICIARY",
    },
    budget: usd40,
    remainingAuthorizedAmount: usd40,
    purposePolicy: {
      id: "demo-policy-medication",
      allowedPurposes: ["MEDICATION"],
      eligibleCategories: ["MEDICATION"],
    },
    status: "ACTIVE",
    validFrom: "2026-10-16T00:00:00Z",
    expiresAt: "2026-12-31T23:59:59Z",
    createdAt: "2026-10-16T12:00:00Z",
  },
  purchaseIntent: {
    id: "demo-intent-pharmacy",
    mandateId: "demo-mandate-medication",
    delegateId: "demo-delegate-andrea",
    merchant: {
      id: "demo-merchant-drogueria-central",
      displayName: "Droguería Central",
      categoryClaims: [
        {
          category: "MEDICATION",
          trustLevel: "SELF_DECLARED",
          evidenceRef: "demo-claim-only",
        },
      ],
    },
    lineItems: [
      {
        id: "demo-line-acetaminophen",
        description: "Acetaminophen",
        category: "MEDICATION",
        amount: usd40,
      },
    ],
    amount: usd40,
    createdAt: "2026-10-16T15:00:00Z",
  },
  expectedPolicyResult: {
    outcome: "ALLOW",
  },
};
