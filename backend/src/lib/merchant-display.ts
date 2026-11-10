/**
 * Presentation-only rename for the demo pharmacy. Stored records and PayPal
 * ids stay unchanged; the UI shows the current public name.
 */
const LEGACY_PHARMACY_NAMES = new Set(["Droguería Central", "DROGUERIA CENTRAL"]);

export function presentMerchantDisplayName(name: string): string;
export function presentMerchantDisplayName(name: string | undefined): string | undefined;
export function presentMerchantDisplayName(name: string | undefined): string | undefined {
  if (name == null) return name;
  return LEGACY_PHARMACY_NAMES.has(name) ? "Central Pharmacy" : name;
}
