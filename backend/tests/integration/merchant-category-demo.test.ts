import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { PurposePolicy } from "../../src/domain/mandate.ts";
import { createMerchantCategoryService } from "../../src/integrations/merchant-registry/create-merchant-category-service.ts";
import {
  DEMO_DROGUERIA_WALLET,
  DEMO_LIQUOR_WALLET,
} from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import { evaluateMerchantCategoryEvidence } from "../../src/policy/merchant-category-evidence.ts";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures/demo");

function fixture(name: string): {
  mandate: { purposePolicy: PurposePolicy };
  purchaseIntent: { merchantWalletAddressUrl: string };
} {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const quiet = { logWarning: () => {} };

test("the demo seed walks the ladder through real signature checks", async () => {
  const service = await createMerchantCategoryService({ env: {}, ...quiet });
  assert.equal(service.demoSubmissions, 4);

  const pharmacy = await service.registry.resolve(DEMO_DROGUERIA_WALLET);
  const medication = pharmacy.categories.find((resolved) => resolved.category === "MEDICATION");
  assert.equal(medication?.trustLevel, "PROVIDER_VERIFIED");
  assert.deepEqual(medication?.sourceIds, ["nequi-negocios-sim/merchant", "nequi-negocios-sim/kyb"]);
});

test("medication fixture: the merchant step passes; alcohol fixture: it denies", async () => {
  const service = await createMerchantCategoryService({ env: {}, ...quiet });

  const medication = fixture("medication-pharmacy.json");
  assert.equal(medication.purchaseIntent.merchantWalletAddressUrl, DEMO_DROGUERIA_WALLET);
  const pass = evaluateMerchantCategoryEvidence(
    await service.registry.resolve(medication.purchaseIntent.merchantWalletAddressUrl),
    medication.mandate.purposePolicy,
  );
  assert.equal(pass.result, "PASS");

  const alcohol = fixture("alcohol-rejection.json");
  assert.equal(alcohol.purchaseIntent.merchantWalletAddressUrl, DEMO_LIQUOR_WALLET);
  const deny = evaluateMerchantCategoryEvidence(
    await service.registry.resolve(alcohol.purchaseIntent.merchantWalletAddressUrl),
    alcohol.mandate.purposePolicy,
  );
  assert.equal(deny.result, "DENY");
  assert.equal(deny.result === "DENY" && deny.reason.code, "MERCHANT_NOT_ELIGIBLE");
});

test("the configured test-network merchant wallet gets Droguería Central's evidence", async () => {
  const service = await createMerchantCategoryService({
    env: { DEMO_MERCHANT_WALLET_ADDRESS: "$ilp.interledger-test.dev/compas-merchant" },
    ...quiet,
  });
  assert.equal(service.demoSubmissions, 6);
  const resolution = await service.registry.resolve("https://ilp.interledger-test.dev/compas-merchant");
  assert.ok(resolution.categories.some((resolved) => resolved.category === "MEDICATION"));
});

test("the configured test-network liquor wallet gets the liquor store's evidence", async () => {
  const service = await createMerchantCategoryService({
    env: { DEMO_LIQUOR_WALLET_ADDRESS: "https://ilp.interledger-test.dev/compas-liquor/" },
    ...quiet,
  });
  assert.equal(service.demoSubmissions, 6);
  const resolution = await service.registry.resolve("https://ilp.interledger-test.dev/compas-liquor");
  assert.deepEqual(resolution.categories.map((resolved) => resolved.category), ["ALCOHOL", "TOBACCO"]);
});

test("with the demo seed off there are no sources and no evidence", async () => {
  const service = await createMerchantCategoryService({ env: { MERCHANT_CATEGORY_DEMO_SEED: "false" }, ...quiet });
  assert.equal(service.demoSubmissions, 0);
  assert.equal(await service.sources.getById("nequi-negocios-sim/kyb"), undefined);
  assert.deepEqual((await service.registry.resolve(DEMO_DROGUERIA_WALLET)).categories, []);
});

test("an HMAC key shorter than 32 characters fails at startup", async () => {
  await assert.rejects(createMerchantCategoryService({ env: { MERCHANT_SUBJECT_HMAC_KEY: "short" }, ...quiet }));
});
