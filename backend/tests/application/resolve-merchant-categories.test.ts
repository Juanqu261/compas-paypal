import assert from "node:assert/strict";
import test from "node:test";
import {
  loadMerchantCategoryResolution,
  resolveMerchantCategories,
} from "../../src/application/resolve-merchant-categories.ts";
import {
  ciiuClaim,
  createBench,
  LIQUOR,
  NOW,
  PHARMACY,
  VALID_NIT,
  walletSubject,
} from "./category-test-kit.ts";

function resolve(bench: ReturnType<typeof createBench>, wallet = PHARMACY, now = NOW) {
  return loadMerchantCategoryResolution(wallet, {
    trustLog: bench.trustLog,
    sources: bench.sources,
    mappings: bench.mappings,
    now: () => now,
  });
}

function levelOf(resolution: Awaited<ReturnType<typeof resolve>>, category: string) {
  return resolution.categories.find((resolved) => resolved.category === category)?.trustLevel;
}

const binding = (sourceId: string, submissionId: string, wallet = PHARMACY) => ({
  sourceId,
  submissionId,
  type: "IDENTITY_BINDING",
  walletAddressUrl: wallet,
  taxId: VALID_NIT,
  observedAt: "2026-10-16T12:00:00Z",
});

test("the demo ladder: self-declared, then the wallet's KYB attestation", async () => {
  const bench = createBench();
  await bench.submitOk({
    sourceId: "merchant",
    submissionId: "s1",
    type: "CATEGORY_CLAIM",
    subject: walletSubject(PHARMACY),
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  assert.equal(levelOf(await resolve(bench), "MEDICATION"), "SELF_DECLARED");

  await bench.submitOk(ciiuClaim("wallet", "s2", walletSubject(PHARMACY), [{ code: "4773", role: "PRIMARY" }]));
  const resolution = await resolve(bench);
  assert.equal(levelOf(resolution, "MEDICATION"), "PROVIDER_VERIFIED");
  assert.equal(levelOf(resolution, "PERSONAL_CARE"), "PROVIDER_VERIFIED");
  assert.deepEqual(resolution.categories.find((c) => c.category === "MEDICATION")?.sourceIds, ["merchant", "wallet"]);
  assert.deepEqual(resolution.conflicts, []);
  assert.equal(resolution.mappingVersion, bench.mappings.version);
  assert.equal(resolution.resolvedAt, NOW.toISOString());
});

test("an expired claim is ignored", async () => {
  const bench = createBench();
  await bench.submitOk(
    ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4773" }], { validUntil: "2026-10-16T14:00:00Z" }),
  );
  assert.equal(levelOf(await resolve(bench, PHARMACY, new Date("2026-10-16T13:00:00Z")), "MEDICATION"), "PROVIDER_VERIFIED");
  assert.deepEqual((await resolve(bench)).categories, []);
});

test("a revoked claim is ignored", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4773" }]));
  await bench.submitOk({ sourceId: "wallet", submissionId: "r1", type: "REVOCATION", revokesSubmissionId: "s1", reason: "closed" });
  assert.deepEqual((await resolve(bench)).categories, []);
});

test("registry evidence joins a wallet only through a binding, capped at the binding's level", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("registry", "s1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));
  assert.deepEqual((await resolve(bench)).categories, [], "no binding, no join");

  // A liquor store that types a pharmacy's NIT inherits nothing above SELF_DECLARED.
  await bench.submitOk(binding("merchant", "b1", LIQUOR));
  assert.equal(levelOf(await resolve(bench, LIQUOR), "MEDICATION"), "SELF_DECLARED");

  // The pharmacy's wallet provider attests the NIT after KYB.
  await bench.submitOk(binding("wallet", "b2", PHARMACY));
  assert.equal(levelOf(await resolve(bench, PHARMACY), "MEDICATION"), "PROVIDER_VERIFIED");
});

test("a pharmacy license is purpose-specific evidence", async () => {
  const bench = createBench();
  await bench.submitOk({
    sourceId: "health",
    submissionId: "l1",
    type: "LICENSE_CLAIM",
    subject: walletSubject(PHARMACY),
    licenseType: "CO_PHARMACY_ESTABLISHMENT",
    licenseRef: "demo-license",
    observedAt: "2026-10-16T12:00:00Z",
  });
  const resolution = await resolve(bench);
  assert.equal(levelOf(resolution, "MEDICATION"), "EXTERNAL_VERIFIED");
  assert.equal(levelOf(resolution, "PERSONAL_CARE"), undefined);
});

test("verified main activities that share no category conflict", async () => {
  const bench = createBench();
  await bench.submitOk(binding("wallet", "b1"));
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4773", role: "PRIMARY" }]));
  await bench.submitOk(ciiuClaim("registry", "s2", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4724", role: "PRIMARY" }]));

  const { conflicts } = await resolve(bench);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].categories, ["MEDICATION", "PERSONAL_CARE", "ALCOHOL", "TOBACCO"]);
});

test("a secondary activity does not conflict with a main one", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4711", role: "PRIMARY" }]));
  await bench.submitOk(
    ciiuClaim("health", "s2", walletSubject(PHARMACY), [{ code: "4711", role: "PRIMARY" }, { code: "4724", role: "SECONDARY" }]),
  );
  const resolution = await resolve(bench);
  assert.deepEqual(resolution.conflicts, []);
  assert.equal(levelOf(resolution, "ALCOHOL"), "EXTERNAL_VERIFIED");
});

test("a self-declared claim never creates a conflict", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(LIQUOR), [{ code: "4724", role: "PRIMARY" }]));
  await bench.submitOk({
    sourceId: "merchant",
    submissionId: "s2",
    type: "CATEGORY_CLAIM",
    subject: walletSubject(LIQUOR),
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  const resolution = await resolve(bench, LIQUOR);
  assert.deepEqual(resolution.conflicts, []);
  assert.equal(levelOf(resolution, "MEDICATION"), "SELF_DECLARED");
});

test("flags and unmapped codes are reported; unmapped codes give no category", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "9609" }]));
  await bench.submitOk({ sourceId: "wallet", submissionId: "f1", type: "FLAG", walletAddressUrl: PHARMACY, category: "MEDICATION", note: "basket mismatch" });
  const resolution = await resolve(bench);
  assert.deepEqual(resolution.categories, []);
  assert.deepEqual(resolution.unmappedEvidence, ["CIIU_REV4_AC:9609"]);
  assert.deepEqual(resolution.flags.map((flag) => flag.category), ["MEDICATION"]);
});

test("evidence from a source that is no longer registered is ignored", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4773" }]));
  const entries = await bench.trustLog.listByWalletAddress(PHARMACY);
  const withoutWallet = new Map(bench.sourceList.filter((s) => s.id !== "wallet").map((s) => [s.id, s]));
  const resolution = resolveMerchantCategories({
    walletAddressUrl: PHARMACY,
    entries,
    sources: withoutWallet,
    mappings: bench.mappings,
    now: NOW,
  });
  assert.deepEqual(resolution.categories, []);
});

const declare = (submissionId: string, categories: string[], wallet = PHARMACY) => ({
  sourceId: "merchant",
  submissionId,
  type: "CATEGORY_CLAIM",
  subject: walletSubject(wallet),
  declaredCategories: categories,
  observedAt: "2026-10-16T12:00:00Z",
});

function corroborationOf(resolution: Awaited<ReturnType<typeof resolve>>, category: string) {
  return resolution.declarations.find((declared) => declared.category === category)?.corroboration;
}

test("declarations: a tienda with only its own declaration is UNCORROBORATED", async () => {
  const bench = createBench();
  await bench.submitOk(declare("d1", ["FOOD"]));
  const resolution = await resolve(bench);
  assert.deepEqual(resolution.declarations.map((d) => [d.category, d.corroboration]), [["FOOD", "UNCORROBORATED"]]);
});

test("declarations: KYB that includes the declared category corroborates it, even as a secondary activity", async () => {
  const bench = createBench();
  await bench.submitOk(declare("d1", ["MEDICATION"]));
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "4711", role: "PRIMARY" }, { code: "4773", role: "SECONDARY" }]));
  assert.equal(corroborationOf(await resolve(bench), "MEDICATION"), "PROVIDER_VERIFIED");
});

test("declarations: the merchant's own CIIU code is not corroboration", async () => {
  const bench = createBench();
  await bench.submitOk({ ...declare("d1", ["MEDICATION"]), codes: [{ system: "CIIU_REV4_AC", code: "4773", role: "PRIMARY" }] });
  assert.equal(corroborationOf(await resolve(bench), "MEDICATION"), "UNCORROBORATED");
});

test("declarations: a Cámara claim through a self-typed NIT is REGISTRY_UNBOUND; a KYB binding lifts it to the binding's level", async () => {
  const bench = createBench();
  await bench.submitOk(declare("d1", ["MEDICATION"]));
  await bench.submitOk(ciiuClaim("registry", "r1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));
  await bench.submitOk(binding("merchant", "b1"));
  assert.equal(corroborationOf(await resolve(bench), "MEDICATION"), "REGISTRY_UNBOUND");

  // The binding caps the registry claim, so EXTERNAL_VERIFIED evidence through a KYB binding counts as PROVIDER_VERIFIED.
  await bench.submitOk(binding("wallet", "b2"));
  assert.equal(corroborationOf(await resolve(bench), "MEDICATION"), "PROVIDER_VERIFIED");
});

test("declarations: KYB placing the shop elsewhere contradicts a bare declaration", async () => {
  const bench = createBench();
  await bench.submitOk(declare("d1", ["MEDICATION"], LIQUOR));
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(LIQUOR), [{ code: "4724", role: "PRIMARY" }]));
  const declared = (await resolve(bench, LIQUOR)).declarations[0];
  assert.equal(declared.corroboration, "CONTRADICTED");
  assert.equal(declared.contradictingEntryIds.length, 1);
});

test("declarations: a stronger contradiction outranks a weaker registry match", async () => {
  const bench = createBench();
  // The liquor store types a pharmacy's NIT, but its own wallet's KYB says liquor.
  await bench.submitOk(declare("d1", ["MEDICATION"], LIQUOR));
  await bench.submitOk(ciiuClaim("registry", "r1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));
  await bench.submitOk(binding("merchant", "b1", LIQUOR));
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(LIQUOR), [{ code: "4724", role: "PRIMARY" }]));
  assert.equal(corroborationOf(await resolve(bench, LIQUOR), "MEDICATION"), "CONTRADICTED");
});

test("declarations: an unmapped registry activity neither supports nor contradicts", async () => {
  const bench = createBench();
  await bench.submitOk(declare("d1", ["FOOD"]));
  await bench.submitOk(ciiuClaim("wallet", "s1", walletSubject(PHARMACY), [{ code: "9609", role: "PRIMARY" }]));
  assert.equal(corroborationOf(await resolve(bench), "FOOD"), "UNCORROBORATED");
});

test("one NIT bound as strongly to two wallets is a conflict on both; a weaker binding elsewhere touches only itself", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("registry", "r1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));
  await bench.submitOk(binding("merchant", "b1", PHARMACY));
  await bench.submitOk(binding("merchant", "b2", LIQUOR));

  for (const wallet of [PHARMACY, LIQUOR]) {
    const { conflicts } = await resolve(bench, wallet);
    assert.deepEqual(conflicts.map((conflict) => conflict.categories), [["MEDICATION", "PERSONAL_CARE"]], wallet);
  }

  // The pharmacy's wallet provider binds the NIT after KYB. A self-typed copy elsewhere no longer touches it.
  await bench.submitOk(binding("wallet", "b3", PHARMACY));
  assert.deepEqual((await resolve(bench, PHARMACY)).conflicts, []);
  assert.equal((await resolve(bench, LIQUOR)).conflicts.length, 2, "the liquor store's binding is still contested");
});

test("a revoked binding elsewhere no longer contests the NIT", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("registry", "r1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));
  await bench.submitOk(binding("merchant", "b1", PHARMACY));
  await bench.submitOk(binding("merchant", "b2", LIQUOR));
  await bench.submitOk({ sourceId: "merchant", submissionId: "r2", type: "REVOCATION", revokesSubmissionId: "b2", reason: "typo" });
  assert.deepEqual((await resolve(bench, PHARMACY)).conflicts, []);
});
