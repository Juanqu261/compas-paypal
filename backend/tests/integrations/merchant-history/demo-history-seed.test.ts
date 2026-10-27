import assert from "node:assert/strict";
import test from "node:test";
import { seedDemoMerchantHistory } from "../../../src/integrations/merchant-history/demo-history-seed.ts";
import { InMemoryObservationLog } from "../../../src/integrations/merchant-history/in-memory-observation-log.ts";
import { InMemoryMandateRepository } from "../../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { DEMO_TIENDA_PAYPAL_ID } from "../../../src/integrations/merchant-registry/demo-category-seed.ts";
import { InMemorySpendingLog } from "../../../src/integrations/spending/in-memory-spending-log.ts";
import { partyRef } from "../../application/purchase-test-kit.ts";

const NOW = new Date("2026-10-16T15:00:00Z");
const SINCE = new Date("2026-01-01T00:00:00Z");

function stores() {
  return { mandates: new InMemoryMandateRepository(), spending: new InMemorySpendingLog() };
}

test("with purchase stores, every observation has its spending record and mandate", async () => {
  const observations = new InMemoryObservationLog();
  const purchases = stores();
  assert.equal(await seedDemoMerchantHistory({ observations, partyRef, now: NOW, purchases }), 24);

  for (const observation of await observations.listByMerchant(DEMO_TIENDA_PAYPAL_ID, SINCE)) {
    const n = observation.spendingRecordId.replace("demo-tienda-purchase-", "");
    const [record] = await purchases.spending.listByMandate(`demo-food-mandate-${n}`);
    assert.equal(record.id, observation.spendingRecordId);
  }
  assert.equal(await seedDemoMerchantHistory({ observations, partyRef, now: NOW, purchases }), 0, "already complete");
});

test("a start that stopped halfway is completed, without duplicates", async () => {
  const full = new InMemoryObservationLog();
  await seedDemoMerchantHistory({ observations: full, partyRef, now: NOW });
  const all = await full.listByMerchant(DEMO_TIENDA_PAYPAL_ID, SINCE);

  // The first start wrote every purchase and 22 of 24 observations, then stopped.
  const partial = new InMemoryObservationLog();
  const purchases = stores();
  await seedDemoMerchantHistory({ observations: new InMemoryObservationLog(), partyRef, now: NOW, purchases });
  for (const observation of all.slice(0, 22)) await partial.append(observation);

  assert.equal(await seedDemoMerchantHistory({ observations: partial, partyRef, now: NOW, purchases }), 2);
  assert.equal((await partial.listByMerchant(DEMO_TIENDA_PAYPAL_ID, SINCE)).length, 24);
});
