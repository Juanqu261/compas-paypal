/**
 * The site's routes in story order. Navigation slides forward or back along
 * this order: home, demo, then the payer, delegate and merchant surfaces.
 */
export const storyOrder = ["/", "/demo", "/paypal", "/nequi", "/paypal-business"];

export type SurfaceId = "paypal" | "nequi" | "paypal-business";

export type Surface = {
  id: SurfaceId;
  href: string;
  step: number;
  person: string;
  role: string;
  app: string;
  summary: string;
  /** What on this surface is simulated, and what is not. */
  simulation: string;
};

export const surfaces: readonly Surface[] = [
  {
    id: "paypal",
    href: "/paypal",
    step: 1,
    person: "Pedro",
    role: "Payer",
    app: "PayPal",
    summary:
      "Pedro’s PayPal holds the money. He authorizes a budget for Gladys’s medication, approves each allowed purchase at PayPal and never sends money to Andrea.",
    simulation:
      "The PayPal app here is a simulation for the COMPAS demo. Approving an order opens the real PayPal sandbox.",
  },
  {
    id: "nequi",
    href: "/nequi",
    step: 2,
    person: "Andrea",
    role: "Delegate",
    app: "Nequi",
    summary:
      "Andrea orders Gladys’s medication from an online pharmacy and reviews the charge in Nequi. She can cause a payment that fits the mandate, but she never receives the funds.",
    simulation: "Nequi here is a simulation for the COMPAS demo, not an integration.",
  },
  {
    id: "paypal-business",
    href: "/paypal-business",
    step: 3,
    person: "Droguería Central",
    role: "Merchant",
    app: "PayPal Business",
    summary:
      "An online pharmacy that already takes PayPal. It charges the order with COMPAS. Once COMPAS allows the purchase and Pedro approves it, the payment arrives straight from Pedro’s PayPal to the pharmacy’s.",
    simulation:
      "The PayPal Business look is a simulation, not the official app. The account and its COMPAS payments are real PayPal sandbox data: a test business account, read live from PayPal, with a link into the sandbox itself.",
  },
];

export function surfaceById(id: SurfaceId): Surface {
  const surface = surfaces.find((item) => item.id === id);
  if (!surface) {
    throw new Error(`Unknown surface: ${id}`);
  }
  return surface;
}

/** The transition type for a link, from where the reader is to where it goes. */
export function storyDirection(from: string, to: string): string[] {
  const fromIndex = storyOrder.indexOf(from);
  const toIndex = storyOrder.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return [];
  }
  return [toIndex > fromIndex ? "nav-forward" : "nav-back"];
}
