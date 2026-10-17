import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCompasCategory } from "../../domain/merchant-category.ts";
import type { TrustMatrix } from "../../domain/trust-matrix.ts";
import { trustMatrixViolations } from "../../policy/trust-matrix.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const TRUST_MATRIX_FILE = join(repoRoot, "data/seeds/trust-matrix/trust-matrix.json");

/**
 * Loads the versioned trust matrix and refuses one that breaks an invariant,
 * so a bad seed fails at startup, not inside a purchase.
 */
export function loadTrustMatrix(file: string = TRUST_MATRIX_FILE): TrustMatrix {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<TrustMatrix>;
  if (typeof raw.version !== "string" || raw.version.trim() === "") {
    throw new Error(`${file}: version is required`);
  }
  if (!raw.history || !raw.cells || !raw.incompatible) {
    throw new Error(`${file}: history, cells and incompatible are required`);
  }
  for (const [key, list] of Object.entries(raw.incompatible)) {
    if (!isCompasCategory(key) || !Array.isArray(list) || !list.every(isCompasCategory)) {
      throw new Error(`${file}: incompatible.${key} must map a COMPAS category to COMPAS categories`);
    }
  }

  const matrix: TrustMatrix = {
    version: raw.version,
    history: raw.history,
    incompatible: raw.incompatible,
    cells: raw.cells,
  };
  const problems = trustMatrixViolations(matrix);
  if (problems.length > 0) {
    throw new Error(`${file} breaks the trust matrix invariants:\n- ${problems.join("\n- ")}`);
  }
  return matrix;
}
