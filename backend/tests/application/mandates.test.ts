import assert from "node:assert/strict";
import test from "node:test";
import { parseCreateMandateRequest } from "../../src/application/mandates.ts";
import {
  ANDREA,
  countingSettlement,
  GLADYS,
  medicationRequest,
  NOW,
  PAYER_PAYPAL_ID,
  PEDRO,
  serviceKit,
  spendingRecord,
  STRANGER,
} from "./mandate-test-kit.ts";

async function createDraft(kit: ReturnType<typeof serviceKit>, overrides: Record<string, unknown> = {}) {
  const result = await kit.service.create(PEDRO, medicationRequest(overrides));
  assert.ok(result.ok, JSON.stringify(result));
  return result.mandate;
}

async function activate(kit: ReturnType<typeof serviceKit>) {
  const draft = await createDraft(kit);
  const activated = await kit.service.authorize(PEDRO, draft.id);
  assert.ok(activated.ok, JSON.stringify(activated));
  return draft.id;
}

function fieldCodes(result: { ok: boolean; fieldErrors?: readonly { code: string }[] }): string[] {
  return result.ok ? [] : (result.fieldErrors ?? []).map((error) => error.code);
}

// --- Creation and validation ----------------------------------------------------

test("Pedro creates the demo budget as a DRAFT owned by the authenticated payer", async () => {
  const kit = serviceKit();
  const result = await kit.service.create(PEDRO, medicationRequest({ payerId: ANDREA.partyId }));
  assert.ok(result.ok);
  const { mandate } = result;
  assert.equal(mandate.status, "DRAFT");
  assert.equal(mandate.payer.id, PEDRO.partyId, "the payer is the actor, never a body field");
  assert.equal(mandate.delegate.displayName, "Andrea");
  assert.equal(mandate.beneficiary.displayName, "Gladys");
  assert.deepEqual(mandate.budget, { value: "4000", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(mandate.remainingAuthorizedAmount, mandate.budget);
  assert.deepEqual(mandate.purposePolicy.eligibleCategories, ["MEDICATION"]);
  assert.equal(mandate.viewerRole, "PAYER");
  assert.equal(mandate.authorization?.consent, "NOT_STARTED");
  assert.equal(mandate.usable, false);
});

test("ENFORCED and a HIGH minimum confidence are the defaults", async () => {
  const mandate = await createDraft(serviceKit());
  assert.equal(mandate.purposePolicy.enforcement, "ENFORCED");
  assert.deepEqual(mandate.purposePolicy.merchantConfidence, { minimum: "HIGH" });
});

test("MONITORED needs the payer's explicit acknowledgement", async () => {
  const kit = serviceKit();
  const silent = await kit.service.create(PEDRO, medicationRequest({ enforcement: "MONITORED" }));
  assert.deepEqual(fieldCodes(silent), ["MONITORED_NOT_ACKNOWLEDGED"]);
  const acknowledged = await createDraft(kit, { enforcement: "MONITORED", monitoredAcknowledged: true });
  assert.equal(acknowledged.purposePolicy.enforcement, "MONITORED");
});

test("invalid amounts are refused", async () => {
  const kit = serviceKit();
  for (const value of ["0", "-100", "40.00", "040", "", "abc"]) {
    const result = await kit.service.create(
      PEDRO,
      medicationRequest({ budget: { value, assetCode: "USD", assetScale: 2 } }),
    );
    assert.deepEqual(fieldCodes(result), ["INVALID_AMOUNT"], `value ${JSON.stringify(value)}`);
  }
  const numeric = await kit.service.create(PEDRO, medicationRequest({ budget: { value: 4000, assetCode: "USD", assetScale: 2 } }));
  assert.deepEqual(fieldCodes(numeric), ["INVALID_AMOUNT"], "a number is not minor units in a string");
  const huge = await kit.service.create(PEDRO, medicationRequest({ budget: { value: "1000001", assetCode: "USD", assetScale: 2 } }));
  assert.deepEqual(fieldCodes(huge), ["AMOUNT_TOO_LARGE"]);
  const badScale = await kit.service.create(PEDRO, medicationRequest({ budget: { value: "4000", assetCode: "USD", assetScale: 2.5 } }));
  assert.deepEqual(fieldCodes(badScale), ["INVALID_ASSET"]);
});

test("the budget must be in a currency PayPal charges, at PayPal's scale: COMPAS does not convert", async () => {
  const kit = serviceKit();
  const cop = await kit.service.create(PEDRO, medicationRequest({ budget: { value: "4000", assetCode: "COP", assetScale: 2 } }));
  assert.deepEqual(fieldCodes(cop), ["ASSET_NOT_SUPPORTED"]);
  const wrongScale = await kit.service.create(PEDRO, medicationRequest({ budget: { value: "4000", assetCode: "USD", assetScale: 3 } }));
  assert.deepEqual(fieldCodes(wrongScale), ["ASSET_NOT_SUPPORTED"]);
  const eur = await createDraft(kit, { budget: { value: "4000", assetCode: "EUR", assetScale: 2 } });
  assert.equal(eur.budget.assetCode, "EUR");
});

test("invalid validity windows are refused", async () => {
  const kit = serviceKit();
  const reversed = await kit.service.create(PEDRO, medicationRequest({ expiresAt: "2026-10-15T00:00:00.000Z" }));
  assert.ok(fieldCodes(reversed).includes("ENDS_BEFORE_START"));
  const tooLong = await kit.service.create(PEDRO, medicationRequest({ expiresAt: "2027-12-01T00:00:00.000Z" }));
  assert.deepEqual(fieldCodes(tooLong), ["WINDOW_TOO_LONG"]);
  const past = await kit.service.create(
    PEDRO,
    medicationRequest({ validFrom: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z" }),
  );
  assert.ok(fieldCodes(past).includes("IN_THE_PAST"));
  const garbage = await kit.service.create(PEDRO, medicationRequest({ validFrom: "tomorrow" }));
  assert.deepEqual(fieldCodes(garbage), ["INVALID_DATE"]);
});

test("categories must come from COMPAS_CATEGORIES", async () => {
  const kit = serviceKit();
  assert.deepEqual(fieldCodes(await kit.service.create(PEDRO, medicationRequest({ categories: ["VITAMINS"] }))), ["UNKNOWN_CATEGORY"]);
  assert.deepEqual(fieldCodes(await kit.service.create(PEDRO, medicationRequest({ categories: [] }))), ["REQUIRED"]);
  const deduplicated = await createDraft(kit, { categories: ["MEDICATION", "PERSONAL_CARE", "MEDICATION"] });
  assert.deepEqual(deduplicated.purposePolicy.eligibleCategories, ["MEDICATION", "PERSONAL_CARE"]);
});

test("merchant confidence must be LOW, MEDIUM or HIGH, and its cap must fit the budget", async () => {
  const kit = serviceKit();
  const contested = await kit.service.create(PEDRO, medicationRequest({ merchantConfidence: { minimum: "CONTESTED" } }));
  assert.deepEqual(fieldCodes(contested), ["INVALID_CONFIDENCE"]);
  const capWithHigh = await kit.service.create(
    PEDRO,
    medicationRequest({ merchantConfidence: { minimum: "HIGH", maxDebitBelowHigh: { value: "1000", assetCode: "USD", assetScale: 2 } } }),
  );
  assert.deepEqual(fieldCodes(capWithHigh), ["CAP_NEEDS_LOWER_MINIMUM"]);
  const otherAsset = await kit.service.create(
    PEDRO,
    medicationRequest({ merchantConfidence: { minimum: "MEDIUM", maxDebitBelowHigh: { value: "1000", assetCode: "EUR", assetScale: 2 } } }),
  );
  assert.deepEqual(fieldCodes(otherAsset), ["ASSET_MISMATCH"]);
  const aboveBudget = await kit.service.create(
    PEDRO,
    medicationRequest({ merchantConfidence: { minimum: "LOW", maxDebitBelowHigh: { value: "5000", assetCode: "USD", assetScale: 2 } } }),
  );
  assert.deepEqual(fieldCodes(aboveBudget), ["CAP_ABOVE_BUDGET"]);
  const ok = await createDraft(kit, {
    merchantConfidence: { minimum: "MEDIUM", maxDebitBelowHigh: { value: "1500", assetCode: "USD", assetScale: 2 } },
  });
  assert.deepEqual(ok.purposePolicy.merchantConfidence, {
    minimum: "MEDIUM",
    maxDebitBelowHigh: { value: "1500", assetCode: "USD", assetScale: 2 },
  });
});

test("parties must be known, and the payer cannot delegate to themselves", async () => {
  const kit = serviceKit();
  assert.deepEqual(fieldCodes(await kit.service.create(PEDRO, medicationRequest({ delegateId: "nobody" }))), ["UNKNOWN_PARTY"]);
  assert.deepEqual(fieldCodes(await kit.service.create(PEDRO, medicationRequest({ delegateId: PEDRO.partyId }))), ["SELF_DELEGATION"]);
});

test("the beneficiary needs no PayPal account: Gladys has none", async () => {
  const mandate = await createDraft(serviceKit());
  assert.equal(mandate.beneficiary.id, GLADYS.partyId);
});

test("dates are normalized to ISO instants", () => {
  const parsed = parseCreateMandateRequest(medicationRequest({ validFrom: "2026-10-16T00:00:00-05:00" }), NOW);
  assert.ok(parsed.ok);
  assert.equal(parsed.value.validFrom, "2026-10-16T05:00:00.000Z");
});

// --- Authorization -------------------------------------------------------------------

test("only the payer can authorize; a stranger can't even see the budget", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  const asStranger = await kit.service.authorize(STRANGER, draft.id);
  assert.equal(asStranger.ok ? "" : asStranger.code, "NOT_FOUND");
  // Andrea can't see a draft at all: there is no permission before Pedro confirms.
  const asDelegate = await kit.service.authorize(ANDREA, draft.id);
  assert.equal(asDelegate.ok ? "" : asDelegate.code, "NOT_FOUND");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.equal(after.ok ? after.mandate.status : "", "DRAFT");
});

test("authorizing activates the budget at once: each purchase still needs Pedro's PayPal approval", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  assert.equal(draft.usable, false, "a draft authorizes nothing");
  const result = await kit.service.authorize(PEDRO, draft.id);
  assert.ok(result.ok);
  assert.equal(result.mandate.status, "ACTIVE");
  assert.equal(result.mandate.usable, true);
  assert.equal(result.mandate.authorization?.consent, "GRANTED");
  assert.equal(result.mandate.authorization?.canAuthorize, false);
  assert.deepEqual(result.mandate.remainingAuthorizedAmount, draft.budget);
  assert.ok((await kit.audit.listByMandate(draft.id)).some((event) => event.type === "MANDATE_ACTIVATED"));
});

test("an active, revoked or expired mandate can't be authorized again", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const again = await kit.service.authorize(PEDRO, id);
  assert.equal(again.ok ? "" : again.code, "INVALID_STATE");

  const revoked = await createDraft(kit);
  await kit.service.revoke(PEDRO, revoked.id);
  const afterRevoke = await kit.service.authorize(PEDRO, revoked.id);
  assert.equal(afterRevoke.ok ? "" : afterRevoke.code, "INVALID_STATE");

  const late = await createDraft(kit);
  kit.setNow(new Date("2026-11-20T00:00:00Z"));
  const expired = await kit.service.authorize(PEDRO, late.id);
  assert.equal(expired.ok ? "" : expired.code, "INVALID_STATE");
});

// --- Roles ---------------------------------------------------------------------------

test("the delegate sees received authorizations only after the payer confirmed", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  assert.deepEqual(await kit.service.list(ANDREA, "DELEGATE"), []);
  await kit.service.authorize(PEDRO, draft.id);
  const received = await kit.service.list(ANDREA, "DELEGATE");
  assert.equal(received.length, 1);
  assert.equal(received[0].viewerRole, "DELEGATE");
  assert.equal(received[0].authorization, undefined, "the delegate gets no administration block");
  assert.equal((await kit.service.list(ANDREA, "PAYER")).length, 0, "Andrea is not the payer of this one");
});

test("roles come from the mandate, not the app: Andrea can be a payer too", async () => {
  const kit = serviceKit();
  const result = await kit.service.create(ANDREA, medicationRequest({ delegateId: PEDRO.partyId }));
  assert.ok(result.ok);
  assert.equal((await kit.service.list(ANDREA, "PAYER")).length, 1);
  assert.equal((await kit.service.list(PEDRO, "PAYER")).length, 0);
});

test("a stranger can't read someone else's mandate or its activity", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const read = await kit.service.get(STRANGER, id);
  assert.equal(read.ok ? "" : read.code, "NOT_FOUND");
  const activity = await kit.service.activity(STRANGER, id);
  assert.equal(activity.ok ? "" : activity.code, "NOT_FOUND");
  assert.deepEqual(await kit.service.list(STRANGER, "PAYER"), []);
  assert.deepEqual(await kit.service.list(STRANGER, "DELEGATE"), []);
});

// --- Revocation ------------------------------------------------------------------------

test("only the payer can revoke; the delegate is told so", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const asDelegate = await kit.service.revoke(ANDREA, id);
  assert.equal(asDelegate.ok ? "" : asDelegate.code, "NOT_THE_PAYER");
  const asStranger = await kit.service.revoke(STRANGER, id);
  assert.equal(asStranger.ok ? "" : asStranger.code, "NOT_FOUND");
});

test("revoking blocks the mandate; the delegate sees it revoked, and revoking again is idempotent", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const result = await kit.service.revoke(PEDRO, id);
  assert.ok(result.ok);
  assert.equal(result.alreadyRevoked, false);
  assert.equal(result.mandate.status, "REVOKED");
  assert.equal(result.mandate.authorization?.canRevoke, false);
  const asAndrea = await kit.service.get(ANDREA, id);
  assert.ok(asAndrea.ok);
  assert.equal(asAndrea.mandate.status, "REVOKED");
  assert.equal(asAndrea.mandate.usable, false);

  const again = await kit.service.revoke(PEDRO, id);
  assert.ok(again.ok);
  assert.equal(again.alreadyRevoked, true);
  assert.equal((await kit.audit.listByMandate(id)).filter((event) => event.type === "MANDATE_REVOKED").length, 1);
});

test("a draft can be revoked before it ever authorized anything", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  const result = await kit.service.revoke(PEDRO, draft.id);
  assert.ok(result.ok);
  assert.equal(result.mandate.status, "REVOKED");
  assert.equal(result.mandate.authorization?.consent, "NOT_STARTED");
});

// --- State transitions ----------------------------------------------------------------

test("a mandate past its expiry is EXPIRED for both sides", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  kit.setNow(new Date("2026-11-20T00:00:00Z"));
  const read = await kit.service.get(PEDRO, id);
  assert.ok(read.ok);
  assert.equal(read.mandate.status, "EXPIRED");
  assert.equal(read.mandate.usable, false);
  const asAndrea = await kit.service.list(ANDREA, "DELEGATE");
  assert.equal(asAndrea[0].status, "EXPIRED");
});

// --- Activity and exposure ------------------------------------------------------------

test("activity reconciles PayPal first, then separates captured, waiting and pending charges", async () => {
  const settlement = countingSettlement();
  const kit = serviceKit({ settlement });
  const id = await activate(kit);
  await kit.spending.append(spendingRecord({ id: "d-1", mandateId: id }));
  await kit.spending.append(
    spendingRecord({
      id: "d-2",
      mandateId: id,
      paypal: {
        orderId: "TESTORDER00000002",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER00000002",
        state: "AWAITING_PAYER_APPROVAL",
      },
      recordedAt: "2026-10-16T17:00:00.000Z",
    }),
  );
  await kit.spending.append(
    spendingRecord({
      id: "d-3",
      mandateId: id,
      paypal: { orderId: "TESTORDER00000003", state: "PENDING" },
      recordedAt: "2026-10-16T18:00:00.000Z",
    }),
  );
  const result = await kit.service.activity(PEDRO, id);
  assert.ok(result.ok);
  assert.deepEqual(settlement.refreshed, [id]);
  const { totals, entries } = result.activity;
  assert.deepEqual(totals.completed, { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(totals.inProgress, { value: "2240", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(
    [totals.completedCount, totals.awaitingApprovalCount, totals.inProgressCount],
    [1, 1, 1],
  );
  assert.equal(
    entries.find((entry) => entry.id === "d-2")?.approvalUrl,
    "https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER00000002",
    "Pedro gets the link that approves the order at PayPal",
  );
});

test("the delegate never receives the link that approves a payment from the payer's PayPal", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.spending.append(
    spendingRecord({
      id: "d-1",
      mandateId: id,
      paypal: {
        orderId: "TESTORDER00000001",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER00000001",
        state: "AWAITING_PAYER_APPROVAL",
      },
    }),
  );
  const asAndrea = await kit.service.activity(ANDREA, id);
  assert.ok(asAndrea.ok);
  assert.equal(asAndrea.activity.entries[0].kind, "AWAITING_APPROVAL");
  assert.equal(JSON.stringify(asAndrea).includes("paypal.com"), false);
});

test("a revoked mandate shows no approval link: its orders can no longer be paid", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.spending.append(
    spendingRecord({
      id: "d-1",
      mandateId: id,
      paypal: {
        orderId: "TESTORDER00000001",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER00000001",
        state: "AWAITING_PAYER_APPROVAL",
      },
    }),
  );
  await kit.service.revoke(PEDRO, id);
  const result = await kit.service.activity(PEDRO, id);
  assert.ok(result.ok);
  assert.equal(result.activity.entries[0].approvalUrl, undefined);
});

test("activity still answers when PayPal can't be reconciled", async () => {
  const kit = serviceKit({ settlement: countingSettlement({ fail: true }) });
  const id = await activate(kit);
  const result = await kit.service.activity(PEDRO, id);
  assert.ok(result.ok);
  assert.equal(result.activity.totals.attempts, 0);
});

test("views never expose PayPal account ids, order ids or captures", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.spending.append(spendingRecord({ id: "d-1", mandateId: id }));
  const payload = JSON.stringify([
    await kit.service.get(PEDRO, id),
    await kit.service.get(ANDREA, id),
    await kit.service.list(PEDRO, "PAYER"),
    await kit.service.activity(PEDRO, id),
    await kit.service.activity(ANDREA, id),
  ]);
  for (const secret of [PAYER_PAYPAL_ID, "TESTPHARMACY2", "TESTORDER", "TESTCAPTURE", "token"]) {
    assert.equal(payload.includes(secret), false, `leaked ${secret}`);
  }
});
