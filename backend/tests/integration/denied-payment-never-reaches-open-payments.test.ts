import assert from "node:assert/strict";
import test from "node:test";
import { createOutgoingPaymentIfAllowed } from "../../src/application/create-outgoing-payment-if-allowed.ts";
import { InMemoryGrantStore } from "../../src/integrations/open-payments/in-memory-grant-store.ts";
import { computeInteractionHash } from "../../src/integrations/open-payments/interaction-hash.ts";
import { InterledgerOpenPaymentsGateway } from "../../src/integrations/open-payments/interledger-open-payments-gateway.ts";
import { createFakeSdk, PAYER, PAYER_CONSENT } from "../integrations/open-payments/fake-sdk.ts";

/**
 * Drives the real adapter type with an SDK test double. Even with an active
 * payer grant and a valid quote id, DENY and REVIEW must not reach
 * outgoingPayment.create.
 */
async function gatewayWithActiveGrant() {
  const fake = createFakeSdk();
  const gateway = new InterledgerOpenPaymentsGateway({
    sdk: fake.sdk,
    grants: new InMemoryGrantStore(),
    finishUri: "http://localhost:4000/open-payments/finish",
    createNonce: () => "NONCE",
  });
  await gateway.startPayerGrant({
    grantKey: "demo-mandate-medication",
    payerWalletAddressUrl: PAYER.id,
    debitLimit: { value: "4000", assetCode: "USD", assetScale: 2 },
  });
  await gateway.finishPayerGrant({
    grantKey: "demo-mandate-medication",
    interactRef: "REF",
    hash: computeInteractionHash({
      clientNonce: "NONCE",
      finishNonce: PAYER_CONSENT.finishNonce,
      interactRef: "REF",
      grantEndpoint: PAYER.authServer,
    }),
  });
  return { fake, gateway };
}

const input = {
  grantKey: "demo-mandate-medication",
  quoteId: `${PAYER.id}/quotes/1`,
  metadata: { compasDecisionId: "demo-decision-alcohol" },
};

for (const outcome of ["DENY", "REVIEW"] as const) {
  test(`${outcome} never calls outgoingPayment.create on the real adapter`, async () => {
    const { fake, gateway } = await gatewayWithActiveGrant();
    const result = await createOutgoingPaymentIfAllowed(outcome, gateway, input);
    assert.equal(result, undefined);
    assert.equal(fake.callsTo("outgoingPayment.create").length, 0);
  });
}

test("ALLOW reaches outgoingPayment.create exactly once", async () => {
  const { fake, gateway } = await gatewayWithActiveGrant();
  const result = await createOutgoingPaymentIfAllowed("ALLOW", gateway, input);
  assert.ok(result);
  assert.equal(fake.callsTo("outgoingPayment.create").length, 1);
});
