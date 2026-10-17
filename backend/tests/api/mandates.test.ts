import assert from "node:assert/strict";
import test from "node:test";
import {
  DemoIdentityProvider,
  handleStartDemoSession,
  readDemoIdentityMode,
} from "../../src/api/demo-identity.ts";
import { handleMandateRequest, isMandateApiPath, type RuntimeFacts } from "../../src/api/mandates.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { ANDREA, medicationRequest, NOW, PEDRO, serviceKit, STRANGER } from "../application/mandate-test-kit.ts";

const FACTS: RuntimeFacts = { identity: "DEMO", persistence: "IN_MEMORY_DEMO", openPayments: "configured" };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

function call(kit: ReturnType<typeof serviceKit>, actor: { partyId: string }, method: string, path: string, body?: unknown) {
  return handleMandateRequest(
    { method, url: new URL(`http://localhost:4000${path}`), body },
    actor,
    { service: kit.service, facts: FACTS },
  );
}

test("routes are recognized by path", () => {
  for (const path of ["/mandates", "/me", "/demo/participants", "/mandates/mandate-abc-1", "/mandates/mandate-abc-1/revoke"]) {
    assert.equal(isMandateApiPath(path), true, path);
  }
  for (const path of ["/mandates/../health", "/mandates/abc", "/mandates/mandate-1/delete"]) {
    assert.equal(isMandateApiPath(path), false, path);
  }
});

test("the full HTTP flow: create, authorize, list by role, revoke", async () => {
  const kit = serviceKit();
  const created = await call(kit, PEDRO, "POST", "/mandates", medicationRequest({ payerId: "demo-delegate-andrea" }));
  assert.equal(created.status, 201);
  const mandate = created.body.mandate as { id: string; payer: { id: string } };
  assert.equal(mandate.payer.id, PEDRO.partyId, "a payerId in the body is ignored");
  assert.equal(created.body.persistence, "IN_MEMORY_DEMO");

  const authorized = await call(kit, PEDRO, "POST", `/mandates/${mandate.id}/authorize`);
  assert.equal(authorized.status, 200);
  assert.match(String(authorized.body.redirectUrl), /^https:\/\/auth\.test\//);

  await kit.service.completeAuthorization(mandate.id);

  const payerList = await call(kit, PEDRO, "GET", "/mandates?role=payer");
  assert.equal((payerList.body.mandates as unknown[]).length, 1);
  const delegateList = await call(kit, ANDREA, "GET", "/mandates?role=delegate");
  assert.equal((delegateList.body.mandates as { status: string }[])[0].status, "ACTIVE");

  const forbidden = await call(kit, ANDREA, "POST", `/mandates/${mandate.id}/revoke`);
  assert.equal(forbidden.status, 403);
  const revoked = await call(kit, PEDRO, "POST", `/mandates/${mandate.id}/revoke`);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.grantCancellation, "DONE");

  const spending = await call(kit, PEDRO, "GET", `/mandates/${mandate.id}/spending`);
  assert.equal(spending.status, 200);
});

test("errors map to HTTP statuses without leaking detail", async () => {
  const kit = serviceKit();
  const invalid = await call(kit, PEDRO, "POST", "/mandates", medicationRequest({ categories: ["VITAMINS"] }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "INVALID_MANDATE");
  assert.ok(Array.isArray(invalid.body.fieldErrors));

  const missing = await call(kit, STRANGER, "GET", "/mandates/mandate-nope");
  assert.equal(missing.status, 404);
  const badRole = await call(kit, PEDRO, "GET", "/mandates?role=admin");
  assert.equal(badRole.status, 400);
});

test("a revocation whose provider cancellation is pending answers 202", async () => {
  const { fakeGateway } = await import("../application/mandate-test-kit.ts");
  const kit = serviceKit({ gateway: fakeGateway({ cancel: "upstream" }) });
  const created = await call(kit, PEDRO, "POST", "/mandates", medicationRequest());
  const id = (created.body.mandate as { id: string }).id;
  await call(kit, PEDRO, "POST", `/mandates/${id}/authorize`);
  await kit.service.completeAuthorization(id);
  const revoked = await call(kit, PEDRO, "POST", `/mandates/${id}/revoke`);
  assert.equal(revoked.status, 202);
  assert.equal(revoked.body.grantCancellation, "PENDING");
});

test("GET /me and /demo/participants describe the demo environment", async () => {
  const kit = serviceKit();
  const me = await call(kit, PEDRO, "GET", "/me");
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.party, { id: PEDRO.partyId, displayName: "Pedro" });
  assert.equal(me.body.identity, "DEMO");
  assert.equal(me.body.persistence, "IN_MEMORY_DEMO");
  assert.deepEqual(me.body.payerWallet, { status: "RESOLVED", assetCode: "USD", assetScale: 2 });
  assert.equal(JSON.stringify(me.body).includes("wallet.test"), false, "no wallet address");

  const participants = await call(kit, PEDRO, "GET", "/demo/participants");
  assert.equal(participants.body.dataLabel, "demo/test data");
  assert.deepEqual(
    (participants.body.participants as { displayName: string }[]).map((party) => party.displayName),
    ["Andrea", "Gladys"],
  );
});

// --- Demo identity ---------------------------------------------------------------------

function provider(now = () => NOW) {
  let n = 0;
  return new DemoIdentityProvider({
    parties: new StaticPartyDirectory([{ id: PEDRO.partyId, displayName: "Pedro" }]),
    now,
    newToken: () => `${String(++n).padStart(2, "0")}${"x".repeat(41)}`,
  });
}

test("a demo session resolves the actor on the server; a forged token does not", async () => {
  const identity = provider();
  const response = await handleStartDemoSession(encode({ partyId: PEDRO.partyId }), identity);
  assert.equal(response.status, 201);
  assert.equal(response.body.identity, "DEMO");
  const token = String(response.body.token);
  assert.deepEqual(identity.authenticate(`Bearer ${token}`), PEDRO);
  assert.equal(identity.authenticate(`Bearer ${"y".repeat(43)}`), undefined);
  assert.equal(identity.authenticate(PEDRO.partyId), undefined, "a raw party id is not a credential");
  assert.equal(identity.authenticate(undefined), undefined);
});

test("unknown parties get no session", async () => {
  const response = await handleStartDemoSession(encode({ partyId: "admin" }), provider());
  assert.equal(response.status, 404);
  const garbage = await handleStartDemoSession(new TextEncoder().encode("{"), provider());
  assert.equal(garbage.status, 400);
});

test("sessions expire", async () => {
  let now = NOW;
  const identity = provider(() => now);
  const session = await identity.start(PEDRO.partyId);
  assert.ok(session);
  now = new Date(NOW.getTime() + 13 * 60 * 60 * 1000);
  assert.equal(identity.authenticate(`Bearer ${session.token}`), undefined);
});

test("demo identities are off in production and when disabled", () => {
  assert.deepEqual(readDemoIdentityMode({}), { enabled: true });
  assert.equal(readDemoIdentityMode({ NODE_ENV: "production" }).enabled, false);
  assert.equal(readDemoIdentityMode({ COMPAS_DEMO_IDENTITY: "disabled" }).enabled, false);
});
