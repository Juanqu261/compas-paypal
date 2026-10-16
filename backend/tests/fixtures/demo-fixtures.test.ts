import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/demo",
);

function readFixture(name: string): {
  dataLabel: string;
  expectedPolicyResult: { outcome: string; reason?: string };
} {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

test("medication fixture is labeled demo data and expects ALLOW", () => {
  const fixture = readFixture("medication-pharmacy.json");
  assert.equal(fixture.dataLabel, "demo/test data");
  assert.equal(fixture.expectedPolicyResult.outcome, "ALLOW");
});

test("alcohol fixture expects DENY for a purpose mismatch", () => {
  const fixture = readFixture("alcohol-rejection.json");
  assert.equal(fixture.dataLabel, "demo/test data");
  assert.equal(fixture.expectedPolicyResult.outcome, "DENY");
  assert.equal(fixture.expectedPolicyResult.reason, "PURPOSE_MISMATCH");
});
