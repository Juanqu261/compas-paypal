import assert from "node:assert/strict";
import test from "node:test";
import { AnalystOutputError } from "../../src/application/analyst-output.ts";
import { bindMerchantCertificate } from "../../src/application/bind-merchant-certificate.ts";
import { InMemoryMerchantAccountVerifications } from "../../src/application/merchant-identity.ts";
import { FixtureCamaraVerifier } from "../../src/integrations/camara/fixture-camara-verifier.ts";
import { DEMO_CAMARA_DIR } from "../../src/integrations/merchant-registry/data-paths.ts";
import {
  DEMO_DROGUERIA_PAYPAL_ID,
  DEMO_LOOKALIKE_PAYPAL_ID,
} from "../../src/integrations/merchant-registry/demo-category-seed.ts";
import { analystBench, fakeModel, MERCHANT_EMAIL, NOW } from "./analyst-test-kit.ts";

const LOOKALIKE_EMAIL = "ventas@centrall-ofertas.example";

/** An honest reader: copies the printed code and NIT. */
const reader = () =>
  fakeModel((call) => {
    const text = JSON.parse(/<certificate_data>\n([\s\S]*)\n<\/certificate_data>/.exec(call.user)![1]) as string;
    return {
      verificationCode: /verificación:\s*(\S+)/.exec(text)?.[1] ?? null,
      nit: /NIT:\s*(\S+)/.exec(text)?.[1] ?? null,
    };
  });

async function setup() {
  const bench = await analystBench();
  const camara = new FixtureCamaraVerifier({ dir: DEMO_CAMARA_DIR, env: { DEMO_MERCHANT_PAYPAL_EMAIL: MERCHANT_EMAIL } });
  const verifications = new InMemoryMerchantAccountVerifications();
  const login = (paypalMerchantId: string, email: string, emailConfirmed = true) =>
    verifications.put({ paypalMerchantId, email, emailConfirmed, verifiedAccount: true, verifiedAt: NOW.toISOString() });
  const bind = (paypalMerchantId: string, certificateText: unknown, model = reader()) =>
    bindMerchantCertificate(
      { paypalMerchantId, certificateText },
      { model, camara, verifications, findings: bench.findings, ingest: bench.categories.ingest, now: () => NOW },
    );
  const certificate = (merchantId: string) => camara.certificateText(merchantId)!;
  return { bench, camara, login, bind, certificate };
}

test("a certificate whose email is the PayPal account's binds the NIT: EXTERNAL_VERIFIED", async () => {
  const { bench, login, bind, certificate } = await setup();
  await login(DEMO_DROGUERIA_PAYPAL_ID, MERCHANT_EMAIL);
  const result = await bind(DEMO_DROGUERIA_PAYPAL_ID, certificate("demo-merchant-drogueria-central"));
  assert.equal(result.ok && result.finding.outcome, "VERIFIED_BOUND");

  const { resolution, step } = await bench.medicationStep(DEMO_DROGUERIA_PAYPAL_ID);
  assert.equal(resolution.declarations.find((declared) => declared.category === "MEDICATION")?.corroboration, "EXTERNAL_VERIFIED");
  assert.equal(step.result, "PASS");
  assert.equal(step.result === "PASS" && step.confidence.confidence, "HIGH");
});

test("without Log in with PayPal, the same certificate is REGISTRY_UNBOUND: never HIGH", async () => {
  const { bench, bind, certificate } = await setup();
  const result = await bind(DEMO_LOOKALIKE_PAYPAL_ID, certificate("demo-merchant-lookalike"));
  assert.equal(result.ok && result.finding.outcome, "VERIFIED_UNBOUND");
  assert.match(result.ok ? result.finding.detail : "", /No Log in with PayPal/);

  const { resolution, step } = await bench.medicationStep(DEMO_LOOKALIKE_PAYPAL_ID);
  assert.equal(resolution.declarations[0].corroboration, "REGISTRY_UNBOUND");
  assert.equal(step.result, "REVIEW");
  assert.equal(step.result === "REVIEW" && step.reason.code, "MERCHANT_EVIDENCE_INSUFFICIENT");
});

test("an email that differs, or is not confirmed at PayPal, does not bind", async () => {
  const mismatch = await setup();
  await mismatch.login(DEMO_LOOKALIKE_PAYPAL_ID, "someone-else@example.com");
  const result = await mismatch.bind(DEMO_LOOKALIKE_PAYPAL_ID, mismatch.certificate("demo-merchant-lookalike"));
  assert.equal(result.ok && result.finding.outcome, "VERIFIED_UNBOUND");

  const unconfirmed = await setup();
  await unconfirmed.login(DEMO_LOOKALIKE_PAYPAL_ID, LOOKALIKE_EMAIL, false);
  const second = await unconfirmed.bind(DEMO_LOOKALIKE_PAYPAL_ID, unconfirmed.certificate("demo-merchant-lookalike"));
  assert.equal(second.ok && second.finding.outcome, "VERIFIED_UNBOUND");
  assert.match(second.ok ? second.finding.detail : "", /email as confirmed/);
});

test("the Cámara's record counts, never the model's reading: a NIT that differs is rejected", async () => {
  const { bench, bind, certificate } = await setup();
  const misread = fakeModel(() => ({ verificationCode: "DEMO-CCMA-2B8R4T6W", nit: "800197268-4" }));
  const result = await bind(DEMO_LOOKALIKE_PAYPAL_ID, certificate("demo-merchant-lookalike"), misread);
  assert.equal(result.ok && result.finding.outcome, "REJECTED");
  assert.equal((await bench.medicationStep(DEMO_LOOKALIKE_PAYPAL_ID, "LOW")).resolution.declarations[0].corroboration, "UNCORROBORATED");
});

test("a verification code the Cámara doesn't know is rejected", async () => {
  const { bind } = await setup();
  const forged = fakeModel(() => ({ verificationCode: "FORGED-0000-0000", nit: "900456781-6" }));
  const result = await bind(DEMO_LOOKALIKE_PAYPAL_ID, "CERTIFICADO… Código de verificación: FORGED-0000-0000", forged);
  assert.equal(result.ok && result.finding.outcome, "REJECTED");
});

test("the lookalike uploading the real pharmacy's certificate is contested, and the real one keeps HIGH", async () => {
  const { bench, login, bind, certificate } = await setup();
  await login(DEMO_DROGUERIA_PAYPAL_ID, MERCHANT_EMAIL);
  await bind(DEMO_DROGUERIA_PAYPAL_ID, certificate("demo-merchant-drogueria-central"));

  const stolen = await bind(DEMO_LOOKALIKE_PAYPAL_ID, certificate("demo-merchant-drogueria-central"));
  assert.equal(stolen.ok && stolen.finding.outcome, "VERIFIED_UNBOUND");

  const lookalike = await bench.medicationStep(DEMO_LOOKALIKE_PAYPAL_ID, "LOW");
  assert.equal(lookalike.step.result, "REVIEW");
  assert.equal(lookalike.step.result === "REVIEW" && lookalike.step.reason.code, "MERCHANT_EVIDENCE_CONFLICT");
  const real = await bench.medicationStep(DEMO_DROGUERIA_PAYPAL_ID);
  assert.equal(real.step.result === "PASS" && real.step.confidence.confidence, "HIGH");
});

test("an unreadable certificate fails closed and records nothing", async () => {
  const { bench, bind } = await setup();
  const blank = fakeModel(() => ({ verificationCode: null, nit: null }));
  await assert.rejects(bind(DEMO_LOOKALIKE_PAYPAL_ID, "not a certificate", blank), AnalystOutputError);
  assert.equal((await bench.findings.listByMerchant(DEMO_LOOKALIKE_PAYPAL_ID)).length, 0);

  const huge = await bind(DEMO_LOOKALIKE_PAYPAL_ID, "x".repeat(40 * 1024));
  assert.equal(!huge.ok && huge.code, "INVALID_CERTIFICATE");
});

test("the analyst never sees the certificate outside its data block, and never a NIT is stored", async () => {
  const { bench, bind, certificate } = await setup();
  const model = reader();
  await bind(DEMO_LOOKALIKE_PAYPAL_ID, certificate("demo-merchant-lookalike"), model);
  assert.match(model.calls[0].system, /<certificate_data> was uploaded by a merchant/);
  const stored = JSON.stringify(await bench.findings.listByMerchant(DEMO_LOOKALIKE_PAYPAL_ID));
  assert.ok(!stored.includes("901876542"), "the finding holds no NIT");
});
