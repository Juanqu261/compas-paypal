import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const CATEGORY_MAPPINGS_DIR = join(repoRoot, "data/seeds/category-mappings");
export const MERCHANT_REGISTRY_FILE = join(repoRoot, "data/seeds/merchant-registry/rues-medellin.json");
export const DEMO_CATEGORY_SOURCES_FILE = join(
  repoRoot,
  "data/seeds/category-sources/demo-sources.json",
);
/** demo/test data: a subset of INVIMA's CUM rows. */
export const DEMO_CUM_FILE = join(repoRoot, "data/seeds/cum/demo-cum.json");
/** demo/test data: the demo merchants' catalogs. */
export const DEMO_CATALOGS_DIR = join(repoRoot, "data/seeds/merchant-catalogs");
/** demo/test data: the Cámara de Comercio fixture behind CamaraVerifier. */
export const DEMO_CAMARA_DIR = join(repoRoot, "data/seeds/camara");
/** COMPAS's own trust-log sources (the analyst, merchant onboarding). Always registered. */
export const COMPAS_CATEGORY_SOURCES_FILE = join(repoRoot, "data/seeds/category-sources/compas-sources.json");
