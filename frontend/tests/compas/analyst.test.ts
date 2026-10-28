import assert from "node:assert/strict";
import test from "node:test";
import type { AnalystFinding, AnalyzedSku } from "../../src/features/compas/api/contracts.ts";
import { analystRecord, invimaLabel, runFailureText } from "../../src/features/demo/analyst-view.ts";

const AT = "2026-10-27T12:00:00.000Z";

function mapping(skuId: string, outcome: "VERIFIED" | "REJECTED", recordedAt = AT): AnalystFinding {
  return { kind: "POINTER", pointer: "CUM_MAPPING", id: `finding-${skuId}-${recordedAt}`, runId: "run-1", skuId, cum: "1-1", outcome, recordedAt };
}

function flag(status: "OPEN" | "RESPONDED" | "WITHDRAWN"): AnalystFinding {
  return {
    kind: "JUDGMENT",
    id: `finding-flag-${status}`,
    runId: "run-1",
    judgment: "LOOKALIKE_SIGNALS",
    category: "MEDICATION",
    citedSkuIds: ["lk-gift-100"],
    note: "Claims to be another pharmacy.",
    status,
    recordedAt: AT,
  };
}

test("the record counts each SKU's latest mapping once, and only the flags a person hasn't withdrawn", () => {
  const record = analystRecord([
    mapping("a", "REJECTED", "2026-10-27T10:00:00.000Z"),
    mapping("a", "VERIFIED", "2026-10-27T11:00:00.000Z"),
    mapping("b", "VERIFIED"),
    mapping("c", "REJECTED"),
    flag("OPEN"),
    flag("RESPONDED"),
    flag("WITHDRAWN"),
  ]);
  assert.equal(record.verified, 2, "a re-run's mapping replaces the earlier one");
  assert.equal(record.rejected, 1);
  assert.deepEqual(record.flags.map((item) => item.kind === "JUDGMENT" && item.status), ["OPEN", "RESPONDED"]);
  assert.equal(record.lastRecordedAt, AT);
  assert.deepEqual(analystRecord([]), { verified: 0, rejected: 0, flags: [] });
});

test("INVIMA's word on a product is separate from the model's", () => {
  const sku = (itemClass: AnalyzedSku["itemClass"], outcome?: AnalyzedSku["outcome"]): AnalyzedSku => ({
    skuId: `${itemClass}-${outcome}`,
    name: "x",
    candidates: 5,
    itemClass,
    ...(outcome ? { cum: "1-1", outcome } : {}),
  });
  assert.equal(invimaLabel(sku("MEDICINE", "VERIFIED")).tone, "ok");
  assert.equal(invimaLabel(sku("MEDICINE", "REJECTED")).tone, "stop");
  assert.equal(invimaLabel(sku("MEDICINE")).text, "No CUM picked");
  assert.equal(invimaLabel(sku("NOT_MEDICINE")).text, "Nothing to check");
});

test("a failed run says why in plain words and never claims a result", () => {
  assert.match(runFailureText("ANALYST_JOBS_DISABLED"), /turned off/);
  assert.match(runFailureText("NotImplementedError"), /isn’t configured/);
  assert.match(runFailureText("AnalystOutputError"), /failed closed/);
  assert.equal(runFailureText("TypeError"), "The run failed (TypeError).");
});
