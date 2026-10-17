import assert from "node:assert/strict";
import test from "node:test";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import { OpenPaymentsGatewayError } from "../../../src/integrations/open-payments/errors.ts";
import { InMemoryGrantStore } from "../../../src/integrations/open-payments/in-memory-grant-store.ts";
import { computeInteractionHash } from "../../../src/integrations/open-payments/interaction-hash.ts";
import { InterledgerOpenPaymentsGateway } from "../../../src/integrations/open-payments/interledger-open-payments-gateway.ts";
import type { SafePaymentMetadata } from "../../../src/ports/open-payments-gateway.ts";
import { createFakeSdk, MERCHANT, PAYER, PAYER_CONSENT } from "./fake-sdk.ts";

const GRANT_KEY = "demo-mandate-medication";
const CLIENT_NONCE = "CLIENT-NONCE";
const START = new Date("2026-10-16T12:00:00.000Z");

const usd = (value: string) => ({ value, assetCode: "USD", assetScale: 2 });
const eur = (value: string) => ({ value, assetCode: "EUR", assetScale: 2 });

function setup() {
  const fake = createFakeSdk();
  const clock = { now: START };
  const grants = new InMemoryGrantStore();
  const gateway = new InterledgerOpenPaymentsGateway({
    sdk: fake.sdk,
    grants,
    finishUri: "http://localhost:4000/open-payments/finish",
    now: () => clock.now,
    createNonce: () => CLIENT_NONCE,
  });
  return { fake, clock, grants, gateway };
}

const validHash = (interactRef: string) =>
  computeInteractionHash({
    clientNonce: CLIENT_NONCE,
    finishNonce: PAYER_CONSENT.finishNonce,
    interactRef,
    grantEndpoint: PAYER.authServer,
  });

async function activeGrant(gateway: InterledgerOpenPaymentsGateway) {
  await gateway.startPayerGrant({
    grantKey: GRANT_KEY,
    payerWalletAddressUrl: PAYER.id,
    debitLimit: usd("4000"),
  });
  await gateway.finishPayerGrant({
    grantKey: GRANT_KEY,
    interactRef: "REF-1",
    hash: validHash("REF-1"),
  });
}

function isGatewayError(code: string) {
  return (error: unknown) =>
    error instanceof OpenPaymentsGatewayError && error.code === code;
}

test("the payer grant caps debitAmount, names no receiver and asks for interaction", async () => {
  const { fake, gateway } = setup();

  const started = await gateway.startPayerGrant({
    grantKey: GRANT_KEY,
    payerWalletAddressUrl: PAYER.id,
    debitLimit: usd("4000"),
  });

  assert.deepEqual(started, { redirectUrl: PAYER_CONSENT.redirect });
  const [request] = fake.callsTo("grant.request");
  assert.deepEqual(request.args[0], { url: PAYER.authServer });
  assert.deepEqual(request.args[1], {
    access_token: {
      access: [
        {
          type: "outgoing-payment",
          actions: ["create", "read"],
          identifier: PAYER.id,
          limits: { debitAmount: usd("4000") },
        },
      ],
    },
    interact: {
      start: ["redirect"],
      finish: {
        method: "redirect",
        uri: `http://localhost:4000/open-payments/finish?grantKey=${GRANT_KEY}`,
        nonce: CLIENT_NONCE,
      },
    },
  });
});

test("an interval is passed through when the mandate sets one", async () => {
  const { fake, gateway } = setup();
  await gateway.startPayerGrant({
    grantKey: GRANT_KEY,
    payerWalletAddressUrl: PAYER.id,
    debitLimit: usd("4000"),
    interval: "R/2026-10-16T00:00:00Z/P1M",
  });
  const [request] = fake.callsTo("grant.request");
  const body = request.args[1] as {
    access_token: { access: { limits: Record<string, unknown> }[] };
  };
  assert.equal(body.access_token.access[0].limits.interval, "R/2026-10-16T00:00:00Z/P1M");
});

test("a budget in another asset is refused before any grant request", async () => {
  const { fake, gateway } = setup();
  await assert.rejects(
    gateway.startPayerGrant({
      grantKey: GRANT_KEY,
      payerWalletAddressUrl: PAYER.id,
      debitLimit: eur("4000"),
    }),
    isGatewayError("ASSET_MISMATCH"),
  );
  assert.equal(fake.callsTo("grant.request").length, 0);
});

test("a valid finish hash continues the grant with the interact_ref", async () => {
  const { fake, grants, gateway } = setup();
  await activeGrant(gateway);

  const [continued] = fake.callsTo("grant.continue");
  assert.deepEqual(continued.args[0], {
    url: PAYER_CONSENT.continueUri,
    accessToken: PAYER_CONSENT.continueToken,
  });
  assert.deepEqual(continued.args[1], { interact_ref: "REF-1" });

  const stored = await grants.get(GRANT_KEY);
  assert.equal(stored?.state, "ACTIVE");
  assert.equal(
    stored?.state === "ACTIVE" && stored.accessTokenExpiresAt,
    "2026-10-16T12:10:00.000Z",
  );
});

test("a bad finish hash never reaches grant.continue and leaves the grant unusable", async () => {
  const { fake, gateway } = setup();
  await gateway.startPayerGrant({
    grantKey: GRANT_KEY,
    payerWalletAddressUrl: PAYER.id,
    debitLimit: usd("4000"),
  });

  await assert.rejects(
    gateway.finishPayerGrant({
      grantKey: GRANT_KEY,
      interactRef: "REF-1",
      hash: validHash("FORGED"),
    }),
    isGatewayError("INVALID_INTERACTION_HASH"),
  );
  assert.equal(fake.callsTo("grant.continue").length, 0);

  await assert.rejects(
    gateway.createOutgoingPayment({ grantKey: GRANT_KEY, quoteId: "q", metadata: {} }),
    isGatewayError("GRANT_NOT_ACTIVE"),
  );
  assert.equal(fake.callsTo("outgoingPayment.create").length, 0);
});

test("a hash over the grant endpoint with a trailing slash is accepted", async () => {
  const { fake, gateway } = setup();
  await gateway.startPayerGrant({
    grantKey: GRANT_KEY,
    payerWalletAddressUrl: PAYER.id,
    debitLimit: usd("4000"),
  });
  const hash = computeInteractionHash({
    clientNonce: CLIENT_NONCE,
    finishNonce: PAYER_CONSENT.finishNonce,
    interactRef: "REF-1",
    grantEndpoint: `${PAYER.authServer}/`,
  });
  await gateway.finishPayerGrant({ grantKey: GRANT_KEY, interactRef: "REF-1", hash });
  assert.equal(fake.callsTo("grant.continue").length, 1);
});

test("a repeated finish redirect is harmless", async () => {
  const { fake, gateway } = setup();
  await activeGrant(gateway);
  const again = await gateway.finishPayerGrant({
    grantKey: GRANT_KEY,
    interactRef: "REF-1",
    hash: validHash("REF-1"),
  });
  assert.deepEqual(again, { status: "GRANTED" });
  assert.equal(fake.callsTo("grant.continue").length, 1);
});

test("an unknown grant cannot pay", async () => {
  const { fake, gateway } = setup();
  await assert.rejects(
    gateway.createOutgoingPayment({ grantKey: "nope", quoteId: "q", metadata: {} }),
    isGatewayError("GRANT_NOT_FOUND"),
  );
  assert.equal(fake.callsTo("outgoingPayment.create").length, 0);
});

test("the incoming payment is created on the merchant wallet with a client token", async () => {
  const { fake, gateway } = setup();

  const incoming = await gateway.createIncomingPayment({
    merchantWalletAddressUrl: MERCHANT.id,
    incomingAmount: eur("1000"),
    metadata: { externalReference: "ext-1" },
  });

  assert.equal(incoming.walletAddressUrl, MERCHANT.id);
  assert.deepEqual(incoming.incomingAmount, eur("1000"));

  const [grantRequest] = fake.callsTo("grant.request");
  assert.deepEqual(grantRequest.args[0], { url: MERCHANT.authServer });
  assert.deepEqual(grantRequest.args[1], {
    access_token: {
      access: [{ type: "incoming-payment", actions: ["create", "read"] }],
    },
  });

  const [create] = fake.callsTo("incomingPayment.create");
  assert.deepEqual(create.args[0], {
    url: MERCHANT.resourceServer,
    accessToken: "CLIENT-TOKEN-incoming-payment",
  });
  assert.deepEqual(create.args[1], {
    walletAddress: MERCHANT.id,
    incomingAmount: eur("1000"),
    metadata: { externalReference: "ext-1" },
  });
});

test("an incoming amount in the payer's asset is refused, not converted", async () => {
  const { fake, gateway } = setup();
  await assert.rejects(
    gateway.createIncomingPayment({
      merchantWalletAddressUrl: MERCHANT.id,
      incomingAmount: usd("1000"),
    }),
    isGatewayError("ASSET_MISMATCH"),
  );
  assert.equal(fake.callsTo("incomingPayment.create").length, 0);
});

test("client grants are cached per auth server until they expire", async () => {
  const { fake, clock, gateway } = setup();
  const input = { merchantWalletAddressUrl: MERCHANT.id, incomingAmount: eur("1000") };

  await gateway.createIncomingPayment(input);
  await gateway.createIncomingPayment(input);
  assert.equal(fake.callsTo("grant.request").length, 1);

  clock.now = new Date(START.getTime() + 601_000);
  await gateway.createIncomingPayment(input);
  assert.equal(fake.callsTo("grant.request").length, 2);
});

test("the quote prices the payer wallet into the incoming payment", async () => {
  const { fake, gateway } = setup();
  const quote = await gateway.createQuote({
    payerWalletAddressUrl: PAYER.id,
    incomingPaymentUrl: `${MERCHANT.id}/incoming-payments/1`,
  });

  assert.deepEqual(quote.debitAmount, usd("1120"));
  assert.deepEqual(quote.receiveAmount, eur("1000"));

  const [create] = fake.callsTo("quote.create");
  assert.deepEqual(create.args[0], {
    url: PAYER.resourceServer,
    accessToken: "CLIENT-TOKEN-quote",
  });
  assert.deepEqual(create.args[1], {
    walletAddress: PAYER.id,
    receiver: `${MERCHANT.id}/incoming-payments/1`,
    method: "ilp",
  });
});

test("the outgoing payment uses the payer token, the quote and safe metadata only", async () => {
  const { fake, gateway } = setup();
  await activeGrant(gateway);

  const payment = await gateway.createOutgoingPayment({
    grantKey: GRANT_KEY,
    quoteId: `${PAYER.id}/quotes/1`,
    metadata: {
      compasMandateId: GRANT_KEY,
      compasDecisionId: "decision-1",
      diagnosis: "hypertension",
    } as SafePaymentMetadata,
  });

  assert.equal(payment.state, "PENDING");
  const [create] = fake.callsTo("outgoingPayment.create");
  assert.deepEqual(create.args[0], {
    url: PAYER.resourceServer,
    accessToken: "PAYER-TOKEN-1",
  });
  assert.deepEqual(create.args[1], {
    walletAddress: PAYER.id,
    quoteId: `${PAYER.id}/quotes/1`,
    metadata: { compasMandateId: GRANT_KEY, compasDecisionId: "decision-1" },
  });
});

test("one decision creates at most one outgoing payment", async () => {
  const { fake, gateway } = setup();
  await activeGrant(gateway);
  const input = {
    grantKey: GRANT_KEY,
    quoteId: `${PAYER.id}/quotes/1`,
    metadata: { compasDecisionId: "decision-1" },
  };

  const [first, second] = await Promise.all([
    gateway.createOutgoingPayment(input),
    gateway.createOutgoingPayment(input),
  ]);
  const third = await gateway.createOutgoingPayment(input);

  assert.equal(fake.callsTo("outgoingPayment.create").length, 1);
  assert.equal(second.url, first.url);
  assert.equal(third.url, first.url);
});

test("an expired quote is refused before Open Payments is called", async () => {
  const { fake, clock, gateway } = setup();
  await activeGrant(gateway);
  const quote = await gateway.createQuote({
    payerWalletAddressUrl: PAYER.id,
    incomingPaymentUrl: `${MERCHANT.id}/incoming-payments/1`,
  });

  clock.now = new Date("2026-10-16T12:05:00.000Z");
  await assert.rejects(
    gateway.createOutgoingPayment({ grantKey: GRANT_KEY, quoteId: quote.id, metadata: {} }),
    isGatewayError("QUOTE_EXPIRED"),
  );
  assert.equal(fake.callsTo("outgoingPayment.create").length, 0);
});

test("an expired payer token is rotated before use", async () => {
  const { fake, clock, gateway } = setup();
  await activeGrant(gateway);
  clock.now = new Date(START.getTime() + 600_000);

  await gateway.createOutgoingPayment({
    grantKey: GRANT_KEY,
    quoteId: `${PAYER.id}/quotes/1`,
    metadata: {},
  });

  const [rotate] = fake.callsTo("token.rotate");
  assert.deepEqual(rotate.args[0], {
    url: "https://auth.wallet.test/token/payer",
    accessToken: "PAYER-TOKEN-1",
  });
  const [create] = fake.callsTo("outgoingPayment.create");
  assert.equal((create.args[0] as { accessToken: string }).accessToken, "PAYER-TOKEN-2");
});

test("a 401 rotates the payer token once and retries", async () => {
  const { fake, gateway } = setup();
  await activeGrant(gateway);
  const create = fake.sdk.outgoingPayment.create;
  let failures = 1;
  fake.sdk.outgoingPayment.create = async (requestArgs, createArgs) => {
    if (failures-- > 0) {
      fake.calls.push({ method: "outgoingPayment.create", args: [requestArgs, createArgs] });
      throw new OpenPaymentsClientError("Unauthorized", { description: "token expired", status: 401 });
    }
    return create(requestArgs, createArgs);
  };

  await gateway.createOutgoingPayment({
    grantKey: GRANT_KEY,
    quoteId: `${PAYER.id}/quotes/1`,
    metadata: {},
  });

  const attempts = fake.callsTo("outgoingPayment.create");
  assert.equal(attempts.length, 2);
  assert.equal((attempts[0].args[0] as { accessToken: string }).accessToken, "PAYER-TOKEN-1");
  assert.equal((attempts[1].args[0] as { accessToken: string }).accessToken, "PAYER-TOKEN-2");
});

test("Open Payments errors map to gateway codes and fail closed", async () => {
  const { fake, gateway } = setup();
  await activeGrant(gateway);
  fake.sdk.outgoingPayment.create = async () => {
    throw new OpenPaymentsClientError("Forbidden", {
      description: "Insufficient grant",
      status: 403,
    });
  };

  await assert.rejects(
    gateway.createOutgoingPayment({
      grantKey: GRANT_KEY,
      quoteId: `${PAYER.id}/quotes/1`,
      metadata: { compasDecisionId: "decision-2" },
    }),
    (error: unknown) =>
      error instanceof OpenPaymentsGatewayError &&
      error.code === "FORBIDDEN" &&
      error.status === 403 &&
      error.message.includes("Insufficient grant"),
  );
});

test("reading the payment derives COMPLETED from sentAmount", async () => {
  const { gateway } = setup();
  await activeGrant(gateway);
  const payment = await gateway.readOutgoingPayment({
    grantKey: GRANT_KEY,
    outgoingPaymentUrl: `${PAYER.id}/outgoing-payments/1`,
  });
  assert.equal(payment.state, "COMPLETED");
  assert.deepEqual(payment.sentAmount, usd("1120"));
});

test("the receiver view discovers the auth server for an unknown incoming payment", async () => {
  const { fake, gateway } = setup();
  const incoming = await gateway.readIncomingPayment(`${MERCHANT.id}/incoming-payments/9`);
  assert.equal(incoming.completed, true);
  assert.equal(fake.callsTo("incomingPayment.getPublic").length, 1);
  const [grantRequest] = fake.callsTo("grant.request");
  assert.deepEqual(grantRequest.args[0], { url: MERCHANT.authServer });
});

test("grant spent amounts are read with the payer token", async () => {
  const { gateway } = setup();
  await activeGrant(gateway);
  const spent = await gateway.readGrantSpentAmounts(GRANT_KEY);
  assert.deepEqual(spent, { spentDebitAmount: usd("1120") });
});

test("cancelling a grant revokes it at the auth server and forgets it", async () => {
  const { fake, grants, gateway } = setup();
  await activeGrant(gateway);
  await gateway.cancelPayerGrant(GRANT_KEY);

  const [cancel] = fake.callsTo("grant.cancel");
  assert.deepEqual(cancel.args[0], {
    url: "https://auth.wallet.test/continue/2",
    accessToken: "CONTINUE-TOKEN-2",
  });
  assert.equal(await grants.get(GRANT_KEY), undefined);
  await assert.rejects(
    gateway.createOutgoingPayment({ grantKey: GRANT_KEY, quoteId: "q", metadata: {} }),
    isGatewayError("GRANT_NOT_FOUND"),
  );
});

test("no value returned by the gateway carries a token", async () => {
  const { gateway } = setup();
  const results: unknown[] = [];
  results.push(await gateway.resolveWallet(PAYER.id));
  results.push(
    await gateway.startPayerGrant({
      grantKey: GRANT_KEY,
      payerWalletAddressUrl: PAYER.id,
      debitLimit: usd("4000"),
    }),
  );
  results.push(
    await gateway.finishPayerGrant({
      grantKey: GRANT_KEY,
      interactRef: "REF-1",
      hash: validHash("REF-1"),
    }),
  );
  const incoming = await gateway.createIncomingPayment({
    merchantWalletAddressUrl: MERCHANT.id,
    incomingAmount: eur("1000"),
  });
  results.push(incoming);
  const quote = await gateway.createQuote({
    payerWalletAddressUrl: PAYER.id,
    incomingPaymentUrl: incoming.url,
  });
  results.push(quote);
  const outgoing = await gateway.createOutgoingPayment({
    grantKey: GRANT_KEY,
    quoteId: quote.id,
    metadata: { compasDecisionId: "decision-1" },
  });
  results.push(outgoing);
  results.push(
    await gateway.readOutgoingPayment({ grantKey: GRANT_KEY, outgoingPaymentUrl: outgoing.url }),
  );
  results.push(await gateway.readIncomingPayment(incoming.url));
  results.push(await gateway.readGrantSpentAmounts(GRANT_KEY));

  const serialized = JSON.stringify(results);
  assert.equal(serialized.includes("TOKEN"), false);
  assert.equal(serialized.includes(CLIENT_NONCE), false);
  assert.equal(serialized.includes(PAYER_CONSENT.finishNonce), false);
});
