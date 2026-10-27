import assert from "node:assert/strict";
import { sign } from "node:crypto";
import test from "node:test";
import {
  handleGetMerchantCategories,
  handleIngestCategoryClaim,
} from "../../src/api/merchant-categories.ts";
import { ingestCategoryClaim } from "../../src/application/ingest-category-claim.ts";
import { TrustLogMerchantRegistry } from "../../src/integrations/merchant-registry/trust-log-merchant-registry.ts";
import {
  ciiuClaim,
  createBench,
  newKey,
  NOW,
  PHARMACY,
  VALID_NIT,
  merchantSubject,
} from "../application/category-test-kit.ts";

function routes() {
  const bench = createBench();
  const deps = {
    ingest: (input: Parameters<typeof ingestCategoryClaim>[0]) => ingestCategoryClaim(input, bench.deps),
    registry: new TrustLogMerchantRegistry({
      trustLog: bench.trustLog,
      sources: bench.sources,
      mappings: bench.mappings,
      now: () => NOW,
    }),
    sources: bench.sources,
  };
  const signed = (submission: Record<string, unknown>, key = bench.key) => {
    const body = bench.encode(submission);
    return { body, signature: sign(null, body, key.privateKey).toString("base64url") };
  };
  return { bench, deps, signed };
}

test("POST accepts a signed claim with 202, and a repeat with 200", async () => {
  const { deps, signed } = routes();
  const { body, signature } = signed(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]));

  const first = await handleIngestCategoryClaim(body, signature, deps);
  assert.equal(first.status, 202);
  assert.equal(typeof first.body.entryId, "string");

  const again = await handleIngestCategoryClaim(body, signature, deps);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
});

test("POST refuses a missing or wrong signature with 401 and records nothing", async () => {
  const { bench, deps, signed } = routes();
  const { body } = signed(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]));

  const unsigned = await handleIngestCategoryClaim(body, undefined, deps);
  assert.deepEqual([unsigned.status, unsigned.body.error], [401, "BAD_SIGNATURE"]);

  const forged = signed(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]), newKey());
  const wrongKey = await handleIngestCategoryClaim(forged.body, forged.signature, deps);
  assert.equal(wrongKey.status, 401);
  assert.equal((await bench.trustLog.listByPayPalMerchant(PHARMACY)).length, 0);
});

test("POST maps validation and permission errors to 400 and 403", async () => {
  const { deps, signed } = routes();
  const malformed = signed({ sourceId: "wallet", submissionId: "s1", type: "NOPE" });
  assert.equal((await handleIngestCategoryClaim(malformed.body, malformed.signature, deps)).status, 400);

  const selfDeclaredByWallet = signed({
    sourceId: "wallet",
    submissionId: "s2",
    type: "CATEGORY_CLAIM",
    subject: merchantSubject(PHARMACY),
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  assert.equal((await handleIngestCategoryClaim(selfDeclaredByWallet.body, selfDeclaredByWallet.signature, deps)).status, 403);
});

test("GET returns categories and trust levels, never subject refs or entry ids", async () => {
  const { bench, deps } = routes();
  await bench.submitOk({
    sourceId: "wallet",
    submissionId: "b1",
    type: "IDENTITY_BINDING",
    paypalMerchantId: PHARMACY,
    taxId: VALID_NIT,
    observedAt: "2026-10-16T12:00:00Z",
  });
  await bench.submitOk(ciiuClaim("registry", "s1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773", role: "PRIMARY" }]));

  const response = await handleGetMerchantCategories(
    // Lower case and padded: the id is normalized before the lookup.
    new URL(`http://localhost/merchants/categories?paypalMerchantId=${encodeURIComponent(` ${PHARMACY.toLowerCase()} `)}`),
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.paypalMerchantId, PHARMACY);
  assert.equal(response.body.dataLabel, "demo/test data");
  assert.deepEqual(response.body.categories, [
    { category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED", sourceIds: ["registry"], simulated: true },
    { category: "PERSONAL_CARE", trustLevel: "PROVIDER_VERIFIED", sourceIds: ["registry"], simulated: true },
  ]);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(bench.subjectRef("800197268")), false);
  assert.equal(serialized.includes("800197268"), false);
  assert.equal(serialized.includes("entry-"), false);
});

test("GET without a valid PayPal merchant id is 400", async () => {
  const { deps } = routes();
  for (const query of ["", "?paypalMerchantId=nope", "?paypalMerchantId=https://x.example/a", "?walletAddress=TESTPHARMACY2"]) {
    const response = await handleGetMerchantCategories(new URL(`http://localhost/merchants/categories${query}`), deps);
    assert.equal(response.status, 400, query);
  }
});
