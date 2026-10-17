import assert from "node:assert/strict";
import test from "node:test";
import {
  createCategoryMappings,
  loadCategoryMappings,
} from "../../../src/integrations/merchant-registry/json-category-mappings.ts";

test("the seed tables load and map CIIU and licenses to COMPAS categories", () => {
  const mappings = loadCategoryMappings();
  // 4773 also covers cosmetics and toiletries, so it is not MEDICATION alone.
  assert.deepEqual(mappings.categoriesForCode("CIIU_REV4_AC", "4773"), ["MEDICATION", "PERSONAL_CARE"]);
  assert.deepEqual(mappings.categoriesForCode("CIIU_REV4_AC", "4724"), ["ALCOHOL", "TOBACCO"]);
  assert.deepEqual(mappings.categoriesForCode("CIIU_REV4_AC", "4711"), ["FOOD"]);
  assert.deepEqual(mappings.categoriesForLicense("CO_PHARMACY_ESTABLISHMENT"), ["MEDICATION"]);
  assert.match(mappings.version, /^CIIU_REV4_AC@.+;LICENSE@.+$/);
});

test("an unmapped code yields nothing, not a guess", () => {
  const mappings = loadCategoryMappings();
  assert.equal(mappings.categoriesForCode("CIIU_REV4_AC", "9609"), undefined);
});

test("a malformed table fails when it is loaded", () => {
  const licenses = { version: "1", mappings: [] };
  assert.throws(() =>
    createCategoryMappings({
      codes: [{ system: "CIIU_REV4_AC", version: "1", mappings: [{ code: "4773", categories: ["DRUGS"] }] }],
      licenses,
    }),
  );
  assert.throws(() =>
    createCategoryMappings({
      codes: [{ system: "CIIU_REV4_AC", version: "1", mappings: [{ code: "47", categories: ["FOOD"] }] }],
      licenses,
    }),
  );
  assert.throws(() =>
    createCategoryMappings({
      codes: [{
        system: "CIIU_REV4_AC",
        version: "1",
        mappings: [{ code: "4711", categories: ["FOOD"] }, { code: "4711", categories: ["FOOD"] }],
      }],
      licenses,
    }),
  );
});
