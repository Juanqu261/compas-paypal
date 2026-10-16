import type { MerchantProfile } from "../../domain/merchant";
import type { MerchantRegistry } from "../../ports/merchant-registry";
import { notImplemented } from "../../lib/not-implemented";

/** Placeholder. A self-declared category is not treated as verified evidence. */
export class UnimplementedMerchantRegistry implements MerchantRegistry {
  getById(): Promise<MerchantProfile | undefined> {
    return notImplemented("MerchantRegistry.getById");
  }
}
