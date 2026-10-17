/**
 * demo/test data: which demo person each host app signs in as. The backend
 * decides what that person may see and do from the mandates that name them.
 * The app is not the role: Andrea could be the payer of another mandate.
 */
export const DEMO_PARTY_IDS = {
  pedro: "demo-payer-pedro",
  andrea: "demo-delegate-andrea",
  gladys: "demo-beneficiary-gladys",
} as const;

/**
 * demo/test data: the merchants the backend's demo directory knows. A purchase
 * names the merchant by id. The backend holds its wallet and resolves its
 * categories, so nothing here is evidence.
 */
export const DEMO_MERCHANTS = {
  drogueria: { id: "demo-merchant-drogueria-central", displayName: "Droguería Central" },
  liquor: { id: "demo-merchant-liquor", displayName: "Licorera de ejemplo" },
} as const;

/** Which demo merchant charges in each scenario of `data/fixtures/demo/`. */
export const DEMO_MERCHANT_BY_SCENARIO = {
  "medication-pharmacy": DEMO_MERCHANTS.drogueria,
  "alcohol-rejection": DEMO_MERCHANTS.liquor,
} as const;

export type ConsentReturn = { result: "granted" | "rejected" | "failed"; mandateId: string };

/**
 * Reads the hint the backend adds when the payer comes back from their wallet
 * (`?payerAuthorization=…&grantKey=…`). It is a hint only: the screen then
 * reads the mandate's real status from the backend.
 */
export function readConsentReturn(search: string): ConsentReturn | null {
  const params = new URLSearchParams(search);
  const result = params.get("payerAuthorization");
  const mandateId = params.get("grantKey");
  if (!mandateId || !/^mandate-[A-Za-z0-9-]{1,80}$/.test(mandateId)) return null;
  if (result !== "granted" && result !== "rejected" && result !== "failed") return null;
  return { result, mandateId };
}
