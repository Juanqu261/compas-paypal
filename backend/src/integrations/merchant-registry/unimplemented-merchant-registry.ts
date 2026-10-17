import type { MerchantCategoryResolution } from "../../domain/merchant-category.ts";
import type { MerchantRegistry } from "../../ports/merchant-registry.ts";
import { notImplemented } from "../../lib/not-implemented.ts";

/** Placeholder. A self-declared category is not treated as verified evidence. */
export class UnimplementedMerchantRegistry implements MerchantRegistry {
  resolve(): Promise<MerchantCategoryResolution> {
    return notImplemented("MerchantRegistry.resolve");
  }
}
