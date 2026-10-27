import type { MerchantCategoryResolution } from "../../domain/merchant-category.ts";
import { normalizePayPalAccountId } from "../../domain/merchant-identifiers.ts";
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

  resolve(paypalMerchantId: string): Promise<MerchantCategoryResolution> {
    const normalized = normalizePayPalAccountId(paypalMerchantId);
    if (!normalized) {
      return Promise.reject(new Error(`Not a PayPal merchant id: ${paypalMerchantId}`));
    }
    return loadMerchantCategoryResolution(normalized, this.#deps);
  }
}
