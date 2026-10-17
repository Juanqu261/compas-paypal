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
import { JsonBusinessRegistryLookup } from "../../../src/integrations/category-sources/json-business-registry-lookup.ts";
import { createMerchantCategoryService } from "../../../src/integrations/merchant-registry/create-merchant-category-service.ts";
import { connectDatabase } from "../../../src/integrations/postgres/database.ts";
import { PostgresAuditRepository } from "../../../src/integrations/postgres/postgres-audit-repository.ts";
import { PostgresBusinessRegistryLookup } from "../../../src/integrations/postgres/postgres-business-registry-lookup.ts";
import { PostgresGrantStore } from "../../../src/integrations/postgres/postgres-grant-store.ts";
import { PostgresMandateRepository } from "../../../src/integrations/postgres/postgres-mandate-repository.ts";
import { PostgresObservationLog } from "../../../src/integrations/postgres/postgres-observation-log.ts";
import { PostgresSpendingLog } from "../../../src/integrations/postgres/postgres-spending-log.ts";
import { PostgresTrustLog } from "../../../src/integrations/postgres/postgres-trust-log.ts";
import { mandate as fixtureMandate } from "../../application/purchase-test-kit.ts";

const database = connectDatabase({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const skip = database ? false : "set TEST_DATABASE_URL to run the Postgres adapter tests";
after(() => database?.end({ timeout: 5 }));

const HMAC_LIKE = (seed: string) => Buffer.from(seed.padEnd(32, "x")).toString("base64url").slice(0, 43);

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
    merchantWalletAddressUrl: "https://wallet.test/drogueria-central",
    merchantDisplayName: "Droguería Central",
    requestedAmount: { value: "1000", assetCode: "EUR", assetScale: 2 },
    debitAmount: { value: "1120", assetCode: "USD", assetScale: 2 },
    decision: { outcome: "ALLOW", reasons: [] },
    merchantCategories: [{ category: "MEDICATION", trustLevel: "PROVIDER_VERIFIED" }],
    monitoredException: false,
    openPayments: { incomingPaymentUrl: "https://wallet.test/incoming/1", quoteId: "https://wallet.test/quotes/1" },
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

test("spending log: append, record the payment once, list by mandate", { skip }, async () => {
  const mandate = freshMandate();
  await new PostgresMandateRepository(database!).save(mandate);
  const spending = new PostgresSpendingLog(database!);
  const record = spendingRecord(mandate, `pg-decision-${randomUUID()}`);
  await spending.append(record);

  const paid = await spending.recordPayment(record.id, { outgoingPaymentUrl: "https://wallet.test/op/1", state: "PENDING" });
  assert.deepEqual(paid, {
    ...record,
    openPayments: { ...record.openPayments, outgoingPaymentUrl: "https://wallet.test/op/1", state: "PENDING" },
  });
  await spending.recordPayment(record.id, { outgoingPaymentUrl: "https://wallet.test/op/1", state: "COMPLETED" });
  await assert.rejects(
    spending.recordPayment(record.id, { outgoingPaymentUrl: "https://wallet.test/op/2", state: "PENDING" }),
    /different outgoing payment/,
  );
  const [listed] = await spending.listByMandate(mandate.id);
  assert.equal(listed.openPayments.state, "COMPLETED");
});

test("trust log: idempotent append and every lookup the resolver uses", { skip }, async () => {
  const log = new PostgresTrustLog(database!);
  const run = randomUUID();
  const wallet = `https://wallet.test/${run}/shop`;
  const subjectRef = HMAC_LIKE(run);
  const base = { sourceId: "nequi-negocios-sim/kyb", bodyDigest: "digest", recordedAt: "2026-10-16T12:00:00.000Z" };
  const claim: TrustLogEntry = {
    ...base,
    id: `${run}-1`,
    submissionId: `${run}-s1`,
    type: "CATEGORY_CLAIM",
    subject: { kind: "WALLET_ADDRESS", walletAddressUrl: wallet },
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
    walletAddressUrl: wallet,
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
  assert.deepEqual(await log.listByWalletAddress(wallet), [claim, binding]);
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
  const wallet = `https://wallet.test/${randomUUID()}/shop`;
  const paid: MerchantObservation = {
    type: "PAID",
    id: `${record.id}:paid`,
    spendingRecordId: record.id,
    merchantWalletAddressUrl: wallet,
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
    merchantWalletAddressUrl: wallet,
    payerRef: HMAC_LIKE("payer"),
    verdict: "MATCH",
    observedAt: "2026-10-16T16:00:00.000Z",
  };
  await log.append(paid);
  await log.append(verdict);
  await assert.rejects(log.append(verdict));

  assert.deepEqual(await log.findPaid(record.id), paid);
  assert.deepEqual(await log.findVerdict(record.id), verdict);
  assert.deepEqual(await log.listByMerchant(wallet, new Date("2026-10-01T00:00:00Z")), [paid, verdict]);
  assert.deepEqual(await log.listByMerchant(wallet, new Date("2026-10-16T15:30:00Z")), [verdict]);
});

test("grant store: pending, then active, then deleted", { skip }, async () => {
  const mandate = freshMandate();
  await new PostgresMandateRepository(database!).save(mandate);
  const grants = new PostgresGrantStore(database!);
  const base = {
    grantKey: mandate.id,
    payerWalletAddressUrl: "https://wallet.test/pedro",
    resourceServer: "https://wallet.test",
    continueUri: "https://auth.wallet.test/continue/1",
    continueAccessToken: "continue-token",
  };
  const pending = { ...base, state: "PENDING" as const, grantEndpoint: "https://auth.wallet.test", clientNonce: "n1", finishNonce: "n2" };
  await grants.put(pending);
  assert.deepEqual(await grants.get(mandate.id), pending);

  const active = {
    ...base,
    state: "ACTIVE" as const,
    accessToken: "access-token",
    manageUrl: "https://auth.wallet.test/token/1",
    accessTokenExpiresAt: "2026-10-16T18:00:00.000Z",
  };
  await grants.put(active);
  assert.deepEqual(await grants.get(mandate.id), active);
  await grants.delete(mandate.id);
  assert.equal(await grants.get(mandate.id), undefined);
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
    openPaymentsRefs: { quoteUrl: "https://wallet.test/quotes/1" },
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
    DEMO_MERCHANT_WALLET_ADDRESS: undefined,
    DEMO_LIQUOR_WALLET_ADDRESS: undefined,
  };
  const first = await createMerchantCategoryService({ env, database: database!, now: () => new Date("2026-10-16T12:00:00Z") });
  const second = await createMerchantCategoryService({ env, database: database!, now: () => new Date("2026-10-17T12:00:00Z") });
  const wallet = "https://wallet.example/demo-drogueria-central";
  const { resolvedAt: _second, ...afterRestart } = await second.registry.resolve(wallet);
  const { resolvedAt: _first, ...beforeRestart } = await first.registry.resolve(wallet);
  assert.deepEqual(afterRestart, beforeRestart);
  assert.ok(beforeRestart.declarations.some((declared) => declared.category === "MEDICATION"));
});

test("with a database, a missing HMAC key stops startup", { skip }, async () => {
  await assert.rejects(
    createMerchantCategoryService({ env: {}, database: database! }),
    /MERCHANT_SUBJECT_HMAC_KEY is required/,
  );
});
