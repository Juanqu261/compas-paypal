import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMerchantAccountVerifications,
  LOGIN_STATE_TTL_MS,
  MerchantIdentityService,
} from "../../src/application/merchant-identity.ts";
import { PayPalGatewayError } from "../../src/integrations/paypal/errors.ts";
import {
  PayPalRestIdentityGateway,
  toAccountIdentity,
} from "../../src/integrations/paypal/paypal-identity-gateway.ts";
import { DEMO_DROGUERIA_PAYPAL_ID } from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import { createDemoMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import type { PayPalIdentityGateway } from "../../src/ports/paypal-identity.ts";

const MERCHANT = "demo-merchant-drogueria-central";

function setup(payerId = DEMO_DROGUERIA_PAYPAL_ID) {
  let now = new Date("2026-10-27T15:00:00Z");
  let tokens = 0;
  const exchanged: string[] = [];
  const paypal: PayPalIdentityGateway = {
    authorizeUrl: (state) => `https://www.sandbox.paypal.com/signin/authorize?state=${state}`,
    exchange: async (code) => {
      exchanged.push(code);
      return { payerId, email: "pharmacy@example.com", emailConfirmed: true, verifiedAccount: true };
    },
  };
  const verifications = new InMemoryMerchantAccountVerifications();
  const identity = new MerchantIdentityService({
    paypal,
    merchants: createDemoMerchantDirectory({}),
    verifications,
    now: () => now,
    newToken: () => `token-${String(++tokens).padStart(37, "0")}`,
  });
  const stateOf = (url: string) => new URL(url).searchParams.get("state")!;
  return { identity, verifications, exchanged, stateOf, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

test("Log in with PayPal with the merchant's own account stores its email and starts a session", async () => {
  const { identity, verifications, stateOf } = setup();
  const state = stateOf((await identity.startLogin(MERCHANT))!);
  const result = await identity.completeLogin(state, "auth-code");
  assert.ok(result.ok);
  assert.deepEqual(identity.authenticate(`Bearer ${result.token}`), {
    merchantId: MERCHANT,
    paypalMerchantId: DEMO_DROGUERIA_PAYPAL_ID,
    proof: "PAYPAL_LOGIN",
  });
  assert.equal((await verifications.get(DEMO_DROGUERIA_PAYPAL_ID))?.email, "pharmacy@example.com");
});

test("another PayPal account is refused, and nothing is stored", async () => {
  const { identity, verifications, stateOf } = setup("SANDBXOTHER22");
  const state = stateOf((await identity.startLogin(MERCHANT))!);
  const result = await identity.completeLogin(state, "auth-code");
  assert.equal(!result.ok && result.code, "ACCOUNT_MISMATCH");
  assert.equal(await verifications.get(DEMO_DROGUERIA_PAYPAL_ID), undefined);
});

test("a login state is single use and expires, before any code is exchanged", async () => {
  const { identity, exchanged, stateOf, advance } = setup();
  const state = stateOf((await identity.startLogin(MERCHANT))!);
  assert.ok((await identity.completeLogin(state, "first")).ok);
  const replay = await identity.completeLogin(state, "second");
  assert.equal(!replay.ok && replay.code, "INVALID_STATE");

  const late = stateOf((await identity.startLogin(MERCHANT))!);
  advance(LOGIN_STATE_TTL_MS);
  const expired = await identity.completeLogin(late, "third");
  assert.equal(!expired.ok && expired.code, "INVALID_STATE");
  assert.deepEqual(exchanged, ["first"]);
  assert.equal(await identity.startLogin("demo-merchant-unknown"), undefined);
});

test("a demo merchant session proves nothing", async () => {
  const { identity } = setup();
  const session = await identity.startDemoSession(MERCHANT);
  assert.equal(identity.authenticate(`Bearer ${session!.token}`)?.proof, "DEMO");
  assert.equal(identity.authenticate("Bearer nope"), undefined);
});

test("the REST adapter exchanges the code with the app's credentials and reads userinfo with the user's token", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const gateway = new PayPalRestIdentityGateway({
    clientId: "client",
    clientSecret: "secret",
    returnUrl: "http://localhost:4000/paypal/identity/return",
    fetch: async (url, init) => {
      requests.push({ url, init });
      const body = url.endsWith("/v1/oauth2/token")
        ? { access_token: "user-token", token_type: "Bearer" }
        : {
            payer_id: "sandbxpharma2",
            verified_account: "true",
            emails: [{ value: "Pharmacy@Example.com", primary: true, confirmed: true }],
          };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });

  const authorize = new URL(gateway.authorizeUrl("abc"));
  assert.equal(authorize.origin, "https://www.sandbox.paypal.com");
  assert.equal(authorize.searchParams.get("state"), "abc");
  assert.match(authorize.searchParams.get("scope")!, /openid email/);

  assert.deepEqual(await gateway.exchange("the-code"), {
    payerId: "SANDBXPHARMA2",
    email: "pharmacy@example.com",
    emailConfirmed: true,
    verifiedAccount: true,
  });
  assert.equal(requests[0].init.body, "grant_type=authorization_code&code=the-code");
  assert.equal((requests[0].init.headers as Record<string, string>).authorization, `Basic ${Buffer.from("client:secret").toString("base64")}`);
  assert.match(requests[1].url, /\/v1\/identity\/oauth2\/userinfo\?schema=paypalv1\.1$/);
  assert.equal((requests[1].init.headers as Record<string, string>).authorization, "Bearer user-token");
});

test("userinfo without an email or a payer id is an error, never a partial identity", () => {
  assert.throws(() => toAccountIdentity({ payer_id: "X", emails: [] }), PayPalGatewayError);
  assert.equal(toAccountIdentity({ payer_id: "x", emails: [{ value: "a@b.co", confirmed: "false" }] }).emailConfirmed, false);
});
