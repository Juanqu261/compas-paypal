import assert from "node:assert/strict";
import test from "node:test";
import { createDemoPartyDirectory, DEMO_CONTACTS } from "../../../src/integrations/mandates/demo-party-directory.ts";
import { ANDREA, medicationRequest, PEDRO, serviceKit } from "../../application/mandate-test-kit.ts";

test("the demo directory offers several test contacts, none of them with a PayPal account", async () => {
  const directory = createDemoPartyDirectory({});
  const ids = (await directory.list()).map((party) => party.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const contact of DEMO_CONTACTS) {
    assert.ok(ids.includes(contact.id), contact.id);
    assert.equal((await directory.getById(contact.id))?.paypalPayerId, undefined);
  }
});

test("Pedro's PayPal sandbox account is pinned only when DEMO_PAYER_PAYPAL_ID is a PayPal id", async () => {
  const pinned = createDemoPartyDirectory({ DEMO_PAYER_PAYPAL_ID: " sandbxpayer22 " });
  assert.equal((await pinned.getById(PEDRO.partyId))?.paypalPayerId, "SANDBXPAYER22");
  for (const value of [undefined, "", "https://wallet.test/pedro"]) {
    const directory = createDemoPartyDirectory(value === undefined ? {} : { DEMO_PAYER_PAYPAL_ID: value });
    assert.equal((await directory.getById(PEDRO.partyId))?.paypalPayerId, undefined, String(value));
  }
});

test("one contact can be both who pays and who the budget is for", async () => {
  const camila = DEMO_CONTACTS[0];
  const kit = serviceKit({ parties: createDemoPartyDirectory({ DEMO_PAYER_PAYPAL_ID: "SANDBXPAYER22" }) });

  const participants = await kit.service.participants(PEDRO);
  assert.ok(participants.some((party) => party.id === camila.id));
  assert.ok(!participants.some((party) => party.id === PEDRO.partyId), "the payer never appears as a contact");

  const created = await kit.service.create(PEDRO, medicationRequest({ delegateId: camila.id, beneficiaryId: camila.id }));
  assert.ok(created.ok);
  assert.equal(created.mandate.delegate.id, camila.id);
  assert.equal(created.mandate.beneficiary.id, camila.id);
  assert.equal(created.mandate.status, "DRAFT");

  assert.ok((await kit.service.authorize(PEDRO, created.mandate.id)).ok);
  assert.equal((await kit.service.list({ partyId: camila.id }, "DELEGATE")).length, 1);
  assert.equal((await kit.service.list(ANDREA, "DELEGATE")).length, 0, "Andrea sees no budget she was not given");
});
