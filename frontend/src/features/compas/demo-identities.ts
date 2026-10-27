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
 * names the merchant by id. The backend holds its PayPal account and resolves
 * its categories, so nothing here is evidence.
 */
export const DEMO_MERCHANTS = {
  drogueria: { id: "demo-merchant-drogueria-central", displayName: "Droguería Central" },
  liquor: { id: "demo-merchant-liquor", displayName: "Licorera de ejemplo" },
} as const;

export const PAYPAL_RETURN_RESULTS = ["completed", "pending", "waiting", "cancelled", "failed", "unconfirmed"] as const;
export type PayPalReturn = { result: (typeof PAYPAL_RETURN_RESULTS)[number]; mandateId: string };

/**
 * Reads the hint the backend adds when the payer comes back from PayPal after
 * approving or cancelling an order (`?paypalOrder=…&mandateId=…`). It is a
 * hint only: the backend captured or closed the order itself, and the screen
 * then reads the budget's real activity from the backend.
 */
export function readPayPalReturn(search: string): PayPalReturn | null {
  const params = new URLSearchParams(search);
  const result = params.get("paypalOrder");
  const mandateId = params.get("mandateId");
  if (!mandateId || !/^mandate-[A-Za-z0-9-]{1,80}$/.test(mandateId)) return null;
  if (!(PAYPAL_RETURN_RESULTS as readonly (string | null)[]).includes(result)) return null;
  return { result: result as PayPalReturn["result"], mandateId };
}
