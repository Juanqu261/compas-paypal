import assert from "node:assert/strict";
import test from "node:test";
import { ingestCategoryClaim } from "../../src/application/ingest-category-claim.ts";
import {
  ciiuClaim,
  createBench,
  newKey,
  PHARMACY,
  VALID_NIT,
  merchantSubject,
} from "./category-test-kit.ts";

test("a signed wallet claim is recorded with the source's trust, not its own", async () => {
  const bench = createBench();
  const result = await bench.submit(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773", role: "PRIMARY" }]));
  assert.deepEqual(result, { ok: true, entryId: "entry-1", duplicate: false });

  const [entry] = await bench.trustLog.listByPayPalMerchant(PHARMACY);
  assert.equal(entry.type, "CATEGORY_CLAIM");
  assert.equal("trustLevel" in entry, false);
});

test("a submission that names its own trust level is refused", async () => {
  const bench = createBench();
  const result = await bench.submit({
    ...ciiuClaim("merchant", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]),
    trustLevel: "EXTERNAL_VERIFIED",
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "INVALID_SUBMISSION");
});

test("malformed submissions are INVALID_SUBMISSION", async () => {
  const bench = createBench();
  const cases: Record<string, unknown>[] = [
    { sourceId: "wallet", submissionId: "s1", type: "NOPE" },
    { ...ciiuClaim("wallet", "s1", merchantSubject("not a paypal id"), [{ code: "4773" }]) },
    { ...ciiuClaim("wallet", "s1", merchantSubject("https://wallet.example/pharmacy"), [{ code: "4773" }]) },
    { ...ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), []) },
    { ...ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773", role: "PRIMARY" }, { code: "4711", role: "PRIMARY" }]) },
    { ...ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]), extra: true },
    { ...ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }], { validUntil: "2026-10-01T00:00:00Z" }) },
  ];
  for (const submission of cases) {
    const result = await bench.submit(submission);
    assert.equal(!result.ok && result.code, "INVALID_SUBMISSION", JSON.stringify(submission));
  }

  const notJson = await ingestCategoryClaim(
    { body: new TextEncoder().encode("{oops"), transport: "PUSH", signature: "x" },
    bench.deps,
  );
  assert.equal(!notJson.ok && notJson.code, "INVALID_SUBMISSION");
});

test("an unknown source, or a push for a pull source, is UNKNOWN_SOURCE", async () => {
  const bench = createBench();
  const unknown = await bench.submit(ciiuClaim("visa", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]));
  assert.equal(!unknown.ok && unknown.code, "UNKNOWN_SOURCE");

  const pulled = await ingestCategoryClaim(
    { body: bench.encode(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }])), transport: "PULL" },
    bench.deps,
  );
  assert.equal(!pulled.ok && pulled.code, "UNKNOWN_SOURCE");
});

test("a missing, wrong-key or tampered signature is BAD_SIGNATURE", async () => {
  const bench = createBench();
  const claim = ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]);

  const missing = await bench.submit(claim, { signature: null });
  assert.equal(!missing.ok && missing.code, "BAD_SIGNATURE");

  const wrongKey = await bench.submit(claim, { signWith: newKey() });
  assert.equal(!wrongKey.ok && wrongKey.code, "BAD_SIGNATURE");

  const tampered = await bench.submit(claim, { signature: "AAAA" });
  assert.equal(!tampered.ok && tampered.code, "BAD_SIGNATURE");
  assert.equal((await bench.trustLog.listByPayPalMerchant(PHARMACY)).length, 0);
});

test("only a MERCHANT source may self-declare, and only about its PayPal merchant id", async () => {
  const bench = createBench();
  const byMerchant = await bench.submit({
    sourceId: "wallet",
    submissionId: "s1",
    type: "CATEGORY_CLAIM",
    subject: merchantSubject(PHARMACY),
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  assert.equal(!byMerchant.ok && byMerchant.code, "EVIDENCE_NOT_ALLOWED");

  const aboutTaxId = await bench.submit(ciiuClaim("merchant", "s2", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773" }]));
  assert.equal(!aboutTaxId.ok && aboutTaxId.code, "EVIDENCE_NOT_ALLOWED");

  const ok = await bench.submit({
    sourceId: "merchant",
    submissionId: "s3",
    type: "CATEGORY_CLAIM",
    subject: merchantSubject(PHARMACY),
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  assert.equal(ok.ok, true);
});

test("a license the source may not assert is EVIDENCE_NOT_ALLOWED", async () => {
  const bench = createBench();
  const result = await bench.submit({
    sourceId: "merchant",
    submissionId: "s1",
    type: "LICENSE_CLAIM",
    subject: merchantSubject(PHARMACY),
    licenseType: "CO_PHARMACY_ESTABLISHMENT",
    licenseRef: "self-typed",
    observedAt: "2026-10-16T12:00:00Z",
  });
  assert.equal(!result.ok && result.code, "EVIDENCE_NOT_ALLOWED");
});

test("bad codes and bad NITs are refused after the signature check", async () => {
  const bench = createBench();
  const badCode = await bench.submit(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "477" }]));
  assert.equal(!badCode.ok && badCode.code, "INVALID_CODE");

  const badNit = await bench.submit(ciiuClaim("registry", "s2", { kind: "TAX_ID", taxId: "800197268-5" }, [{ code: "4773" }]));
  assert.equal(!badNit.ok && badNit.code, "INVALID_IDENTIFIER");
});

test("a raw NIT never reaches the trust log", async () => {
  const bench = createBench();
  await bench.submitOk(ciiuClaim("registry", "s1", { kind: "TAX_ID", taxId: VALID_NIT }, [{ code: "4773" }]));
  await bench.submitOk({
    sourceId: "wallet",
    submissionId: "s2",
    type: "IDENTITY_BINDING",
    paypalMerchantId: PHARMACY,
    taxId: VALID_NIT,
    observedAt: "2026-10-16T12:00:00Z",
  });

  const ref = bench.subjectRef("800197268");
  const stored = [
    ...(await bench.trustLog.listBySubjectRef(ref)),
    ...(await bench.trustLog.listByPayPalMerchant(PHARMACY)),
  ];
  assert.equal(stored.length, 2);
  const serialized = JSON.stringify(stored);
  assert.equal(serialized.includes("800197268"), false);
  assert.equal(serialized.includes(ref), true);
});

test("resubmitting the same body is idempotent; reusing the id with another body is refused", async () => {
  const bench = createBench();
  const claim = ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]);
  await bench.submitOk(claim);

  const again = await bench.submit(claim);
  assert.deepEqual(again, { ok: true, entryId: "entry-1", duplicate: true });

  const changed = await bench.submit(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4724" }]));
  assert.equal(!changed.ok && changed.code, "SUBMISSION_ID_REUSED");
  assert.equal((await bench.trustLog.listByPayPalMerchant(PHARMACY)).length, 1);
});

test("a source can revoke only its own submissions", async () => {
  const bench = createBench();
  const target = await bench.submitOk(ciiuClaim("wallet", "s1", merchantSubject(PHARMACY), [{ code: "4773" }]));

  const byOther = await bench.submit({ sourceId: "registry", submissionId: "r1", type: "REVOCATION", revokesSubmissionId: "s1", reason: "x" });
  assert.equal(!byOther.ok && byOther.code, "REVOCATION_TARGET_NOT_FOUND");

  const byOwner = await bench.submit({ sourceId: "wallet", submissionId: "r2", type: "REVOCATION", revokesSubmissionId: "s1", reason: "merchant closed" });
  assert.equal(byOwner.ok, true);
  const revocations = await bench.trustLog.listRevocationsFor([target]);
  assert.equal(revocations.length, 1);
});
