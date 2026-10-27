import assert from "node:assert/strict";
import test from "node:test";
import {
  nitCheckDigit,
  normalizeCategoryCode,
  normalizeNit,
  normalizePayPalAccountId,
} from "../../src/domain/merchant-identifiers.ts";

test("CIIU codes are four digits and keep leading zeros", () => {
  assert.equal(normalizeCategoryCode("CIIU_REV4_AC", " 4773 "), "4773");
  assert.equal(normalizeCategoryCode("CIIU_REV4_AC", "0111"), "0111");
  for (const bad of ["477", "47731", "47a3", "", "5912x"]) {
    assert.equal(normalizeCategoryCode("CIIU_REV4_AC", bad), undefined, bad);
  }
});

test("NIT check digit matches the DIAN algorithm", () => {
  // DIAN's own NIT is 800.197.268-4.
  assert.equal(nitCheckDigit("800197268"), 4);
});

test("a NIT normalizes to its base and a wrong check digit is refused", () => {
  assert.equal(normalizeNit("800.197.268-4"), "800197268");
  assert.equal(normalizeNit("800197268-4"), "800197268");
  assert.equal(normalizeNit("800197268"), "800197268");
  assert.equal(normalizeNit("800197268-5"), undefined);
  assert.equal(normalizeNit("80019A268"), undefined);
  assert.equal(normalizeNit("123"), undefined);
});

test("PayPal account ids get one spelling", () => {
  assert.equal(normalizePayPalAccountId("JYHT3DF634TAG"), "JYHT3DF634TAG");
  assert.equal(normalizePayPalAccountId("  jyht3df634tag "), "JYHT3DF634TAG");
});

test("anything that is not a PayPal account id is refused", () => {
  for (const bad of [
    "JYHT3DF634TA", // 12 characters
    "JYHT3DF634TAGG", // 14 characters
    "JYHT3DF634TA0", // 0 is not in PayPal's alphabet
    "JYHT3DF634TAI", // nor is I
    "JYHT3DF634TA-",
    "https://ilp.interledger-test.dev/drogueria",
    "$ilp.interledger-test.dev/drogueria",
    "",
  ]) {
    assert.equal(normalizePayPalAccountId(bad), undefined, bad);
  }
});
