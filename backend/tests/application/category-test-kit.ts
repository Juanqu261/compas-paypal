import { generateKeyPairSync, type JsonWebKey, type KeyObject, sign } from "node:crypto";
import {
  ingestCategoryClaim,
  type IngestionResult,
} from "../../src/application/ingest-category-claim.ts";
import type { CategorySource } from "../../src/domain/merchant-category.ts";
import { verifyClaimSignature } from "../../src/integrations/merchant-registry/claim-signature.ts";
import { InMemoryTrustLog } from "../../src/integrations/merchant-registry/in-memory-trust-log.ts";
import { loadCategoryMappings } from "../../src/integrations/merchant-registry/json-category-mappings.ts";
import { StaticCategorySourceRegistry } from "../../src/integrations/merchant-registry/static-source-registry.ts";
import { createSubjectRefFn } from "../../src/integrations/merchant-registry/subject-ref.ts";

export const PHARMACY = "TESTPHARMACY2";
export const LIQUOR = "TESTLAGERBAR2";
/** DIAN's own NIT, a public check-digit test vector. */
export const VALID_NIT = "800197268-4";
export const NOW = new Date("2026-10-16T15:00:00Z");

export type TestKey = { publicKeyJwk: JsonWebKey; privateKey: KeyObject };

export function newKey(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKeyJwk: publicKey.export({ format: "jwk" }), privateKey };
}

export function source(
  id: string,
  overrides: Partial<CategorySource> & { key?: TestKey } = {},
): CategorySource {
  const { key, ...rest } = overrides;
  return {
    id,
    kind: "WALLET_PROVIDER",
    trustLevel: "PROVIDER_VERIFIED",
    transport: "PUSH",
    allowedEntryTypes: ["CATEGORY_CLAIM", "LICENSE_CLAIM", "IDENTITY_BINDING", "FLAG"],
    allowedSystems: ["CIIU_REV4_AC"],
    allowedLicenses: ["CO_PHARMACY_ESTABLISHMENT"],
    simulated: true,
    ...(key ? { publicKeyJwk: key.publicKeyJwk } : {}),
    ...rest,
  };
}

/**
 * A test bench with three push sources sharing one key:
 * merchant (SELF_DECLARED), wallet (PROVIDER_VERIFIED) and registry (EXTERNAL_VERIFIED).
 */
export function createBench(extraSources: readonly CategorySource[] = []) {
  const key = newKey();
  const sourceList = [
    source("merchant", { key, kind: "MERCHANT", trustLevel: "SELF_DECLARED", allowedLicenses: [] }),
    source("wallet", { key }),
    source("registry", { key, kind: "BUSINESS_REGISTRY", trustLevel: "EXTERNAL_VERIFIED" }),
    source("health", { key, kind: "HEALTH_AUTHORITY", trustLevel: "EXTERNAL_VERIFIED" }),
    ...extraSources,
  ];
  const sources = new StaticCategorySourceRegistry(sourceList);
  const trustLog = new InMemoryTrustLog();
  const mappings = loadCategoryMappings();
  const subjectRef = createSubjectRefFn("test-hmac-key-test-hmac-key-test-hmac-key");
  let ids = 0;

  const deps = {
    sources,
    trustLog,
    verifySignature: verifyClaimSignature,
    subjectRef,
    now: () => NOW,
    newId: () => `entry-${++ids}`,
  };

  function encode(submission: Record<string, unknown>): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({ schemaVersion: "1", ...submission }));
  }

  async function submit(
    submission: Record<string, unknown>,
    options: { signWith?: TestKey; signature?: string | null } = {},
  ): Promise<IngestionResult> {
    const body = encode(submission);
    const signature =
      options.signature === null
        ? undefined
        : options.signature ?? sign(null, body, (options.signWith ?? key).privateKey).toString("base64url");
    return ingestCategoryClaim({ body, transport: "PUSH", ...(signature ? { signature } : {}) }, deps);
  }

  async function submitOk(submission: Record<string, unknown>): Promise<string> {
    const result = await submit(submission);
    if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
    return result.entryId;
  }

  return { key, sources, sourceList, trustLog, mappings, subjectRef, deps, encode, submit, submitOk };
}

export function merchantSubject(paypalMerchantId: string) {
  return { kind: "PAYPAL_MERCHANT", paypalMerchantId };
}

export function ciiuClaim(
  sourceId: string,
  submissionId: string,
  subject: Record<string, unknown>,
  codes: { code: string; role?: string }[],
  extra: Record<string, unknown> = {},
) {
  return {
    sourceId,
    submissionId,
    type: "CATEGORY_CLAIM",
    subject,
    codes: codes.map((code) => ({ system: "CIIU_REV4_AC", ...code })),
    observedAt: "2026-10-16T12:00:00Z",
    ...extra,
  };
}
