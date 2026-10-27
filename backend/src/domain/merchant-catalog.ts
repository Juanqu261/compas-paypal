import { createHash } from "node:crypto";
import type { MoneyAmount } from "./money.ts";

/**
 * What a registered merchant sells, as the merchant lists it. Catalog text is
 * the merchant's own and untrusted: it is data for the analyst and the
 * verifier, never an instruction and never evidence by itself.
 */
export type CatalogItem = {
  /** The merchant's own id for the product. Opaque to COMPAS. */
  skuId: string;
  name: string;
  description?: string;
  price?: MoneyAmount;
};

export type MerchantCatalog = {
  paypalMerchantId: string;
  items: readonly CatalogItem[];
  updatedAt: string;
};

export const CATALOG_MAPPING_CHECKS = [
  "CUM_EXISTS",
  "CUM_ACTIVE",
  "REGISTRATION_VALID",
  "INGREDIENTS",
  "STRENGTHS",
  "FORM",
  "PRESENTATION",
  "NOT_A_SAMPLE",
] as const;
export type CatalogMappingCheckName = (typeof CATALOG_MAPPING_CHECKS)[number];

export type CatalogMappingCheck = { check: CatalogMappingCheckName; passed: boolean; detail: string };

/**
 * A SKU mapped to an INVIMA CUM. The analyst proposes the CUM. The mapping
 * is VERIFIED only when a deterministic verifier read the CUM from the
 * dataset and every check passed, so it counts as INVIMA's evidence. A
 * REJECTED mapping is kept for the audit trail and never used.
 */
export type CatalogMapping = {
  paypalMerchantId: string;
  skuId: string;
  cum: string;
  status: "VERIFIED" | "REJECTED";
  verifierVersion: string;
  checks: readonly CatalogMappingCheck[];
  /** Where the CUM record was read, e.g. "INVIMA CUM, datos.gov.co i7cb-raxc". */
  provenance: string;
  /** The SKU text the checks ran on. A mapping whose SKU text changed since is stale. */
  skuTextDigest: string;
  /** The analyst finding that proposed it. */
  findingId: string;
  verifiedAt: string;
};

/** The text a verifier checks: name and description, as the merchant wrote them. */
export function catalogItemText(item: Pick<CatalogItem, "name" | "description">): string {
  return item.description ? `${item.name} ${item.description}` : item.name;
}

export function catalogItemDigest(item: Pick<CatalogItem, "name" | "description">): string {
  return createHash("sha256").update(catalogItemText(item)).digest("base64url");
}
