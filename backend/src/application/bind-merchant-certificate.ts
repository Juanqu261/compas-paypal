import { createHash, randomUUID } from "node:crypto";
import type { CamaraCertificatePointer } from "../domain/analyst.ts";
import { normalizeNit } from "../domain/merchant-identifiers.ts";
import type { AnalystFindingRepository } from "../ports/analyst-finding-repository.ts";
import type { AnalystModel } from "../ports/analyst-model.ts";
import type { CamaraVerifier } from "../ports/camara-verifier.ts";
import type { MerchantAccountVerificationStore } from "../ports/merchant-account-verifications.ts";
import { CERTIFICATE_SYSTEM, CERTIFICATE_TOOL, certificatePrompt, parseCertificateFields } from "./analyst-output.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "./ingest-category-claim.ts";

/** The (simulated) Cámara de Comercio as a trust-log source: registry claims and verified bindings. */
export const CAMARA_SOURCE_ID = "camara-fixture";
/** What a merchant asserts itself while onboarding, such as the NIT it uploaded. */
export const ONBOARDING_SOURCE_ID = "compas-onboarding/merchant";

export const MAX_CERTIFICATE_BYTES = 32 * 1024;
/** A Cámara registration is renewed every year. */
const CLAIM_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

export type CertificateBindingDeps = {
  model: AnalystModel;
  camara: CamaraVerifier;
  verifications: MerchantAccountVerificationStore;
  findings: AnalystFindingRepository;
  ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
  now?: () => Date;
  newId?: () => string;
};

export type CertificateBindingResult =
  | { ok: true; finding: CamaraCertificatePointer }
  | { ok: false; code: "INVALID_CERTIFICATE"; message: string };

function digest(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

/**
 * A merchant uploads its Cámara certificate. The analyst only reads it:
 *
 * 1. The model reads the verification code and the NIT (a pointer).
 * 2. The Cámara answers for that code. Its record, never the model's
 *    reading, is what counts, and its NIT must be the one on the document.
 * 3. The Cámara's CIIU codes enter the trust log as a registry claim about
 *    the NIT, and the merchant's upload as its own binding of the NIT to its
 *    PayPal account. Alone, that is REGISTRY_UNBOUND: at most MEDIUM.
 * 4. If Log in with PayPal proved the account's email, the email is confirmed,
 *    and it is the certificate's notification email, the Cámara source binds
 *    the NIT to the account as well. The declared category becomes
 *    EXTERNAL_VERIFIED, and HIGH is reachable.
 *
 * Everything goes through the one ingestion path. A NIT is never stored raw.
 */
export async function bindMerchantCertificate(
  input: { paypalMerchantId: string; certificateText: unknown },
  deps: CertificateBindingDeps,
): Promise<CertificateBindingResult> {
  const text = input.certificateText;
  if (typeof text !== "string" || text.trim() === "" || Buffer.byteLength(text, "utf8") > MAX_CERTIFICATE_BYTES) {
    return { ok: false, code: "INVALID_CERTIFICATE", message: `The certificate must be text of at most ${MAX_CERTIFICATE_BYTES} bytes.` };
  }
  const now = deps.now?.() ?? new Date();
  const observedAt = now.toISOString();
  const finding = (outcome: CamaraCertificatePointer["outcome"], verificationCode: string, detail: string) =>
    ({
      kind: "POINTER",
      pointer: "CAMARA_CERTIFICATE",
      id: `finding-${(deps.newId ?? randomUUID)()}`,
      runId: `certificate-${digest(input.paypalMerchantId, observedAt)}`,
      paypalMerchantId: input.paypalMerchantId,
      verificationCode,
      outcome,
      detail,
      recordedAt: observedAt,
    }) satisfies CamaraCertificatePointer;
  const done = async (pointer: CamaraCertificatePointer): Promise<CertificateBindingResult> => {
    await deps.findings.append([pointer]);
    return { ok: true, finding: pointer };
  };

  // 1. The pointer. A model that reads nothing usable fails the upload closed.
  const fields = parseCertificateFields(
    await deps.model.callTool({ system: CERTIFICATE_SYSTEM, user: certificatePrompt(text), tool: CERTIFICATE_TOOL }),
  );

  // 2. The source.
  const record = await deps.camara.verify(fields.verificationCode);
  if (!record) {
    return done(finding("REJECTED", fields.verificationCode, "The Cámara has no certificate with this verification code."));
  }
  if (normalizeNit(fields.nit) !== record.nit) {
    return done(finding("REJECTED", fields.verificationCode, "The NIT on the document is not the one the Cámara holds for this code."));
  }

  // 3. The registry claim and the merchant's own binding.
  const validUntil = new Date(now.getTime() + CLAIM_VALIDITY_MS).toISOString();
  await submit(deps, {
    schemaVersion: "1",
    sourceId: CAMARA_SOURCE_ID,
    submissionId: `camara-claim-${digest(record.verificationCode)}`,
    type: "CATEGORY_CLAIM",
    subject: { kind: "TAX_ID", taxId: record.nit },
    codes: record.ciiu.slice(0, 4).map((code, index) => ({
      system: "CIIU_REV4_AC",
      code,
      role: index === 0 ? "PRIMARY" : "SECONDARY",
    })),
    observedAt,
    validUntil,
    evidenceRef: `camara-certificate:${record.verificationCode}`,
  });
  await submit(deps, {
    schemaVersion: "1",
    sourceId: ONBOARDING_SOURCE_ID,
    submissionId: `onboarding-binding-${digest(input.paypalMerchantId, record.nit)}`,
    type: "IDENTITY_BINDING",
    paypalMerchantId: input.paypalMerchantId,
    taxId: record.nit,
    observedAt,
  });

  // 4. The verified binding, only on a proven email match.
  const verification = await deps.verifications.get(input.paypalMerchantId);
  const unbound = !verification
    ? "No Log in with PayPal for this account yet, so the certificate is not bound to it."
    : !verification.emailConfirmed
      ? "PayPal does not report this account's email as confirmed."
      : !record.notificationEmail || record.notificationEmail !== verification.email
        ? "The certificate's notification email is not this PayPal account's email."
        : undefined;
  if (unbound) return done(finding("VERIFIED_UNBOUND", record.verificationCode, unbound));

  await submit(deps, {
    schemaVersion: "1",
    sourceId: CAMARA_SOURCE_ID,
    submissionId: `camara-binding-${digest(input.paypalMerchantId, record.nit, record.verificationCode)}`,
    type: "IDENTITY_BINDING",
    paypalMerchantId: input.paypalMerchantId,
    taxId: record.nit,
    observedAt,
    validUntil,
  });
  return done(
    finding(
      "VERIFIED_BOUND",
      record.verificationCode,
      `The Cámara confirms the certificate${deps.camara.simulated ? " (simulated Cámara, demo/test data)" : ""}, and its email is this PayPal account's.`,
    ),
  );
}

/**
 * One submission through the ingestion path. The same submission id with a
 * newer observedAt means it was already recorded at an earlier upload: the
 * first one stands.
 */
async function submit(deps: Pick<CertificateBindingDeps, "ingest">, submission: Record<string, unknown>): Promise<void> {
  const result = await deps.ingest({ body: new TextEncoder().encode(JSON.stringify(submission)), transport: "PULL" });
  if (!result.ok && result.code !== "SUBMISSION_ID_REUSED") {
    throw new Error(`The trust log refused ${String(submission.submissionId)}: ${result.code} ${result.message}`);
  }
}
