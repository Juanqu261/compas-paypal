import assert from "node:assert/strict";
import test from "node:test";
import type { AnalystJob } from "../../src/application/analyst-jobs.ts";
import type { CumMappingPointer } from "../../src/domain/analyst.ts";
import { createAnalystLayer, readRerunCooldownMs } from "../../src/integrations/analyst/create-analyst-layer.ts";
import { InMemoryAnalystRunStore } from "../../src/integrations/analyst/in-memory-analyst-run-store.ts";
import { createDemoMerchantDirectory, DEMO_MERCHANT_IDS } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { DEMO_DROGUERIA_PAYPAL_ID } from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import type { AnalystRunStore } from "../../src/ports/analyst-run-store.ts";

const notCalled = new Proxy({}, { get: () => () => { throw new Error("not called when restoring"); } });

function pointer(skuId: string, cum: string, outcome: "VERIFIED" | "REJECTED"): CumMappingPointer {
  return {
    kind: "POINTER",
    pointer: "CUM_MAPPING",
    id: `finding-${skuId}`,
    runId: "run-before-restart",
    paypalMerchantId: DEMO_DROGUERIA_PAYPAL_ID,
    skuId,
    cum,
    outcome,
    recordedAt: "2026-10-29T13:00:00.000Z",
  };
}

function job(finishedAt: string): AnalystJob {
  return {
    id: "analyst-job-before-restart",
    merchantId: DEMO_MERCHANT_IDS.drogueria,
    status: "COMPLETED",
    result: { runId: "run-before-restart", status: "COMPLETED", items: 8, verifiedMappings: 2, rejectedMappings: 0, newFlags: 0, skus: [] },
    createdAt: finishedAt,
    finishedAt,
  };
}

/** A process starting with what an earlier one stored. Offline: the demo CUM subset, no model, no Elastic. */
async function restart(runs: AnalystRunStore) {
  const layer = await createAnalystLayer({
    env: { CUM_REGISTRY: "demo" },
    merchants: createDemoMerchantDirectory({}),
    registry: notCalled as never,
    ingest: notCalled as never,
    demo: true,
    runs,
  });
  return { layer, restored: await layer.restoreRuns() };
}

test("after a restart, the last real run is shown again, its cooldown holds, and its pointers are verified again, not trusted", async () => {
  const runs = new InMemoryAnalystRunStore();
  await runs.save({
    merchantId: DEMO_MERCHANT_IDS.drogueria,
    paypalMerchantId: DEMO_DROGUERIA_PAYPAL_ID,
    job: job(new Date().toISOString()),
    findings: [
      pointer("dc-losartan-50", "19996998-1", "VERIFIED"),
      // Stored as VERIFIED, but sunscreen is not losartán: the verifier says so again.
      pointer("dc-protector-solar", "19996998-1", "VERIFIED"),
    ],
  });

  const { layer, restored } = await restart(runs);
  assert.equal(restored, 1);
  assert.equal((await layer.findings.listByMerchant(DEMO_DROGUERIA_PAYPAL_ID)).length, 2);
  assert.equal((await layer.mappings.get(DEMO_DROGUERIA_PAYPAL_ID, "dc-losartan-50"))?.status, "VERIFIED");
  assert.equal((await layer.mappings.get(DEMO_DROGUERIA_PAYPAL_ID, "dc-protector-solar"))?.status, "REJECTED");

  const status = layer.jobs.status(DEMO_MERCHANT_IDS.drogueria);
  assert.equal(status.latest?.id, "analyst-job-before-restart");
  assert.ok(status.nextRunAt, "the cooldown survives the restart");
  assert.equal(layer.jobs.enqueue(DEMO_MERCHANT_IDS.drogueria).ok, false);
});

test("a run stored for another PayPal account is stale and not restored", async () => {
  const runs = new InMemoryAnalystRunStore();
  await runs.save({
    merchantId: DEMO_MERCHANT_IDS.drogueria,
    paypalMerchantId: "OLDACCOUNT234",
    job: job(new Date().toISOString()),
    findings: [{ ...pointer("dc-losartan-50", "19996998-1", "VERIFIED"), paypalMerchantId: "OLDACCOUNT234" }],
  });
  const { layer, restored } = await restart(runs);
  assert.equal(restored, 0);
  assert.equal(layer.jobs.status(DEMO_MERCHANT_IDS.drogueria).latest, undefined);
  assert.equal(await layer.mappings.get(DEMO_DROGUERIA_PAYPAL_ID, "dc-losartan-50"), undefined);
});

test("a store that can't be read starts the analyst empty instead of failing the server", async () => {
  const broken: AnalystRunStore = {
    save: async () => {},
    list: async () => {
      throw new Error('relation "compas.analyst_runs" does not exist');
    },
  };
  const { restored } = await restart(broken);
  assert.equal(restored, 0);
});

test("the cooldown is six hours unless COMPAS_ANALYST_RERUN_HOURS says otherwise", () => {
  assert.equal(readRerunCooldownMs({}), 6 * 60 * 60 * 1000);
  assert.equal(readRerunCooldownMs({ COMPAS_ANALYST_RERUN_HOURS: "0.5" }), 30 * 60 * 1000);
  assert.equal(readRerunCooldownMs({ COMPAS_ANALYST_RERUN_HOURS: "0" }), 0);
  assert.equal(readRerunCooldownMs({ COMPAS_ANALYST_RERUN_HOURS: "-1" }), 6 * 60 * 60 * 1000);
});
