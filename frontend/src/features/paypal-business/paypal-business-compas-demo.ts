import type { CompasCategory } from "@/features/compas/api/contracts";

/**
 * Merchant-side COMPAS settings for the simulated PayPal Business app.
 * demo/test data.
 *
 * This is local UI state only. It is not a merchant-registry record, not a
 * backend enrollment, not a verification, and not the authoritative COMPAS
 * purpose policy. A category the merchant selects here is only what the shop
 * would declare. COMPAS resolves the categories it accepts from its trust log.
 *
 * The options are COMPAS categories, so a selection always names one the
 * backend knows. A pharmacy sells medication, personal care and some food.
 * Vitamins, supplements and first aid have no COMPAS category yet: they used
 * to appear here as "Health & wellness", which no budget could ever match.
 */
export type MerchantCompasCategory = Extract<CompasCategory, "MEDICATION" | "PERSONAL_CARE" | "FOOD">;

export type MerchantCompasConfig = {
  enabled: boolean;
  categories: readonly MerchantCompasCategory[];
};

export const merchantCompasCategories: readonly {
  id: MerchantCompasCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "MEDICATION",
    label: "Medication",
    description: "Prescription and over-the-counter medicine",
  },
  {
    id: "PERSONAL_CARE",
    label: "Personal care",
    description: "Hygiene and toiletries",
  },
  {
    id: "FOOD",
    label: "Groceries",
    description: "Food and grocery items",
  },
];

/** Droguería Central already participates in COMPAS in the demo story. */
export const defaultMerchantCompasConfig: MerchantCompasConfig = {
  enabled: true,
  categories: ["MEDICATION"],
};

export const merchantCompasEstablishment = "Droguería Central";

export function merchantCompasCategoryLabels(
  categories: readonly MerchantCompasCategory[],
): string[] {
  return merchantCompasCategories
    .filter((category) => categories.includes(category.id))
    .map((category) => category.label);
}
