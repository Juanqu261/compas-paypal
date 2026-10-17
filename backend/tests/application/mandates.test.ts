import assert from "node:assert/strict";
import test from "node:test";
import { handleOpenPaymentsFinish } from "../../src/api/open-payments-finish.ts";
import { parseCreateMandateRequest } from "../../src/application/mandates.ts";
import {
  ANDREA,
  fakeGateway,
  GLADYS,
  medicationRequest,
  NOW,
  PAYER_WALLET,
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
  const started = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.ok(started.ok);
  assert.equal(await kit.service.completeAuthorization(draft.id), "ACTIVATED");
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
  assert.equal(kit.gateway.calls.start.length, 0, "creating a draft asks no wallet for anything");
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

test("the budget must use the payer wallet's asset when the wallet can be read", async () => {
  const kit = serviceKit({ gateway: fakeGateway({ wallet: { assetCode: "EUR", assetScale: 2 } }) });
  const result = await kit.service.create(PEDRO, medicationRequest());
  assert.deepEqual(fieldCodes(result), ["ASSET_MISMATCH"]);
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

test("the beneficiary needs no wallet: Gladys has none", async () => {
  const mandate = await createDraft(serviceKit());
  assert.equal(mandate.beneficiary.id, GLADYS.partyId);
});

test("dates are normalized to ISO instants", () => {
  const parsed = parseCreateMandateRequest(medicationRequest({ validFrom: "2026-10-16T00:00:00-05:00" }), NOW);
  assert.ok(parsed.ok);
  assert.equal(parsed.value.validFrom, "2026-10-16T05:00:00.000Z");
});

// --- Authorization and the consent callback -------------------------------------

test("only the payer can start the authorization; a stranger can't even see the budget", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  const asStranger = await kit.service.startAuthorization(STRANGER, draft.id);
  assert.equal(asStranger.ok ? "" : asStranger.code, "NOT_FOUND");
  // Andrea can't see a draft at all: there is no permission before consent.
  const asDelegate = await kit.service.startAuthorization(ANDREA, draft.id);
  assert.equal(asDelegate.ok ? "" : asDelegate.code, "NOT_FOUND");
  assert.equal(kit.gateway.calls.start.length, 0);
});

test("authorizing asks the payer wallet for a grant capped at the budget and waits for consent", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  const result = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.ok(result.ok);
  assert.equal(result.redirectUrl, `https://auth.test/interact/${draft.id}`);
  assert.equal(result.mandate.status, "PENDING_AUTHORIZATION");
  assert.equal(result.mandate.authorization?.consent, "WAITING_FOR_PAYER");
  assert.deepEqual(kit.gateway.calls.start, [
    { grantKey: draft.id, payerWalletAddressUrl: PAYER_WALLET, debitLimit: { value: "4000", assetCode: "USD", assetScale: 2 } },
  ]);
  assert.equal("interval" in kit.gateway.calls.start[0], false, "no recurring budgets");
});

test("only an authentic finish activates the mandate", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  await kit.service.startAuthorization(PEDRO, draft.id);
  const before = await kit.service.get(PEDRO, draft.id);
  assert.ok(before.ok);
  assert.equal(before.mandate.status, "PENDING_AUTHORIZATION", "starting consent is not consent");
  assert.equal(before.mandate.usable, false);
  assert.equal(await kit.service.completeAuthorization(draft.id), "ACTIVATED");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.ok(after.ok);
  assert.equal(after.mandate.status, "ACTIVE");
  assert.equal(after.mandate.authorization?.consent, "GRANTED");
  assert.equal(after.mandate.usable, true);
});

test("a manipulated callback that fails the hash check never activates the mandate", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  await kit.service.startAuthorization(PEDRO, draft.id);
  const { result } = await handleOpenPaymentsFinish(
    new URL(`http://localhost:4000/open-payments/finish?grantKey=${draft.id}&interact_ref=forged&hash=forged`),
    {
      gateway: { finishPayerGrant: async () => { throw Object.assign(new Error("hash"), { code: "INVALID_INTERACTION_HASH" }); } },
      returnUrl: "http://localhost:3000/demo",
      onPayerGrantFinished: async (grantKey) => { await kit.service.completeAuthorization(grantKey); },
    },
  );
  assert.equal(result, "failed");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.ok(after.ok);
  assert.equal(after.mandate.status, "PENDING_AUTHORIZATION");
});

test("a rejected consent leaves the mandate waiting, and the payer can retry", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  await kit.service.startAuthorization(PEDRO, draft.id);
  const { result } = await handleOpenPaymentsFinish(
    new URL(`http://localhost:4000/open-payments/finish?grantKey=${draft.id}&result=grant_rejected`),
    {
      gateway: { finishPayerGrant: async () => ({ status: "GRANTED" as const }) },
      returnUrl: "http://localhost:3000/demo",
      onPayerGrantFinished: async (grantKey) => { await kit.service.completeAuthorization(grantKey); },
    },
  );
  assert.equal(result, "rejected");
  const waiting = await kit.service.get(PEDRO, draft.id);
  assert.ok(waiting.ok);
  assert.equal(waiting.mandate.status, "PENDING_AUTHORIZATION");
  assert.equal(waiting.mandate.authorization?.canAuthorize, true);
  const retry = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.ok(retry.ok);
  assert.equal(kit.gateway.calls.start.length, 2);
});

test("a finish for a draft that never asked for consent changes nothing", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  assert.equal(await kit.service.completeAuthorization(draft.id), "IGNORED");
  assert.equal(await kit.service.completeAuthorization("mandate-unknown"), "IGNORED");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.ok(after.ok);
  assert.equal(after.mandate.status, "DRAFT");
});

test("without Open Payments configured, authorization fails closed and the mandate stays a DRAFT", async () => {
  const kit = serviceKit({ gateway: fakeGateway({ start: "not-configured", wallet: "not-configured" }) });
  const draft = await createDraft(kit);
  const result = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.equal(result.ok ? "" : result.code, "OPEN_PAYMENTS_NOT_CONFIGURED");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.ok(after.ok);
  assert.equal(after.mandate.status, "DRAFT");
  assert.deepEqual(after.mandate.authorization?.lastError, { operation: "AUTHORIZE", code: "NOT_CONFIGURED" });
  assert.deepEqual(await kit.service.payerWallet(PEDRO), { status: "OPEN_PAYMENTS_NOT_CONFIGURED" });
});

test("a payer without a wallet can draft but not authorize", async () => {
  const kit = serviceKit({ payerWallet: null });
  const draft = await createDraft(kit);
  const result = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.equal(result.ok ? "" : result.code, "PAYER_WALLET_NOT_CONFIGURED");
  assert.equal(kit.gateway.calls.start.length, 0);
});

test("a provider error is reported by code and the mandate is not activated", async () => {
  const kit = serviceKit({ gateway: fakeGateway({ start: "upstream" }) });
  const draft = await createDraft(kit);
  const result = await kit.service.startAuthorization(PEDRO, draft.id);
  assert.ok(!result.ok);
  assert.equal(result.code, "AUTHORIZATION_FAILED");
  assert.equal(result.providerCode, "UPSTREAM");
});

// --- Roles ---------------------------------------------------------------------------

test("the delegate sees received authorizations only after the payer consented", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  assert.deepEqual(await kit.service.list(ANDREA, "DELEGATE"), []);
  await kit.service.startAuthorization(PEDRO, draft.id);
  assert.deepEqual(await kit.service.list(ANDREA, "DELEGATE"), [], "waiting for Pedro is not a permission yet");
  await kit.service.completeAuthorization(draft.id);
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
  assert.equal(kit.gateway.calls.cancel.length, 0);
});

test("revoking blocks the mandate and cancels the grant; the delegate sees it revoked", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const result = await kit.service.revoke(PEDRO, id);
  assert.ok(result.ok);
  assert.equal(result.mandate.status, "REVOKED");
  assert.equal(result.mandate.authorization?.grantCancellation, "DONE");
  assert.deepEqual(kit.gateway.calls.cancel, [id]);
  const asAndrea = await kit.service.get(ANDREA, id);
  assert.ok(asAndrea.ok);
  assert.equal(asAndrea.mandate.status, "REVOKED");
  assert.equal(asAndrea.mandate.usable, false);
});

test("when the provider can't cancel, COMPAS still blocks and reports the cancellation as pending", async () => {
  const kit = serviceKit({ gateway: fakeGateway({ cancel: "upstream" }) });
  const id = await activate(kit);
  const first = await kit.service.revoke(PEDRO, id);
  assert.ok(first.ok);
  assert.equal(first.mandate.status, "REVOKED");
  assert.equal(first.mandate.authorization?.grantCancellation, "PENDING");
  assert.deepEqual(first.mandate.authorization?.lastError, { operation: "CANCEL", code: "UPSTREAM" });

  kit.gateway.failCancel("ok");
  const retry = await kit.service.revoke(PEDRO, id);
  assert.ok(retry.ok);
  assert.equal(retry.alreadyRevoked, true);
  assert.equal(retry.mandate.authorization?.grantCancellation, "DONE");
  assert.equal(kit.gateway.calls.cancel.length, 2);
});

test("revoking twice is idempotent once the cancellation is done", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.service.revoke(PEDRO, id);
  const again = await kit.service.revoke(PEDRO, id);
  assert.ok(again.ok);
  assert.equal(again.alreadyRevoked, true);
  assert.equal(kit.gateway.calls.cancel.length, 1, "no second cancel call");
});

test("revoking a draft needs no provider call", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  const result = await kit.service.revoke(PEDRO, draft.id);
  assert.ok(result.ok);
  assert.equal(result.mandate.authorization?.grantCancellation, "NOT_NEEDED");
  assert.equal(kit.gateway.calls.cancel.length, 0);
});

test("a grant that finishes after the payer revoked is cancelled, not activated", async () => {
  const kit = serviceKit();
  const draft = await createDraft(kit);
  await kit.service.startAuthorization(PEDRO, draft.id);
  await kit.service.revoke(PEDRO, draft.id);
  assert.equal(await kit.service.completeAuthorization(draft.id), "CANCELLED_AFTER_REVOKE");
  const after = await kit.service.get(PEDRO, draft.id);
  assert.ok(after.ok);
  assert.equal(after.mandate.status, "REVOKED");
});

// --- State transitions ----------------------------------------------------------------

test("an active mandate can't be authorized again", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  const again = await kit.service.startAuthorization(PEDRO, id);
  assert.equal(again.ok ? "" : again.code, "INVALID_STATE");
});

test("a mandate past its expiry is EXPIRED and can't be authorized", async () => {
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

test("activity separates completed and pending payments and adds the provider's spent figure", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.spending.append(spendingRecord({ id: "d-1", mandateId: id }));
  await kit.spending.append(
    spendingRecord({
      id: "d-2",
      mandateId: id,
      openPayments: { outgoingPaymentUrl: "https://wallet.test/outgoing/2", state: "PENDING" },
      recordedAt: "2026-10-16T17:00:00.000Z",
    }),
  );
  const result = await kit.service.activity(PEDRO, id);
  assert.ok(result.ok);
  assert.deepEqual(result.activity.totals.completed, { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(result.activity.totals.inProgress, { value: "1120", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(result.providerSpent, { value: "1120", assetCode: "USD", assetScale: 2 });

  const asAndrea = await kit.service.activity(ANDREA, id);
  assert.ok(asAndrea.ok);
  assert.equal(asAndrea.providerSpentAvailable, false, "the provider is asked for the payer only");
});

test("views never expose wallet addresses, grants or tokens", async () => {
  const kit = serviceKit();
  const id = await activate(kit);
  await kit.spending.append(spendingRecord({ id: "d-1", mandateId: id }));
  const payload = JSON.stringify([
    await kit.service.get(PEDRO, id),
    await kit.service.get(ANDREA, id),
    await kit.service.list(PEDRO, "PAYER"),
    await kit.service.activity(PEDRO, id),
  ]);
  for (const secret of [PAYER_WALLET, "accessToken", "continueAccessToken", "nonce", "wallet.test/drogueria", "incoming", "quotes"]) {
    assert.equal(payload.includes(secret), false, `leaked ${secret}`);
  }
});
