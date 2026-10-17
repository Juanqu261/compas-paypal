import { normalizeWalletAddressUrl } from "../../domain/merchant-identifiers.ts";
import type { DirectoryMerchant, MerchantDirectory } from "../../ports/merchant-directory.ts";
import { DEMO_DROGUERIA_WALLET, DEMO_LIQUOR_WALLET } from "../merchant-registry/demo-category-seed.ts";

/**
 * demo/test data: the merchants of the demo story. The ids are what the
 * Nequi Negocios simulation and the demo fixtures name.
 *
 * Each wallet is the test-network wallet when one is configured
 * (`DEMO_MERCHANT_WALLET_ADDRESS`, `DEMO_LIQUOR_WALLET_ADDRESS`), the same
 * wallets the category seed attests. Otherwise it is the reserved example
 * domain: COMPAS can evaluate a purchase there, but Open Payments can't pay it.
 */
export const DEMO_MERCHANT_IDS = {
  drogueria: "demo-merchant-drogueria-central",
  liquor: "demo-merchant-liquor",
} as const;

export function createDemoMerchantDirectory(env: NodeJS.ProcessEnv = process.env): MerchantDirectory {
  const wallet = (name: string, fallback: string) => {
    const configured = env[name]?.trim();
    return (configured && normalizeWalletAddressUrl(configured)) || fallback;
  };
  return new StaticMerchantDirectory([
    {
      id: DEMO_MERCHANT_IDS.drogueria,
      displayName: "Droguería Central",
      walletAddressUrl: wallet("DEMO_MERCHANT_WALLET_ADDRESS", DEMO_DROGUERIA_WALLET),
    },
    {
      id: DEMO_MERCHANT_IDS.liquor,
      displayName: "Licorera de ejemplo",
      walletAddressUrl: wallet("DEMO_LIQUOR_WALLET_ADDRESS", DEMO_LIQUOR_WALLET),
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
