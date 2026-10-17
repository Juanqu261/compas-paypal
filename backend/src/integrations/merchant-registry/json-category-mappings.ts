import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CategoryCodeSystem,
  type CompasCategory,
  isCompasCategory,
  LICENSE_TYPES,
  type LicenseType,
} from "../../domain/merchant-category.ts";
import type { CategoryMappingRepository } from "../../ports/category-mapping-repository.ts";
import { normalizeCategoryCode } from "../../domain/merchant-identifiers.ts";
import { CATEGORY_MAPPINGS_DIR } from "./data-paths.ts";

export type CodeMappingFile = {
  system: CategoryCodeSystem;
  version: string;
  mappings: readonly { code: string; categories: readonly string[] }[];
};

export type LicenseMappingFile = {
  version: string;
  mappings: readonly { licenseType: string; categories: readonly string[] }[];
};

function categoriesOf(raw: readonly string[], where: string): readonly CompasCategory[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${where}: categories must be a non-empty array`);
  }
  for (const category of raw) {
    if (!isCompasCategory(category)) throw new Error(`${where}: unknown category ${category}`);
  }
  return Object.freeze([...new Set(raw as readonly CompasCategory[])]);
}

/** Mapping tables are data. A malformed table fails at startup, not during a decision. */
export function createCategoryMappings(input: {
  codes: readonly CodeMappingFile[];
  licenses: LicenseMappingFile;
}): CategoryMappingRepository {
  const byCode = new Map<string, readonly CompasCategory[]>();
  const versions: string[] = [];

  for (const file of input.codes) {
    if (file.system !== "CIIU_REV4_AC") throw new Error(`Unknown code system ${file.system}`);
    if (typeof file.version !== "string" || !file.version) {
      throw new Error(`${file.system}: version missing`);
    }
    versions.push(`${file.system}@${file.version}`);
    for (const row of file.mappings) {
      const code = normalizeCategoryCode(file.system, row.code);
      if (!code) throw new Error(`${file.system}: malformed code ${row.code}`);
      const key = `${file.system}:${code}`;
      if (byCode.has(key)) throw new Error(`${file.system}: duplicate code ${code}`);
      byCode.set(key, categoriesOf(row.categories, key));
    }
  }

  const byLicense = new Map<LicenseType, readonly CompasCategory[]>();
  if (typeof input.licenses.version !== "string" || !input.licenses.version) {
    throw new Error("license mappings: version missing");
  }
  versions.push(`LICENSE@${input.licenses.version}`);
  for (const row of input.licenses.mappings) {
    if (!(LICENSE_TYPES as readonly string[]).includes(row.licenseType)) {
      throw new Error(`license mappings: unknown license type ${row.licenseType}`);
    }
    byLicense.set(row.licenseType as LicenseType, categoriesOf(row.categories, row.licenseType));
  }

  return {
    version: versions.join(";"),
    categoriesForCode: (system, code) => byCode.get(`${system}:${code}`),
    categoriesForLicense: (licenseType) => byLicense.get(licenseType),
  };
}

export function loadCategoryMappings(
  dir: string = CATEGORY_MAPPINGS_DIR,
): CategoryMappingRepository {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return createCategoryMappings({
    codes: [read("ciiu-rev4-ac.json")],
    licenses: read("license-types.json"),
  });
}
