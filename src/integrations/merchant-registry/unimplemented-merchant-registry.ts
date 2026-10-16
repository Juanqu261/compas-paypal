import type { MerchantProfile } from "../../compas/domain/merchant";
import type { MerchantRegistry } from "../../compas/ports/merchant-registry";
import { notImplemented } from "../../lib/not-implemented";

/** Placeholder. A self-declared category is not treated as verified evidence. */
export class UnimplementedMerchantRegistry implements MerchantRegistry {
  getById(): Promise<MerchantProfile | undefined> {
    return notImplemented("MerchantRegistry.getById");
  }
}
