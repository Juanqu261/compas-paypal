import { normalizeCum } from "../domain/cum.ts";
import {
  type CatalogItem,
  type CatalogMapping,
  catalogItemDigest,
  catalogItemText,
} from "../domain/merchant-catalog.ts";
import type { CatalogMappingRepository } from "../ports/catalog-mapping-repository.ts";
import type { CumRegistry } from "../ports/cum-registry.ts";
import type { MerchantCatalogRepository } from "../ports/merchant-catalog.ts";
import { verifyCumMapping } from "../policy/cum-mapping-verifier.ts";

/**
 * Turns an analyst's pointer ("SKU x is CUM y") into evidence, or not. The
 * CUM is read from the registry, the source, never from the model or the
 * search index, and the deterministic verifier decides. The result replaces
 * the SKU's previous mapping.
 */
export async function verifyCatalogMapping(
  input: { paypalMerchantId: string; item: CatalogItem; cum: string; findingId: string },
  deps: { registry: CumRegistry; mappings: CatalogMappingRepository; now?: () => Date },
): Promise<CatalogMapping> {
  const cum = normalizeCum(input.cum);
  const record = cum ? await deps.registry.getByCum(cum) : undefined;
  const verification = verifyCumMapping(catalogItemText(input.item), record);
  const mapping: CatalogMapping = {
    paypalMerchantId: input.paypalMerchantId,
    skuId: input.item.skuId,
    cum: cum ?? input.cum.slice(0, 32),
    status: verification.status,
    verifierVersion: verification.verifierVersion,
    checks: verification.checks,
    provenance: deps.registry.provenance,
    skuTextDigest: catalogItemDigest(input.item),
    findingId: input.findingId,
    verifiedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  await deps.mappings.put(mapping);
  return mapping;
}

/** A cart line named by SKU, as COMPAS reads it: the CUM only if a current, verified mapping says so. */
export type ResolvedCatalogLine = { skuId: string; known: boolean; cum?: string };

/**
 * The verified CUM of a SKU, or none. A mapping counts only while the SKU
 * text is the text that was verified: a merchant who renames "Losartán 50 mg"
 * to "Gift card" after verification loses the mapping.
 */
export async function resolveCatalogLine(
  paypalMerchantId: string,
  skuId: string,
  deps: { catalogs: MerchantCatalogRepository; mappings: CatalogMappingRepository },
): Promise<ResolvedCatalogLine> {
  const item = await deps.catalogs.getItem(paypalMerchantId, skuId);
  if (!item) return { skuId, known: false };
  const mapping = await deps.mappings.get(paypalMerchantId, skuId);
  const current = mapping?.status === "VERIFIED" && mapping.skuTextDigest === catalogItemDigest(item);
  return { skuId, known: true, ...(current ? { cum: mapping.cum } : {}) };
}
