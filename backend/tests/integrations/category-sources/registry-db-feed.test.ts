import assert from "node:assert/strict";
import test from "node:test";
import { refreshRegistryEvidence } from "../../../src/application/refresh-registry-evidence.ts";
import { loadMerchantCategoryResolution } from "../../../src/application/resolve-merchant-categories.ts";
import { ingestCategoryClaim } from "../../../src/application/ingest-category-claim.ts";
import {
  RegistryDbFeed,
  registrySubmissionId,
  renewalDeadline,
} from "../../../src/integrations/category-sources/registry-db-feed.ts";
import { UnimplementedBusinessRegistryLookup } from "../../../src/integrations/category-sources/unimplemented-business-registry-lookup.ts";
import type { RegistryMerchantRecord } from "../../../src/ports/business-registry-lookup.ts";
import { createBench, NOW, PHARMACY, source, VALID_NIT } from "../../application/category-test-kit.ts";

/** Shaped like the PROVISIONAL contract. Not real registry data. */
function record(overrides: Partial<RegistryMerchantRecord> = {}): RegistryMerchantRecord {
  return {
    nit: VALID_NIT,
    matricula: "21-123456-01",
    camara: "CCMA",
    status: "ACTIVE",
    lastRenewalYear: 2026,
    activities: [{ ciiu: "4773", role: "PRIMARY" }, { ciiu: "4711", role: "SECONDARY" }],
    snapshotAt: "2026-10-01T00:00:00Z",
    provenance: "rues-lookup",
    ...overrides,
  };
}

const PULL_SOURCE = source("camaras-db/rues-lookup", {
  kind: "BUSINESS_REGISTRY",
  trustLevel: "EXTERNAL_VERIFIED",
  transport: "PULL",
  allowedEntryTypes: ["CATEGORY_CLAIM"],
  allowedLicenses: [],
});

function feedOver(records: RegistryMerchantRecord[]) {
  const asked: string[] = [];
  const feed = new RegistryDbFeed({
    sourceId: PULL_SOURCE.id,
    provenance: "rues-lookup",
    lookup: { async findByNit(nit) { asked.push(nit); return records; } },
  });
  return { feed, asked };
}

test("an active matrícula becomes a claim about the NIT, roles kept, valid until the renewal deadline", async () => {
  const { feed, asked } = feedOver([record()]);
  const [submission] = (await feed.lookupByTaxId("800.197.268-4")) as Record<string, unknown>[];
  assert.deepEqual(asked, ["800197268"]);
  assert.deepEqual(submission, {
    schemaVersion: "1",
    sourceId: "camaras-db/rues-lookup",
    submissionId: "rdb:CCMA:21-123456-01:2026",
    type: "CATEGORY_CLAIM",
    subject: { kind: "TAX_ID", taxId: "800197268" },
    codes: [
      { system: "CIIU_REV4_AC", code: "4773", role: "PRIMARY" },
      { system: "CIIU_REV4_AC", code: "4711", role: "SECONDARY" },
    ],
    observedAt: "2026-10-01T00:00:00.000Z",
    validUntil: "2027-04-01T05:00:00.000Z",
    evidenceRef: "CCMA:21-123456-01",
  });
  assert.equal(renewalDeadline(2026), "2027-04-01T05:00:00.000Z");
});

test("a cancelled matrícula revokes this source's claim for that renewal", async () => {
  const { feed } = feedOver([record({ status: "CANCELLED" })]);
  const [submission] = (await feed.lookupByTaxId(VALID_NIT)) as Record<string, unknown>[];
  assert.equal(submission.type, "REVOCATION");
  assert.equal(submission.revokesSubmissionId, registrySubmissionId(record()));
});

test("rows from another provenance and rows past their renewal deadline give nothing", async () => {
  const { feed } = feedOver([
    record({ provenance: "scraped-dataset-v1" }),
    record({ lastRenewalYear: 2024, snapshotAt: "2026-10-01T00:00:00Z" }),
  ]);
  assert.deepEqual(await feed.lookupByTaxId(VALID_NIT), []);
});

test("a malformed NIT is refused before any lookup", async () => {
  const { feed, asked } = feedOver([record()]);
  await assert.rejects(feed.lookupByTaxId("not-a-nit"));
  assert.deepEqual(asked, []);
});

test("the placeholder lookup never fabricates rows", async () => {
  await assert.rejects(new UnimplementedBusinessRegistryLookup().findByNit(), /not implemented/);
});

test("refresh ingests through the one ingestion path; the claim reaches a wallet only through a binding", async () => {
  const bench = createBench([PULL_SOURCE]);
  const ingest = (input: Parameters<typeof ingestCategoryClaim>[0]) => ingestCategoryClaim(input, bench.deps);
  const resolve = () =>
    loadMerchantCategoryResolution(PHARMACY, { trustLog: bench.trustLog, sources: bench.sources, mappings: bench.mappings, now: () => NOW });

  const { feed } = feedOver([record()]);
  assert.deepEqual(await refreshRegistryEvidence(VALID_NIT, { feed, ingest }), { recorded: 1, nothingToRevoke: 0, rejected: [] });
  assert.deepEqual(await refreshRegistryEvidence(VALID_NIT, { feed, ingest }), { recorded: 1, nothingToRevoke: 0, rejected: [] }, "idempotent");

  // The merchant declares MEDICATION and types its NIT itself.
  await bench.submitOk({
    sourceId: "merchant",
    submissionId: "d1",
    type: "CATEGORY_CLAIM",
    subject: { kind: "PAYPAL_MERCHANT", paypalMerchantId: PHARMACY },
    declaredCategories: ["MEDICATION"],
    observedAt: "2026-10-16T12:00:00Z",
  });
  await bench.submitOk({
    sourceId: "merchant",
    submissionId: "b1",
    type: "IDENTITY_BINDING",
    paypalMerchantId: PHARMACY,
    taxId: VALID_NIT,
    observedAt: "2026-10-16T12:00:00Z",
  });
  const resolution = await resolve();
  assert.equal(resolution.categories.find((c) => c.category === "MEDICATION")?.trustLevel, "SELF_DECLARED", "capped by the binding");
  assert.equal(resolution.declarations[0].corroboration, "REGISTRY_UNBOUND");

  // The registry later reports the matrícula cancelled.
  const cancelled = feedOver([record({ status: "CANCELLED" })]).feed;
  assert.deepEqual(await refreshRegistryEvidence(VALID_NIT, { feed: cancelled, ingest }), { recorded: 1, nothingToRevoke: 0, rejected: [] });
  assert.equal((await resolve()).declarations[0].corroboration, "UNCORROBORATED");
});

test("revoking a claim the source never made is reported, not an error", async () => {
  const bench = createBench([PULL_SOURCE]);
  const ingest = (input: Parameters<typeof ingestCategoryClaim>[0]) => ingestCategoryClaim(input, bench.deps);
  const { feed } = feedOver([record({ status: "INACTIVE" })]);
  assert.deepEqual(await refreshRegistryEvidence(VALID_NIT, { feed, ingest }), { recorded: 0, nothingToRevoke: 1, rejected: [] });
});

test("a row the ingestion path refuses is reported with its code", async () => {
  const bench = createBench([PULL_SOURCE]);
  const ingest = (input: Parameters<typeof ingestCategoryClaim>[0]) => ingestCategoryClaim(input, bench.deps);
  const { feed } = feedOver([record({ activities: [{ ciiu: "47A3", role: "PRIMARY" }] })]);
  const result = await refreshRegistryEvidence(VALID_NIT, { feed, ingest });
  assert.equal(result.recorded, 0);
  assert.deepEqual(result.rejected.map((r) => r.code), ["INVALID_CODE"]);
});
