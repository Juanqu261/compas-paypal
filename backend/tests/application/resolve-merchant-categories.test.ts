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
