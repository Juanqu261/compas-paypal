/**
 * Presentation-only rename for the demo pharmacy. Historical spending rows may
 * still say "Droguería Central"; the UI shows the current public name.
 */
const LEGACY_PHARMACY_NAMES = new Set(["Droguería Central", "DROGUERIA CENTRAL"]);

export function presentMerchantDisplayName(name: string): string {
  return LEGACY_PHARMACY_NAMES.has(name) ? "Central Pharmacy" : name;
}
