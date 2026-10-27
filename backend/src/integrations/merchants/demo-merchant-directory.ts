import { normalizePayPalAccountId } from "../../domain/merchant-identifiers.ts";
import type { DirectoryMerchant, MerchantDirectory } from "../../ports/merchant-directory.ts";
import { DEMO_DROGUERIA_PAYPAL_ID, DEMO_LIQUOR_PAYPAL_ID } from "../merchant-registry/demo-category-seed.ts";

/**
 * demo/test data: the merchants of the demo story. The ids are what the
 * Nequi Negocios simulation and the demo fixtures name.
 *
 * Each merchant is a PayPal sandbox business account when one is configured
 * (`DEMO_MERCHANT_PAYPAL_ID`, `DEMO_LIQUOR_PAYPAL_ID`), the same
 * accounts the category seed attests. Otherwise it is a demo id that names no
 * PayPal account: COMPAS can evaluate a purchase there, but PayPal can't pay it.
 */
export const DEMO_MERCHANT_IDS = {
  drogueria: "demo-merchant-drogueria-central",
  liquor: "demo-merchant-liquor",
} as const;

export function createDemoMerchantDirectory(env: NodeJS.ProcessEnv = process.env): MerchantDirectory {
  const account = (name: string, fallback: string) => {
    const configured = env[name]?.trim();
    return (configured && normalizePayPalAccountId(configured)) || fallback;
  };
  return new StaticMerchantDirectory([
    {
      id: DEMO_MERCHANT_IDS.drogueria,
      displayName: "Droguería Central",
      paypalMerchantId: account("DEMO_MERCHANT_PAYPAL_ID", DEMO_DROGUERIA_PAYPAL_ID),
    },
    {
      id: DEMO_MERCHANT_IDS.liquor,
      displayName: "Licorera de ejemplo",
      paypalMerchantId: account("DEMO_LIQUOR_PAYPAL_ID", DEMO_LIQUOR_PAYPAL_ID),
    },
  ]);
}

export class StaticMerchantDirectory implements MerchantDirectory {
  readonly #merchants: ReadonlyMap<string, DirectoryMerchant>;

  constructor(merchants: readonly DirectoryMerchant[]) {
    this.#merchants = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  }

  async getById(id: string): Promise<DirectoryMerchant | undefined> {
    const merchant = this.#merchants.get(id);
    return merchant ? { ...merchant } : undefined;
  }

  async list(): Promise<readonly DirectoryMerchant[]> {
    return [...this.#merchants.values()].map((merchant) => ({ ...merchant }));
  }
}
