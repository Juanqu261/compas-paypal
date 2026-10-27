import type { CatalogItem, CatalogMapping, MerchantCatalog } from "../../domain/merchant-catalog.ts";
import type { CatalogMappingRepository } from "../../ports/catalog-mapping-repository.ts";
import type { MerchantCatalogRepository } from "../../ports/merchant-catalog.ts";

/** In memory. A restart loses every catalog. data/migrations/ has the Postgres tables; there is no Postgres adapter yet. */
export class InMemoryMerchantCatalogs implements MerchantCatalogRepository {
  readonly #catalogs = new Map<string, MerchantCatalog>();

  async get(paypalMerchantId: string): Promise<MerchantCatalog | undefined> {
    const catalog = this.#catalogs.get(paypalMerchantId);
    return catalog ? { ...catalog, items: catalog.items.map((item) => ({ ...item })) } : undefined;
  }

  async getItem(paypalMerchantId: string, skuId: string): Promise<CatalogItem | undefined> {
    const item = this.#catalogs.get(paypalMerchantId)?.items.find((candidate) => candidate.skuId === skuId);
    return item ? { ...item } : undefined;
  }

  async replace(catalog: MerchantCatalog): Promise<void> {
    const skus = new Set<string>();
    for (const item of catalog.items) {
      if (skus.has(item.skuId)) throw new Error(`Duplicate SKU ${item.skuId} in ${catalog.paypalMerchantId}'s catalog`);
      skus.add(item.skuId);
    }
    this.#catalogs.set(catalog.paypalMerchantId, { ...catalog, items: catalog.items.map((item) => ({ ...item })) });
  }
}

/** In memory. A restart loses every mapping, and the analyst maps the catalog again. */
export class InMemoryCatalogMappings implements CatalogMappingRepository {
  readonly #mappings = new Map<string, CatalogMapping>();

  #key(paypalMerchantId: string, skuId: string): string {
    return `${paypalMerchantId}\n${skuId}`;
  }

  async put(mapping: CatalogMapping): Promise<void> {
    this.#mappings.set(this.#key(mapping.paypalMerchantId, mapping.skuId), { ...mapping });
  }

  async get(paypalMerchantId: string, skuId: string): Promise<CatalogMapping | undefined> {
    const mapping = this.#mappings.get(this.#key(paypalMerchantId, skuId));
    return mapping ? { ...mapping } : undefined;
  }

  async listByMerchant(paypalMerchantId: string): Promise<readonly CatalogMapping[]> {
    return [...this.#mappings.values()]
      .filter((mapping) => mapping.paypalMerchantId === paypalMerchantId)
      .map((mapping) => ({ ...mapping }));
  }
}
