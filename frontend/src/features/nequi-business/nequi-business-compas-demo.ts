/**
 * Merchant-side COMPAS settings for the simulated Nequi Negocios app.
 * demo/test data.
 *
 * This is local UI state only. It is not a merchant-registry record, not a
 * backend enrollment, not a verification, and not the authoritative COMPAS
 * purpose policy. The ids mirror COMPAS purpose names (`MEDICATION`, ...) so a
 * later task can map them. A category the merchant selects here is only a
 * self-declared claim and proves nothing about eligibility on its own.
 */
export type MerchantCompasCategory =
  | "MEDICATION"
  | "PERSONAL_CARE"
  | "HEALTH_WELLNESS";

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
    label: "Medicamentos",
    description: "Medicamentos con y sin fórmula",
  },
  {
    id: "PERSONAL_CARE",
    label: "Cuidado personal",
    description: "Higiene y aseo personal",
  },
  {
    id: "HEALTH_WELLNESS",
    label: "Salud y bienestar",
    description: "Vitaminas, suplementos y primeros auxilios",
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
