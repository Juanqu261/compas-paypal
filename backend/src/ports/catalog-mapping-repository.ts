import type { CatalogMapping } from "../domain/merchant-catalog.ts";

/** SKU-to-CUM mappings, verified or rejected. One current mapping per SKU; a new one replaces it. */
export interface CatalogMappingRepository {
  put(mapping: CatalogMapping): Promise<void>;
  get(paypalMerchantId: string, skuId: string): Promise<CatalogMapping | undefined>;
  listByMerchant(paypalMerchantId: string): Promise<readonly CatalogMapping[]>;
}
