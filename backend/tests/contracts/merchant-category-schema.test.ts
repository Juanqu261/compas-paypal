import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TRUST_LOG_ENTRY_TYPES } from "../../src/domain/merchant-category.ts";

const schema = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../contracts/merchant-categories/category-claim-submission.schema.json",
    ),
    "utf8",
  ),
) as { $defs: Record<string, { additionalProperties?: boolean; properties?: Record<string, { const?: string }> }> };

const variants = ["categoryClaim", "licenseClaim", "identityBinding", "revocation", "flag"];

test("every submission variant is closed and has no trustLevel", () => {
  for (const name of variants) {
    const variant = schema.$defs[name];
    assert.equal(variant.additionalProperties, false, name);
    assert.equal("trustLevel" in (variant.properties ?? {}), false, name);
  }
});

test("the schema covers every trust-log entry type", () => {
  const types = variants.map((name) => schema.$defs[name].properties?.type?.const);
  assert.deepEqual([...types].sort(), [...TRUST_LOG_ENTRY_TYPES].sort());
});
