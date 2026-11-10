import assert from "node:assert/strict";
import test from "node:test";
import { presentMerchantDisplayName } from "../../src/lib/merchant-display.ts";

test("maps the legacy pharmacy display name to Central Pharmacy", () => {
  assert.equal(presentMerchantDisplayName("Droguería Central"), "Central Pharmacy");
  assert.equal(presentMerchantDisplayName("Central Pharmacy"), "Central Pharmacy");
  assert.equal(presentMerchantDisplayName("Droguería Centrall"), "Droguería Centrall");
});
