import type { MerchantCategoryResolution } from "../domain/merchant-category.ts";

/**
 * Read side of the merchant category service.
 * The policy engine calls it at decision time, so a revocation applies to the next purchase.
 */
export interface MerchantRegistry {
  resolve(paypalMerchantId: string): Promise<MerchantCategoryResolution>;
}
