import type { MerchantCategoryResolution } from "../../domain/merchant-category.ts";
import { normalizeWalletAddressUrl } from "../../domain/merchant-identifiers.ts";
import {
  loadMerchantCategoryResolution,
  type LoadMerchantCategoriesDeps,
} from "../../application/resolve-merchant-categories.ts";
import type { MerchantRegistry } from "../../ports/merchant-registry.ts";

/** Resolves a merchant's categories from the trust log at the moment of the call. */
export class TrustLogMerchantRegistry implements MerchantRegistry {
  readonly #deps: LoadMerchantCategoriesDeps;

  constructor(deps: LoadMerchantCategoriesDeps) {
    this.#deps = deps;
  }

  resolve(walletAddressUrl: string): Promise<MerchantCategoryResolution> {
    const normalized = normalizeWalletAddressUrl(walletAddressUrl);
    if (!normalized) {
      return Promise.reject(new Error(`Not a wallet address URL: ${walletAddressUrl}`));
    }
    return loadMerchantCategoryResolution(normalized, this.#deps);
  }
}
