import { readFileSync } from "node:fs";
import type { CatalogItem } from "../../domain/merchant-catalog.ts";
import { parseMoney } from "../../application/mandates.ts";
import type { MerchantCatalogRepository } from "../../ports/merchant-catalog.ts";
import type { MerchantDirectory } from "../../ports/merchant-directory.ts";

/**
 * demo/test data: loads the demo merchants' catalogs into the repository,
 * under each merchant's PayPal merchant id from the directory. A catalog for
 * a merchant the directory doesn't know is an error, so a typo fails at startup.
 */
export async function seedDemoCatalogs(options: {
  file: string;
  merchants: MerchantDirectory;
  catalogs: MerchantCatalogRepository;
  now?: Date;
}): Promise<number> {
  const parsed = JSON.parse(readFileSync(options.file, "utf8")) as { catalogs?: unknown };
  if (!Array.isArray(parsed.catalogs)) throw new Error(`${options.file}: catalogs must be an array`);
  let items = 0;
  for (const raw of parsed.catalogs as { merchantId?: unknown; items?: unknown }[]) {
    const merchant = typeof raw.merchantId === "string" ? await options.merchants.getById(raw.merchantId) : undefined;
    if (!merchant) throw new Error(`${options.file}: unknown merchant ${String(raw.merchantId)}`);
    if (!Array.isArray(raw.items)) throw new Error(`${options.file}: ${merchant.id} has no items`);
    const catalogItems = raw.items.map((item: Record<string, unknown>, index: number): CatalogItem => {
      if (typeof item.skuId !== "string" || typeof item.name !== "string") {
        throw new Error(`${options.file}: ${merchant.id} item ${index} needs skuId and name`);
      }
      const errors: { field: string; code: string; message: string }[] = [];
      const price = item.price === undefined ? undefined : parseMoney(item.price, "price", errors);
      if (errors.length > 0) throw new Error(`${options.file}: ${merchant.id} ${item.skuId} has an invalid price`);
      return {
        skuId: item.skuId,
        name: item.name,
        ...(typeof item.description === "string" ? { description: item.description } : {}),
        ...(price ? { price } : {}),
      };
    });
    await options.catalogs.replace({
      paypalMerchantId: merchant.paypalMerchantId,
      items: catalogItems,
      updatedAt: (options.now ?? new Date()).toISOString(),
    });
    items += catalogItems.length;
  }
  return items;
}
