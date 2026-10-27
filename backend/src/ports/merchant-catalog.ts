import type { CatalogItem, MerchantCatalog } from "../domain/merchant-catalog.ts";

/** What each registered merchant lists for sale, by PayPal merchant id. */
export interface MerchantCatalogRepository {
  get(paypalMerchantId: string): Promise<MerchantCatalog | undefined>;
  getItem(paypalMerchantId: string, skuId: string): Promise<CatalogItem | undefined>;
  /** Replaces the merchant's whole catalog. Mappings of changed SKU text go stale by digest. */
  replace(catalog: MerchantCatalog): Promise<void>;
}
