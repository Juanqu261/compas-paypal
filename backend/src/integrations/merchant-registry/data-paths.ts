import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const CATEGORY_MAPPINGS_DIR = join(repoRoot, "data/seeds/category-mappings");
export const MERCHANT_REGISTRY_FILE = join(repoRoot, "data/seeds/merchant-registry/rues-medellin.json");
export const DEMO_CATEGORY_SOURCES_FILE = join(
  repoRoot,
  "data/seeds/category-sources/demo-sources.json",
);
