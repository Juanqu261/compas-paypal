import assert from "node:assert/strict";
import test from "node:test";
import {
  handleMerchantOnboardingRequest,
  type MerchantOnboardingDeps,
  readAnalystJobsMode,
} from "../../src/api/merchant-onboarding.ts";
import { AnalystJobQueue } from "../../src/application/analyst-jobs.ts";
import { InMemoryMerchantAccountVerifications, MerchantIdentityService } from "../../src/application/merchant-identity.ts";
import { InMemoryAnalystFindings } from "../../src/integrations/analyst/in-memory-finding-repository.ts";
import { DEMO_DROGUERIA_PAYPAL_ID } from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import { createDemoMerchantDirectory } from "../../src/integrations/merchants/demo-merchant-directory.ts";
import { NotImplementedError } from "../../src/lib/not-implemented.ts";

const MERCHANT = "demo-merchant-drogueria-central";
const RETURN = "http://localhost:3000/nequi-negocios";

function deps(overrides: Partial<MerchantOnboardingDeps> = {}) {
  const merchants = createDemoMerchantDirectory({});
  const bound: { paypalMerchantId: string; text: unknown }[] = [];
  const identity = new MerchantIdentityService({
    paypal: {
      authorizeUrl: (state) => `https://www.sandbox.paypal.com/signin/authorize?state=${state}`,
      exchange: async () => ({ payerId: DEMO_DROGUERIA_PAYPAL_ID, email: "p@example.com", emailConfirmed: true, verifiedAccount: true }),
    },
    merchants,
    verifications: new InMemoryMerchantAccountVerifications(),
  });
  const all: MerchantOnboardingDeps = {
    identity,
    identityConfigured: true,
    demoSessions: true,
    merchants,
    findings: new InMemoryAnalystFindings(),
    bindCertificate: async (paypalMerchantId, text) => {
      bound.push({ paypalMerchantId, text });
      throw new NotImplementedError("AnalystModel.callTool");
    },
    respond: async () => ({ ok: false, code: "NOT_FOUND", message: "No such flag." }),
    withdraw: async () => ({ ok: false, code: "NOT_FOUND", message: "No such flag." }),
    jobs: { mode: { enabled: false, reason: "off" }, queue: new AnalystJobQueue({ run: async () => { throw new Error("not in this test"); } }) },
    frontendReturnUrl: RETURN,
    ...overrides,
  };
  const call = (method: string, path: string, options: { body?: unknown; authorization?: string } = {}) =>
    handleMerchantOnboardingRequest({ method, url: new URL(`http://localhost:4000${path}`), ...options }, all);
  return { call, identity, bound };
}

test("Log in with PayPal: start redirects to the sandbox, the return puts the session in the fragment", async () => {
  const { call } = deps();
  const start = await call("GET", `/paypal/identity/start?merchantId=${MERCHANT}`);
  assert.equal(start.status, 302);
  const state = new URL((start as { location: string }).location).searchParams.get("state")!;

  const back = (await call("GET", `/paypal/identity/return?state=${state}&code=abc`)) as { status: number; location: string };
  const url = new URL(back.location);
  assert.equal(url.origin + url.pathname, RETURN);
  assert.equal(url.search, "", "nothing in the query string");
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(fragment.get("merchantId"), MERCHANT);
  assert.ok(fragment.get("merchantSession"));

  const cancelled = (await call("GET", "/paypal/identity/return?error=access_denied")) as { location: string };
  assert.equal(new URLSearchParams(new URL(cancelled.location).hash.slice(1)).get("merchantLoginError"), "LOGIN_CANCELLED");
});

test("without PayPal credentials the login answers 503, never a pretend login", async () => {
  const { call } = deps({ identityConfigured: false });
  assert.equal((await call("GET", `/paypal/identity/start?merchantId=${MERCHANT}`)).status, 503);
});

test("a certificate needs a merchant session, and an unconfigured analyst fails closed", async () => {
  const { call, bound } = deps();
  assert.equal((await call("POST", "/merchant-onboarding/certificate", { body: { certificateText: "x" } })).status, 401);
  const session = (await call("POST", "/demo/merchant-sessions", { body: { merchantId: MERCHANT } })) as unknown as {
    body: { token: string };
  };
  const result = await call("POST", "/merchant-onboarding/certificate", {
    body: { certificateText: "CERTIFICADO" },
    authorization: `Bearer ${session.body.token}`,
  });
  assert.equal(result.status, 503);
  assert.deepEqual(bound, [{ paypalMerchantId: DEMO_DROGUERIA_PAYPAL_ID, text: "CERTIFICADO" }]);
});

test("analyst jobs are on for the demo, can be turned off, and never run in production", async () => {
  assert.equal((await deps().call("POST", "/analyst/jobs", { body: { merchantId: MERCHANT } })).status, 403);
  assert.equal(readAnalystJobsMode({}).enabled, true);
  assert.equal(readAnalystJobsMode({ COMPAS_ANALYST_JOBS: "disabled" }).enabled, false);
  assert.equal(readAnalystJobsMode({ NODE_ENV: "production" }).enabled, false);
});

test("findings outside a demo need the merchant's own session", async () => {
  const { call } = deps({ demoSessions: false });
  assert.equal((await call("GET", `/analyst/findings?merchantId=${MERCHANT}`)).status, 401);
});

test("withdrawing a flag needs the operator token", async () => {
  const path = "/operator/findings/finding-1/withdraw";
  assert.equal((await deps().call("POST", path, { body: { reason: "ok" } })).status, 503);
  const withToken = deps({ operatorToken: "operator-secret" });
  assert.equal((await withToken.call("POST", path, { body: { reason: "ok" }, authorization: "Bearer wrong" })).status, 401);
  assert.equal((await withToken.call("POST", path, { body: { reason: "ok" }, authorization: "Bearer operator-secret" })).status, 404);
});
