import assert from "node:assert/strict";
import test from "node:test";
import {
  nitCheckDigit,
  normalizeCategoryCode,
  normalizeNit,
  normalizeWalletAddressUrl,
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

test("wallet addresses get one spelling", () => {
  assert.equal(
    normalizeWalletAddressUrl("$ilp.interledger-test.dev/drogueria"),
    "https://ilp.interledger-test.dev/drogueria",
  );
  assert.equal(
    normalizeWalletAddressUrl("https://ILP.example/alice/"),
    "https://ilp.example/alice",
  );
  assert.equal(normalizeWalletAddressUrl("https://ilp.example/alice?x=1"), undefined);
  assert.equal(normalizeWalletAddressUrl("https://user:pw@ilp.example/alice"), undefined);
  assert.equal(normalizeWalletAddressUrl("ftp://ilp.example/alice"), undefined);
  assert.equal(normalizeWalletAddressUrl("not a url"), undefined);
});
