import assert from "node:assert/strict";
import test from "node:test";
import type { AnalystFinding, AnalyzedSku } from "../../src/features/compas/api/contracts.ts";
import { analystRecord, invimaLabel, liveRunButton, runFailureText, runTime } from "../../src/features/demo/analyst-view.ts";

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

test("the run button waits for the cooldown and says until when; a run in progress says so", () => {
  const now = Date.parse("2026-10-29T15:00:00Z");
  const next = "2026-10-29T20:00:00Z";
  const waiting = liveRunButton({ busy: false, hasRun: true, nextRunAt: next, now, locale: "en-GB" });
  assert.equal(waiting.disabled, true);
  assert.match(waiting.label, /^Next live run at \d{2}:\d{2}$/);
  assert.deepEqual(liveRunButton({ busy: false, hasRun: true, nextRunAt: next, now: Date.parse(next) }), {
    label: "Run again live",
    disabled: false,
  });
  assert.deepEqual(liveRunButton({ busy: false, hasRun: false, now }), { label: "Run the analyst", disabled: false });
  assert.deepEqual(liveRunButton({ busy: true, hasRun: true, nextRunAt: next, now }), { label: "Running…", disabled: true });
});

test("a run's time is the time alone today, with the date another day", () => {
  const now = new Date("2026-10-29T15:00:00");
  assert.match(runTime("2026-10-29T14:02:00", now, "en-GB"), /^14:02$/);
  assert.match(runTime("2026-10-28T14:02:00", now, "en-GB"), /^28 Oct, 14:02$/);
});
