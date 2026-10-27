import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ingestCategoryClaim } from "../../../src/application/ingest-category-claim.ts";
import { refreshRegistryEvidence } from "../../../src/application/refresh-registry-evidence.ts";
import { loadMerchantCategoryResolution } from "../../../src/application/resolve-merchant-categories.ts";
import {
  JsonBusinessRegistryLookup,
  RUES_OPEN_DATA_PROVENANCE,
} from "../../../src/integrations/category-sources/json-business-registry-lookup.ts";
import { RegistryDbFeed } from "../../../src/integrations/category-sources/registry-db-feed.ts";
import { MERCHANT_REGISTRY_FILE } from "../../../src/integrations/merchant-registry/data-paths.ts";
import { createBench, NOW, PHARMACY, source } from "../../application/category-test-kit.ts";

type SeedRow = {
  registryKey: string;
  ciiu: { primary: string };
  owner: { type: string; nit?: string; checkDigit?: string };
};
const rows = (JSON.parse(readFileSync(MERCHANT_REGISTRY_FILE, "utf8")) as { records: SeedRow[] }).records;

// Picked from the seed, so a regenerated extract doesn't break the test.
const pharmacyOwner = rows.find((row) => row.owner.type === "PERSONA_JURIDICA" && row.ciiu.primary === "4773")!.owner;
const PHARMACY_NIT = `${pharmacyOwner.nit}-${pharmacyOwner.checkDigit}`;
const shopsOfOwner = rows.filter((row) => row.owner.nit === pharmacyOwner.nit);

const RUES_SOURCE = source("camaras-db/rues-open-data", {
  kind: "BUSINESS_REGISTRY",
  trustLevel: "EXTERNAL_VERIFIED",
  transport: "PULL",
  allowedEntryTypes: ["CATEGORY_CLAIM"],
  allowedLicenses: [],
});

test("a company NIT returns every one of its shops in the extract, active, with roles", async () => {
  const lookup = new JsonBusinessRegistryLookup();
  const records = await lookup.findByNit(pharmacyOwner.nit!);
  assert.equal(records.length, shopsOfOwner.length);
  for (const record of records) {
    assert.equal(record.status, "ACTIVE");
    assert.equal(record.provenance, RUES_OPEN_DATA_PROVENANCE);
    assert.equal(record.activities[0].role, "PRIMARY");
    assert.ok(record.activities.slice(1).every((activity) => activity.role === "SECONDARY"));
  }
  assert.ok(records.some((record) => `${record.camara}-${record.matricula}` === shopsOfOwner[0].registryKey));
});

test("a NIT that is not in the extract finds nothing", async () => {
  assert.deepEqual(await new JsonBusinessRegistryLookup().findByNit("800197268"), []);
});

test("the extract corroborates a declared MEDICATION through a self-typed NIT as REGISTRY_UNBOUND", async () => {
  const bench = createBench([RUES_SOURCE]);
  const ingest = (input: Parameters<typeof ingestCategoryClaim>[0]) => ingestCategoryClaim(input, bench.deps);
  const feed = new RegistryDbFeed({
    sourceId: RUES_SOURCE.id,
    provenance: RUES_OPEN_DATA_PROVENANCE,
    lookup: new JsonBusinessRegistryLookup(),
  });

  const refreshed = await refreshRegistryEvidence(PHARMACY_NIT, { feed, ingest });
  assert.deepEqual(refreshed, { recorded: shopsOfOwner.length, nothingToRevoke: 0, rejected: [] });

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
    taxId: PHARMACY_NIT,
    observedAt: "2026-10-16T12:00:00Z",
  });
  const resolution = await loadMerchantCategoryResolution(PHARMACY, {
    trustLog: bench.trustLog,
    sources: bench.sources,
    mappings: bench.mappings,
    now: () => NOW,
  });
  assert.equal(resolution.declarations[0].corroboration, "REGISTRY_UNBOUND");
});
