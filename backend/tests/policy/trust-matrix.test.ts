import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TrustMatrix } from "../../src/domain/trust-matrix.ts";
import { loadTrustMatrix } from "../../src/integrations/merchant-history/json-trust-matrix.ts";
import { merchantConfidence, trustMatrixViolations } from "../../src/policy/trust-matrix.ts";

const seed = loadTrustMatrix();

type EditableMatrix = Omit<TrustMatrix, "cells"> & { cells: Record<string, Record<string, string>> };

function edited(change: (matrix: EditableMatrix) => void): TrustMatrix {
  const copy = structuredClone(seed) as unknown as EditableMatrix;
  change(copy);
  return copy as unknown as TrustMatrix;
}

test("the seeded matrix loads and keeps every invariant", () => {
  assert.deepEqual(trustMatrixViolations(seed), []);
  assert.equal(merchantConfidence(seed, "PROVIDER_VERIFIED", "NONE"), "HIGH");
  assert.equal(merchantConfidence(seed, "UNCORROBORATED", "NONE"), "LOW");
  assert.equal(merchantConfidence(seed, "UNCORROBORATED", "ESTABLISHED"), "MEDIUM");
  assert.equal(merchantConfidence(seed, "REGISTRY_UNBOUND", "EMERGING"), "MEDIUM");
  assert.equal(merchantConfidence(seed, "EXTERNAL_VERIFIED", "CONTRADICTED"), "CONTESTED");
});

test("history alone can never reach HIGH", () => {
  for (const tier of ["UNCORROBORATED", "REGISTRY_UNBOUND"]) {
    const problems = trustMatrixViolations(edited((m) => { m.cells[tier].ESTABLISHED = "HIGH"; }));
    assert.ok(problems.some((problem) => problem.includes("only an independent attester")), tier);
  }
});

test("a contradiction is always CONTESTED", () => {
  assert.ok(trustMatrixViolations(edited((m) => { m.cells.EXTERNAL_VERIFIED.CONTRADICTED = "LOW"; })).length > 0);
  assert.ok(trustMatrixViolations(edited((m) => { m.cells.CONTRADICTED.ESTABLISHED = "MEDIUM"; })).length > 0);
});

test("CONTESTED only where something contradicts", () => {
  assert.ok(trustMatrixViolations(edited((m) => { m.cells.UNCORROBORATED.NONE = "CONTESTED"; })).length > 0);
});

test("better evidence or better history never lowers confidence", () => {
  assert.ok(trustMatrixViolations(edited((m) => { m.cells.PROVIDER_VERIFIED.ESTABLISHED = "MEDIUM"; })).length > 0);
  assert.ok(trustMatrixViolations(edited((m) => { m.cells.REGISTRY_UNBOUND.NONE = "MEDIUM"; m.cells.REGISTRY_UNBOUND.EMERGING = "LOW"; })).length > 0);
});

test("thresholds are positive integers, and ESTABLISHED asks at least as much as EMERGING", () => {
  assert.ok(trustMatrixViolations(edited((m) => { m.history.emerging.minConfirmingPayers = 0; })).length > 0);
  assert.ok(trustMatrixViolations(edited((m) => { m.history.contradicted.ratioDenominator = 2.5; })).length > 0);
  assert.ok(trustMatrixViolations(edited((m) => { m.history.established.minConfirmingPayers = 2; })).length > 0);
  assert.ok(trustMatrixViolations(edited((m) => { m.history.established.minSpanDays = 200; })).length > 0);
});

test("the loader refuses a file that breaks an invariant", () => {
  const dir = mkdtempSync(join(tmpdir(), "compas-matrix-"));
  const file = join(dir, "trust-matrix.json");
  writeFileSync(file, JSON.stringify(edited((m) => { m.cells.UNCORROBORATED.ESTABLISHED = "HIGH"; })));
  assert.throws(() => loadTrustMatrix(file), /invariants/);

  writeFileSync(file, JSON.stringify({ ...seed, incompatible: { MEDICATION: ["BEER"] } }));
  assert.throws(() => loadTrustMatrix(file), /incompatible/);
});
