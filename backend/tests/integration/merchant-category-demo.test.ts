import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMerchantHistory } from "../../src/application/merchant-history.ts";
import type { PurposePolicy } from "../../src/domain/mandate.ts";
import { createMerchantHistoryService } from "../../src/integrations/merchant-history/create-merchant-history-service.ts";
import { createMerchantCategoryService } from "../../src/integrations/merchant-registry/create-merchant-category-service.ts";
import {
  DEMO_DROGUERIA_WALLET,
  DEMO_LIQUOR_WALLET,
  DEMO_TIENDA_WALLET,
  generateDemoSigningKey,
  seedDemoMerchantCategories,
} from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import {
  categoriesNeedingHistory,
  evaluateMerchantCategoryEvidence,
  type MerchantCategoryStepResult,
} from "../../src/policy/merchant-category-evidence.ts";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures/demo");

function fixture(name: string): {
  mandate: { purposePolicy: PurposePolicy };
  purchaseIntent: { merchantWalletAddressUrl: string };
} {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const quiet = { logWarning: () => {} };
const NOW = new Date("2026-10-16T15:00:00Z");

/** The merchant step exactly as the purchase flow runs it: trust log, then history, then the matrix. */
async function merchantStep(walletAddressUrl: string, policy: PurposePolicy): Promise<MerchantCategoryStepResult> {
  const categories = await createMerchantCategoryService({ env: {}, ...quiet, now: () => NOW });
  const history = await createMerchantHistoryService({ env: {}, now: () => NOW });
  const resolution = await categories.registry.resolve(walletAddressUrl);
  const merchantHistory = await loadMerchantHistory(
    resolution.walletAddressUrl,
    categoriesNeedingHistory(resolution, policy),
    NOW,
    history,
  );
  return evaluateMerchantCategoryEvidence(resolution, policy, merchantHistory);
}

test("the demo seed walks the ladder through real signature checks", async () => {
  const service = await createMerchantCategoryService({ env: {}, ...quiet });
  assert.equal(service.demoSubmissions, 5);

  const pharmacy = await service.registry.resolve(DEMO_DROGUERIA_WALLET);
  const medication = pharmacy.categories.find((resolved) => resolved.category === "MEDICATION");
  assert.equal(medication?.trustLevel, "PROVIDER_VERIFIED");
  assert.deepEqual(medication?.sourceIds, ["nequi-negocios-sim/merchant", "nequi-negocios-sim/kyb"]);
});

test("medication fixture: the merchant step passes; alcohol fixture: it denies", async () => {
  const medication = fixture("medication-pharmacy.json");
  assert.equal(medication.purchaseIntent.merchantWalletAddressUrl, DEMO_DROGUERIA_WALLET);
  const pass = await merchantStep(medication.purchaseIntent.merchantWalletAddressUrl, medication.mandate.purposePolicy);
  assert.equal(pass.result, "PASS");
  assert.equal(pass.result === "PASS" && pass.confidence.confidence, "HIGH");

  const alcohol = fixture("alcohol-rejection.json");
  assert.equal(alcohol.purchaseIntent.merchantWalletAddressUrl, DEMO_LIQUOR_WALLET);
  const deny = await merchantStep(alcohol.purchaseIntent.merchantWalletAddressUrl, alcohol.mandate.purposePolicy);
  assert.equal(deny.result, "DENY");
  assert.equal(deny.result === "DENY" && deny.reason.code, "MERCHANT_NOT_ELIGIBLE");
});

test("the demo tienda: self-declared FOOD plus confirmed history is MEDIUM, never HIGH", async () => {
  const food = (minimum: PurposePolicy["merchantConfidence"]["minimum"]): PurposePolicy => ({
    id: "demo-policy-food",
    allowedPurposes: ["FOOD"],
    eligibleCategories: ["FOOD"],
    merchantConfidence: { minimum },
    enforcement: "ENFORCED",
  });

  const accepted = await merchantStep(DEMO_TIENDA_WALLET, food("MEDIUM"));
  assert.equal(accepted.result, "PASS");
  assert.deepEqual(accepted.result === "PASS" && [accepted.confidence.corroboration, accepted.confidence.historyGrade, accepted.confidence.confidence], [
    "UNCORROBORATED",
    "ESTABLISHED",
    "MEDIUM",
  ]);
  assert.equal(accepted.result === "PASS" && accepted.confidence.history.confirmingPayers, 12);

  const strict = await merchantStep(DEMO_TIENDA_WALLET, food("HIGH"));
  assert.equal(strict.result === "REVIEW" && strict.reason.code, "MERCHANT_EVIDENCE_INSUFFICIENT");
});

test("the configured test-network merchant wallet gets Droguería Central's evidence", async () => {
  const service = await createMerchantCategoryService({
    env: { DEMO_MERCHANT_WALLET_ADDRESS: "$ilp.interledger-test.dev/compas-merchant" },
    ...quiet,
  });
  assert.equal(service.demoSubmissions, 7);
  const resolution = await service.registry.resolve("https://ilp.interledger-test.dev/compas-merchant");
  assert.ok(resolution.categories.some((resolved) => resolved.category === "MEDICATION"));
});

test("a persistent trust log seeded for one test-network wallet still seeds the next one", async () => {
  // Like Postgres: the first body under a submission id stands, a different body is refused.
  const stored = new Map<string, string>();
  const ingest = async ({ body }: { body: Uint8Array }) => {
    const text = new TextDecoder().decode(body);
    const { submissionId, subject } = JSON.parse(text) as { submissionId: string; subject: { walletAddressUrl: string } };
    const first = stored.get(submissionId);
    if (first !== undefined && JSON.parse(first).subject.walletAddressUrl !== subject.walletAddressUrl) {
      return { ok: false as const, code: "SUBMISSION_ID_REUSED" as const, message: "reused" };
    }
    stored.set(submissionId, first ?? text);
    return { ok: true as const, entryId: submissionId, duplicate: first !== undefined };
  };
  const key = generateDemoSigningKey();
  await seedDemoMerchantCategories({ ingest, key, testNetworkMerchantWallet: "https://ilp.interledger-test.dev/tiendita" });
  const added = await seedDemoMerchantCategories({ ingest, key, testNetworkMerchantWallet: "https://ilp.interledger-test.dev/test-merchant" });
  assert.equal(added, 2);
  const wallets = [...stored.values()].map((text) => JSON.parse(text).subject.walletAddressUrl);
  assert.equal(wallets.filter((wallet) => wallet === "https://ilp.interledger-test.dev/test-merchant").length, 2);
});

test("the configured test-network liquor wallet gets the liquor store's evidence", async () => {
  const service = await createMerchantCategoryService({
    env: { DEMO_LIQUOR_WALLET_ADDRESS: "https://ilp.interledger-test.dev/compas-liquor/" },
    ...quiet,
  });
  assert.equal(service.demoSubmissions, 7);
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
