/**
 * Runs only with TEST_DATABASE_URL: a Postgres with data/migrations/ applied,
 * reached as a member of compas_backend, so the grants are tested too.
 * Every test uses fresh ids, so runs don't need a clean database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import type { Mandate } from "../../../src/domain/mandate.ts";
import type { TrustLogEntry } from "../../../src/domain/merchant-category.ts";
import type { MerchantObservation } from "../../../src/domain/merchant-history.ts";
import type { SpendingRecord } from "../../../src/domain/spending.ts";
import { loadMerchantHistory } from "../../../src/application/merchant-history.ts";
import { JsonBusinessRegistryLookup } from "../../../src/integrations/category-sources/json-business-registry-lookup.ts";
import { createMerchantHistoryService } from "../../../src/integrations/merchant-history/create-merchant-history-service.ts";
import { DEMO_DROGUERIA_PAYPAL_ID, DEMO_TIENDA_PAYPAL_ID } from "../../../src/integrations/merchant-registry/demo-category-seed.ts";
import { createMerchantCategoryService } from "../../../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { connectDatabase } from "../../../src/integrations/postgres/database.ts";
import { PostgresAuditRepository } from "../../../src/integrations/postgres/postgres-audit-repository.ts";
import { PostgresBusinessRegistryLookup } from "../../../src/integrations/postgres/postgres-business-registry-lookup.ts";
import { PostgresMandateRepository } from "../../../src/integrations/postgres/postgres-mandate-repository.ts";
import { PostgresObservationLog } from "../../../src/integrations/postgres/postgres-observation-log.ts";
import { PostgresSpendingLog } from "../../../src/integrations/postgres/postgres-spending-log.ts";
import { PostgresTrustLog } from "../../../src/integrations/postgres/postgres-trust-log.ts";
import { gradeMerchantHistory } from "../../../src/policy/merchant-history.ts";
import { MANDATE_EVENTS } from "../../../src/application/mandates.ts";
import { StaticPartyDirectory } from "../../../src/integrations/mandates/demo-party-directory.ts";
import { medicationRequest, PAYER_PAYPAL_ID, serviceKit } from "../../application/mandate-test-kit.ts";
import { mandate as fixtureMandate } from "../../application/purchase-test-kit.ts";

const database = connectDatabase({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const skip = database ? false : "set TEST_DATABASE_URL to run the Postgres adapter tests";
after(() => database?.end({ timeout: 5 }));

const HMAC_LIKE = (seed: string) => Buffer.from(seed.padEnd(32, "x")).toString("base64url").slice(0, 43);

/** A fresh id in PayPal's format, so runs never share a merchant. Names no PayPal account. */
function freshMerchantId(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(randomUUID().replace(/-/g, "").slice(0, 13), (hex) => alphabet[parseInt(hex, 16) * 2]).join("");
}

function freshMandate(): Mandate {
  const run = randomUUID().slice(0, 8);
  return fixtureMandate("ENFORCED", {
    id: `pg-mandate-${run}`,
    payer: { id: `pg-payer-${run}`, displayName: "Pedro", role: "PAYER" },
    delegate: { id: `pg-delegate-${run}`, displayName: "Andrea", role: "DELEGATE" },
    beneficiary: { id: `pg-beneficiary-${run}`, displayName: "Gladys", role: "BENEFICIARY" },
    validFrom: "2026-10-16T00:00:00.000Z",
    expiresAt: "2026-12-31T23:59:59.000Z",
    createdAt: "2026-10-16T12:00:00.000Z",
  });
}

function spendingRecord(mandate: Mandate, id: string): SpendingRecord {
  return {
    id,
    mandateId: mandate.id,
    purchaseIntentId: `${id}-intent`,
    paypalMerchantId: "TESTPHARMACY2",
    merchantDisplayName: "Droguería Central",
    requestedAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
    decision: { outcome: "ALLOW", reasons: [] },
    merchantCategories: [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }],
    lineCategories: ["MEDICATION"],
    hasUncategorizedLines: false,
    monitoredException: false,
    paypal: {},
    recordedAt: "2026-10-16T15:00:00.000Z",
  };
}

test("mandates: save and read back, then reserve and release capacity atomically", { skip }, async () => {
  const mandates = new PostgresMandateRepository(database!);
  const mandate = freshMandate();
  await mandates.save(mandate);
  assert.deepEqual(await mandates.getById(mandate.id), mandate);

  const debit = { value: "3000", assetCode: "USD", assetScale: 2 };
  const both = await Promise.all([mandates.reserveCapacity(mandate.id, debit), mandates.reserveCapacity(mandate.id, debit)]);
  assert.deepEqual(both.sort(), [false, true], "two purchases can't both spend the last of it");
  assert.equal((await mandates.getById(mandate.id))?.remainingAuthorizedAmount.value, "1000");
  assert.equal(await mandates.reserveCapacity(mandate.id, { ...debit, assetCode: "EUR" }), false, "another asset");

  await mandates.releaseCapacity(mandate.id, { ...debit, value: "9999" });
  assert.equal((await mandates.getById(mandate.id))?.remainingAuthorizedAmount.value, "4000", "never above the budget");
});

test("mandates: a status change keeps a reservation, and lists filter by payer and delegate", { skip }, async () => {
  const mandates = new PostgresMandateRepository(database!);
  const mandate = freshMandate();
  await mandates.save(mandate);
  assert.ok(await mandates.reserveCapacity(mandate.id, { value: "1120", assetCode: "USD", assetScale: 2 }));

  const revoked = await mandates.transitionStatus(mandate.id, ["ACTIVE"], "REVOKED");
  assert.equal(revoked?.status, "REVOKED");
  assert.equal(revoked?.remainingAuthorizedAmount.value, "2880", "the reservation is kept");
  assert.equal(await mandates.transitionStatus(mandate.id, ["ACTIVE"], "EXPIRED"), undefined, "wrong from-status");
  assert.equal(await mandates.reserveCapacity(mandate.id, { value: "1", assetCode: "USD", assetScale: 2 }), false);

  const other = freshMandate();
  await mandates.save(other);
  assert.deepEqual((await mandates.listByPayer(mandate.payer.id)).map((m) => m.id), [mandate.id]);
  assert.deepEqual((await mandates.listByDelegate(other.delegate.id)).map((m) => m.id), [other.id]);
  assert.deepEqual(await mandates.listByPayer("pg-nobody"), []);
});

test("spending log: append, record the PayPal order once, move its state conditionally", { skip }, async () => {
  const mandate = freshMandate();
  await new PostgresMandateRepository(database!).save(mandate);
  const spending = new PostgresSpendingLog(database!);
  const record = spendingRecord(mandate, `pg-decision-${randomUUID()}`);
  await spending.append(record);
  assert.deepEqual(await spending.listByMandate(mandate.id), [record]);

  const orderId = `PG${randomUUID().replace(/-/g, "").slice(0, 15).toUpperCase()}`;
  const approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`;
  const ordered = await spending.recordOrder(record.id, { orderId, approvalUrl, state: "AWAITING_PAYER_APPROVAL" });
  assert.deepEqual(ordered, { ...record, paypal: { orderId, approvalUrl, state: "AWAITING_PAYER_APPROVAL" } });
  assert.deepEqual(await spending.recordOrder(record.id, { orderId, approvalUrl, state: "AWAITING_PAYER_APPROVAL" }), ordered);
  await assert.rejects(
    spending.recordOrder(record.id, { orderId: `${orderId}X`, state: "AWAITING_PAYER_APPROVAL" }),
    /different PayPal order/,
  );
  assert.deepEqual(await spending.findByPayPalOrderId(orderId), ordered);

  const captured = await spending.transitionPayment(record.id, ["AWAITING_PAYER_APPROVAL"], {
    state: "COMPLETED",
    captureId: "PGCAPTURE1",
  });
  assert.deepEqual(captured?.paypal, { orderId, approvalUrl, captureId: "PGCAPTURE1", state: "COMPLETED" });
  assert.equal(
    await spending.transitionPayment(record.id, ["AWAITING_PAYER_APPROVAL"], { state: "CANCELLED" }),
    undefined,
    "a second settlement loses: the state already moved",
  );

  const failed = spendingRecord(mandate, `pg-decision-${randomUUID()}`);
  await spending.append(failed);
  await spending.recordOrder(failed.id, { orderId: `${orderId}F`, state: "AWAITING_PAYER_APPROVAL" });
  const closed = await spending.transitionPayment(failed.id, ["AWAITING_PAYER_APPROVAL"], {
    state: "FAILED",
    failureCode: "MANDATE_NOT_USABLE",
  });
  assert.deepEqual(closed?.paypal, { orderId: `${orderId}F`, state: "FAILED", failureCode: "MANDATE_NOT_USABLE" });
});

test("trust log: idempotent append and every lookup the resolver uses", { skip }, async () => {
  const log = new PostgresTrustLog(database!);
  const run = randomUUID();
  const merchant = freshMerchantId();
  const subjectRef = HMAC_LIKE(run);
  const base = { sourceId: "nequi-negocios-sim/kyb", bodyDigest: "digest", recordedAt: "2026-10-16T12:00:00.000Z" };
  const claim: TrustLogEntry = {
    ...base,
    id: `${run}-1`,
    submissionId: `${run}-s1`,
    type: "CATEGORY_CLAIM",
    subject: { kind: "PAYPAL_MERCHANT", paypalMerchantId: merchant },
    codes: [{ system: "CIIU_REV4_AC", code: "4773", role: "PRIMARY" }],
    declaredCategories: [],
    observedAt: "2026-10-16T12:00:00.000Z",
    evidenceRef: "demo-kyb-rut",
  };
  const registryClaim: TrustLogEntry = {
    ...claim,
    id: `${run}-2`,
    submissionId: `${run}-s2`,
    subject: { kind: "TAX_ID", subjectRef },
    validUntil: "2027-04-01T05:00:00.000Z",
  };
  const binding: TrustLogEntry = {
    ...base,
    id: `${run}-3`,
    submissionId: `${run}-s3`,
    type: "IDENTITY_BINDING",
    paypalMerchantId: merchant,
    subject: { kind: "TAX_ID", subjectRef },
    observedAt: "2026-10-16T12:00:00.000Z",
  };
  const revocation: TrustLogEntry = {
    ...base,
    id: `${run}-4`,
    submissionId: `${run}-s4`,
    type: "REVOCATION",
    revokesEntryId: claim.id,
    reason: "test",
  };

  for (const entry of [claim, registryClaim, binding, revocation]) {
    assert.deepEqual(await log.append(entry), { entry, duplicate: false });
  }
  assert.deepEqual(await log.append({ ...claim, id: `${run}-other` }), { entry: claim, duplicate: true });
  assert.deepEqual(await log.getById(registryClaim.id), registryClaim);
  assert.deepEqual(await log.findBySubmission(claim.sourceId, claim.submissionId), claim);
  assert.deepEqual(await log.listByPayPalMerchant(merchant), [claim, binding]);
  assert.deepEqual(await log.listBySubjectRef(subjectRef), [registryClaim]);
  assert.deepEqual(await log.listBindingsBySubjectRef(subjectRef), [binding]);
  assert.deepEqual(await log.listRevocationsFor([claim.id, binding.id]), [revocation]);
  assert.deepEqual(await log.listRevocationsFor([]), []);
});

test("observation log: paid and verdict per purchase, listed by merchant after a date", { skip }, async () => {
  const mandate = freshMandate();
  await new PostgresMandateRepository(database!).save(mandate);
  const record = spendingRecord(mandate, `pg-decision-${randomUUID()}`);
  await new PostgresSpendingLog(database!).append(record);

  const log = new PostgresObservationLog(database!);
  const merchant = freshMerchantId();
  const paid: MerchantObservation = {
    type: "PAID",
    id: `${record.id}:paid`,
    spendingRecordId: record.id,
    paypalMerchantId: merchant,
    payerRef: HMAC_LIKE("payer"),
    delegateRef: HMAC_LIKE("delegate"),
    mandateCategories: ["MEDICATION"],
    lineCategories: ["MEDICATION"],
    hasUncategorizedLines: false,
    enforcement: "ENFORCED",
    paymentState: "COMPLETED",
    observedAt: "2026-10-16T15:00:00.000Z",
  };
  const verdict: MerchantObservation = {
    type: "PAYER_VERDICT",
    id: `${record.id}:verdict`,
    spendingRecordId: record.id,
    paypalMerchantId: merchant,
    payerRef: HMAC_LIKE("payer"),
    verdict: "MATCH",
    observedAt: "2026-10-16T16:00:00.000Z",
  };
  await log.append(paid);
  await log.append(verdict);
  await assert.rejects(log.append(verdict));

  assert.deepEqual(await log.findPaid(record.id), paid);
  assert.deepEqual(await log.findVerdict(record.id), verdict);
  assert.deepEqual(await log.listByMerchant(merchant, new Date("2026-10-01T00:00:00Z")), [paid, verdict]);
  assert.deepEqual(await log.listByMerchant(merchant, new Date("2026-10-16T15:30:00Z")), [verdict]);
});

test("audit events: append and list by mandate", { skip }, async () => {
  const mandate = freshMandate();
  await new PostgresMandateRepository(database!).save(mandate);
  const audit = new PostgresAuditRepository(database!);
  const event = {
    id: `pg-audit-${randomUUID()}`,
    type: "POLICY_DECISION",
    occurredAt: "2026-10-16T15:00:00.000Z",
    mandateId: mandate.id,
    decisionId: "decision-1",
    paypalRefs: { orderId: "PGORDER1", captureId: "PGCAPTURE1" },
    payload: { outcome: "ALLOW" },
  };
  await audit.append(event);
  assert.deepEqual(await audit.listByMandate(mandate.id), [event]);
});

test("registry: the Postgres lookup returns what the JSON seed holds for a company NIT", { skip }, async (t) => {
  const [{ count }] = await database!`select count(*)::int as count from compas.registry_establishments`;
  if (count === 0) {
    t.skip("registry not loaded: run npm run registry:load");
    return;
  }
  const json = new JsonBusinessRegistryLookup();
  const postgres = new PostgresBusinessRegistryLookup(database!);
  const nit = "800149695";
  const byCamaraMatricula = (records: readonly { camara: string; matricula: string }[]) =>
    [...records].sort((a, b) => `${a.camara}-${a.matricula}`.localeCompare(`${b.camara}-${b.matricula}`));
  assert.deepEqual(byCamaraMatricula(await postgres.findByNit(nit)), byCamaraMatricula(await json.findByNit(nit)));
  assert.deepEqual(await postgres.findByNit("800197268"), []);
});

test("category service on Postgres: a second start finds the demo seed already there and resolves the same", { skip }, async () => {
  const env = {
    MERCHANT_SUBJECT_HMAC_KEY: "test-hmac-key-test-hmac-key-test-hmac-key",
    DEMO_MERCHANT_PAYPAL_ID: undefined,
    DEMO_LIQUOR_PAYPAL_ID: undefined,
  };
  const first = await createMerchantCategoryService({ env, database: database!, now: () => new Date("2026-10-16T12:00:00Z") });
  const second = await createMerchantCategoryService({ env, database: database!, now: () => new Date("2026-10-17T12:00:00Z") });
  const { resolvedAt: _second, ...afterRestart } = await second.registry.resolve(DEMO_DROGUERIA_PAYPAL_ID);
  const { resolvedAt: _first, ...beforeRestart } = await first.registry.resolve(DEMO_DROGUERIA_PAYPAL_ID);
  assert.deepEqual(afterRestart, beforeRestart);
  assert.ok(beforeRestart.declarations.some((declared) => declared.category === "MEDICATION"));
});

test("mandate service on Postgres: activation, then revocation keeps the reservation", { skip }, async () => {
  const run = randomUUID().slice(0, 8);
  let n = 0;
  // Fresh parties, so a shared test database never shows these mandates to the demo's Pedro.
  const payer = { partyId: `pg-payer-${run}` };
  const kit = serviceKit({
    parties: new StaticPartyDirectory([
      { id: payer.partyId, displayName: "Pedro", paypalPayerId: PAYER_PAYPAL_ID },
      { id: `pg-delegate-${run}`, displayName: "Andrea" },
      { id: `pg-beneficiary-${run}`, displayName: "Gladys" },
    ]),
    storage: {
      mandates: new PostgresMandateRepository(database!),
      audit: new PostgresAuditRepository(database!),
      spending: new PostgresSpendingLog(database!),
    },
    newId: () => `pg-${run}-${++n}`,
  });
  const created = await kit.service.create(payer, medicationRequest({ delegateId: `pg-delegate-${run}`, beneficiaryId: `pg-beneficiary-${run}` }));
  assert.ok(created.ok);
  const id = created.mandate.id;
  assert.ok((await kit.service.authorize(payer, id)).ok);

  assert.ok(await kit.mandates.reserveCapacity(id, { value: "1120", assetCode: "USD", assetScale: 2 }));
  const revoked = await kit.service.revoke(payer, id);
  assert.ok(revoked.ok);
  assert.equal(revoked.mandate.status, "REVOKED");
  assert.equal(revoked.mandate.remainingAuthorizedAmount.value, "2880");

  const types = (await kit.audit.listByMandate(id)).map((event) => event.type);
  assert.deepEqual(types, [MANDATE_EVENTS.created, MANDATE_EVENTS.activated, MANDATE_EVENTS.revoked]);
  assert.deepEqual((await kit.service.list(payer, "PAYER")).map((m) => m.id), [id], "the tienda's demo mandates are not this payer's");
});

test("with a database, a missing HMAC key stops startup", { skip }, async () => {
  await assert.rejects(
    createMerchantCategoryService({ env: {}, database: database! }),
    /MERCHANT_SUBJECT_HMAC_KEY is required/,
  );
});

test("demo tienda history on Postgres: spending records and mandates behind every observation, seeded once", { skip }, async () => {
  const env = { MERCHANT_SUBJECT_HMAC_KEY: "test-hmac-key-test-hmac-key-test-hmac-key" };
  const first = await createMerchantHistoryService({ env, database: database! });
  const second = await createMerchantHistoryService({ env, database: database! });
  assert.equal(second.demoObservations, 0, "a second start keeps the first start's history");
  assert.ok(first.demoObservations === 24 || first.demoObservations === 0, "24 on an empty database");

  const [record] = await new PostgresSpendingLog(database!).listByMandate("demo-food-mandate-1");
  assert.equal(record.id, "demo-tienda-purchase-1");
  assert.equal(record.paypal.state, "COMPLETED");

  const history = await loadMerchantHistory(DEMO_TIENDA_PAYPAL_ID, ["FOOD"], new Date(), second);
  const [summary] = history.summaries;
  assert.equal(summary.confirmingPayers, 12);
  assert.equal(gradeMerchantHistory(summary, second.matrix), "ESTABLISHED");
});
