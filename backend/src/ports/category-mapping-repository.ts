import type {
  CategoryCodeSystem,
  CompasCategory,
  LicenseType,
} from "../domain/merchant-category.ts";

/**
 * Versioned translation from external evidence to COMPAS categories.
 * Unmapped evidence returns undefined. Nothing guesses.
 */
export interface CategoryMappingRepository {
  readonly version: string;
  categoriesForCode(system: CategoryCodeSystem, code: string): readonly CompasCategory[] | undefined;
  categoriesForLicense(licenseType: LicenseType): readonly CompasCategory[] | undefined;
}
