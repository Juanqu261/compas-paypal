/**
 * The site's routes in story order. Navigation slides forward or back along
 * this order: home, demo, then the payer, delegate and merchant surfaces.
 */
export const storyOrder = ["/", "/demo", "/arq", "/nequi", "/nequi-negocios"];

export type SurfaceId = "arq" | "nequi" | "nequi-negocios";

export type Surface = {
  id: SurfaceId;
  href: string;
  step: number;
  person: string;
  role: string;
  app: string;
  summary: string;
};

export const surfaces: readonly Surface[] = [
  {
    id: "arq",
    href: "/arq",
    step: 1,
    person: "Pedro",
    role: "Payer",
    app: "ARQ",
    summary:
      "Pedro’s wallet holds the money. He approves one capped grant for Gladys’s medication and never sends money to Andrea.",
  },
  {
    id: "nequi",
    href: "/nequi",
    step: 2,
    person: "Andrea",
    role: "Delegate",
    app: "Nequi",
    summary:
      "Andrea pays at the counter for Gladys. She can cause a payment that fits the mandate, but she never receives the funds.",
  },
  {
    id: "nequi-negocios",
    href: "/nequi-negocios",
    step: 3,
    person: "Droguería Central",
    role: "Merchant",
    app: "Nequi Negocios",
    summary:
      "The pharmacy collects as it always does. Once COMPAS allows the purchase, the payment arrives straight from Pedro’s wallet.",
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
