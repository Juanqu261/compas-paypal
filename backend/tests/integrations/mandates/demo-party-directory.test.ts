import assert from "node:assert/strict";
import test from "node:test";
import { createDemoPartyDirectory, DEMO_CONTACTS } from "../../../src/integrations/mandates/demo-party-directory.ts";
import { ANDREA, medicationRequest, PEDRO, serviceKit } from "../../application/mandate-test-kit.ts";

test("the demo directory offers several test contacts, none of them with a wallet", async () => {
  const directory = createDemoPartyDirectory({});
  const ids = (await directory.list()).map((party) => party.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const contact of DEMO_CONTACTS) {
    assert.ok(ids.includes(contact.id), contact.id);
    assert.equal((await directory.getById(contact.id))?.walletAddressUrl, undefined);
  }
});

test("one contact can be both who pays and who the budget is for", async () => {
  const camila = DEMO_CONTACTS[0];
  const kit = serviceKit({ parties: createDemoPartyDirectory({ DEMO_PAYER_WALLET_ADDRESS: "https://wallet.test/pedro" }) });

  const participants = await kit.service.participants(PEDRO);
  assert.ok(participants.some((party) => party.id === camila.id));
  assert.ok(!participants.some((party) => party.id === PEDRO.partyId), "the payer never appears as a contact");

  const created = await kit.service.create(PEDRO, medicationRequest({ delegateId: camila.id, beneficiaryId: camila.id }));
  assert.ok(created.ok);
  assert.equal(created.mandate.delegate.id, camila.id);
  assert.equal(created.mandate.beneficiary.id, camila.id);
  assert.equal(created.mandate.status, "DRAFT");

  await kit.service.startAuthorization(PEDRO, created.mandate.id);
  await kit.gateway.finishGrant(created.mandate.id);
  await kit.service.completeAuthorization(created.mandate.id);
  assert.equal((await kit.service.list({ partyId: camila.id }, "DELEGATE")).length, 1);
  assert.equal((await kit.service.list(ANDREA, "DELEGATE")).length, 0, "Andrea sees no budget she was not given");
});
