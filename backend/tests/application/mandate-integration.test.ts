import assert from "node:assert/strict";
import test from "node:test";
import { MANDATE_EVENTS } from "../../src/application/mandates.ts";
import { InMemoryMandateRepository } from "../../src/integrations/mandates/in-memory-mandate-repository.ts";
import { ANDREA, medicationRequest, PEDRO, serviceKit } from "./mandate-test-kit.ts";
import { mandate as fixtureMandate } from "./purchase-test-kit.ts";

/**
 * Regressions for merging the COMPAS experience with main's Postgres storage
 * and atomic budget reservation. They run against the in-memory adapters; the
 * same contract is checked on Postgres in tests/integrations/postgres/.
 */

const USD = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });

async function activeMandate(kit: ReturnType<typeof serviceKit>) {
  const created = await kit.service.create(PEDRO, medicationRequest());
  assert.ok(created.ok);
  const id = created.mandate.id;
  assert.ok((await kit.service.authorize(PEDRO, id)).ok);
  return id;
}

test("two concurrent reservations can't take more capacity than the mandate has", async () => {
  const mandates = new InMemoryMandateRepository();
  await mandates.save(fixtureMandate("ENFORCED", { remainingAuthorizedAmount: USD("3000") }));
  const results = await Promise.all([
    mandates.reserveCapacity("demo-mandate-medication", USD("2000")),
    mandates.reserveCapacity("demo-mandate-medication", USD("2000")),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual((await mandates.getById("demo-mandate-medication"))?.remainingAuthorizedAmount, USD("1000"));
});

test("transitionStatus changes the status only, so a reservation made after the read survives", async () => {
  const mandates = new InMemoryMandateRepository();
  await mandates.save(fixtureMandate());
  const staleRead = await mandates.getById("demo-mandate-medication");
  assert.ok(await mandates.reserveCapacity("demo-mandate-medication", USD("1120")));

  const revoked = await mandates.transitionStatus("demo-mandate-medication", ["ACTIVE"], "REVOKED");
  assert.equal(revoked?.status, "REVOKED");
  assert.deepEqual(revoked?.remainingAuthorizedAmount, USD("2880"), "the reservation is kept");

  // What a full save of the stale read would have done: give the capacity back.
  assert.deepEqual(staleRead?.remainingAuthorizedAmount, USD("4000"));
  assert.equal(await mandates.transitionStatus("demo-mandate-medication", ["ACTIVE"], "EXPIRED"), undefined, "wrong from-status");
});

test("activation, expiry and revocation never restore capacity a purchase reserved", async () => {
  const kit = serviceKit();
  const id = await activeMandate(kit);
  assert.ok(await kit.mandates.reserveCapacity(id, USD("1120")));

  const revoked = await kit.service.revoke(PEDRO, id);
  assert.ok(revoked.ok);
  assert.deepEqual(revoked.mandate.remainingAuthorizedAmount, USD("2880"));
  assert.equal(await kit.mandates.reserveCapacity(id, USD("100")), false, "a revoked mandate takes no new reservation");

  const kit2 = serviceKit();
  const id2 = await activeMandate(kit2);
  assert.ok(await kit2.mandates.reserveCapacity(id2, USD("500")));
  kit2.setNow(new Date("2026-12-01T00:00:00Z"));
  const expired = await kit2.service.get(PEDRO, id2);
  assert.ok(expired.ok);
  assert.equal(expired.mandate.status, "EXPIRED");
  assert.deepEqual(expired.mandate.remainingAuthorizedAmount, USD("3500"));
});

test("a mandate with no capacity left shows EXHAUSTED and comes back when a reservation is released", async () => {
  const kit = serviceKit();
  const id = await activeMandate(kit);
  assert.ok(await kit.mandates.reserveCapacity(id, USD("4000")));

  const asPedro = await kit.service.get(PEDRO, id);
  assert.ok(asPedro.ok);
  assert.equal(asPedro.mandate.status, "EXHAUSTED");
  assert.equal(asPedro.mandate.usable, false);
  const asAndrea = await kit.service.list(ANDREA, "DELEGATE");
  assert.equal(asAndrea[0].status, "EXHAUSTED");
  assert.equal(await kit.mandates.reserveCapacity(id, USD("1")), false);

  // The payer cancelled the PayPal order, so the settlement gives the reservation back.
  await kit.mandates.releaseCapacity(id, USD("4000"));
  const again = await kit.service.get(PEDRO, id);
  assert.ok(again.ok);
  assert.equal(again.mandate.status, "ACTIVE", "EXHAUSTED is not stored, so unspent capacity is usable");
  assert.equal((await kit.mandates.getById(id))?.status, "ACTIVE");
});

test("the payer's confirmation is read from the audit log, which keeps codes only", async () => {
  const kit = serviceKit();
  const id = await activeMandate(kit);
  await kit.service.revoke(PEDRO, id);
  const read = await kit.service.get(PEDRO, id);
  assert.ok(read.ok);
  assert.equal(read.mandate.authorization?.consent, "GRANTED", "the audit log remembers the activation");

  const types = (await kit.audit.listByMandate(id)).map((event) => event.type);
  assert.deepEqual(types, [MANDATE_EVENTS.created, MANDATE_EVENTS.activated, MANDATE_EVENTS.revoked]);
  const payloads = JSON.stringify(await kit.audit.listByMandate(id));
  assert.equal(payloads.includes("token"), false, "audit payloads carry codes, never tokens");
});
