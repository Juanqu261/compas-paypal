import { createHash, type JsonWebKey, randomUUID } from "node:crypto";
import type {
  CategorySource,
  CategorySourceTransport,
  ExternalCategoryCode,
  MerchantSubject,
  TrustLogEntry,
} from "../domain/merchant-category.ts";
import { normalizeCategoryCode, normalizeNit } from "../domain/merchant-identifiers.ts";
import type { CategorySourceRegistry } from "../ports/category-source-registry.ts";
import type { MerchantTrustLog } from "../ports/merchant-trust-log.ts";
import {
  parseCategoryClaimSubmission,
  type ParsedSubmission,
  type RawSubject,
} from "./category-claim-submission.ts";

export const INGESTION_ERROR_CODES = [
  "INVALID_SUBMISSION",
  "UNKNOWN_SOURCE",
  "BAD_SIGNATURE",
  "EVIDENCE_NOT_ALLOWED",
  "INVALID_CODE",
  "INVALID_IDENTIFIER",
  "SUBMISSION_ID_REUSED",
  "REVOCATION_TARGET_NOT_FOUND",
] as const;

export type IngestionErrorCode = (typeof INGESTION_ERROR_CODES)[number];

export type IngestionResult =
  | { ok: true; entryId: string; duplicate: boolean }
  | { ok: false; code: IngestionErrorCode; message: string };

export type IngestCategoryClaimInput = {
  /** The exact submission bytes. The signature and the digest cover these. */
  body: Uint8Array;
  /** Ed25519 signature over `body`, base64url. Required for PUSH sources. */
  signature?: string;
  transport: CategorySourceTransport;
};

export type IngestCategoryClaimDeps = {
  sources: CategorySourceRegistry;
  trustLog: MerchantTrustLog;
  verifySignature: (body: Uint8Array, signature: string, publicKeyJwk: JsonWebKey) => boolean;
  /** HMAC of a normalized NIT. The raw NIT is never stored. */
  subjectRef: (normalizedNit: string) => string;
  now?: () => Date;
  newId?: () => string;
};

function reject(code: IngestionErrorCode, message: string): IngestionResult {
  return { ok: false, code, message };
}

function evidenceAllowed(source: CategorySource, submission: ParsedSubmission): string | undefined {
  if (submission.type === "REVOCATION") return undefined;
  if (!source.allowedEntryTypes.includes(submission.type)) {
    return `${source.id} may not submit ${submission.type}`;
  }
  if (submission.type === "CATEGORY_CLAIM") {
    for (const code of submission.codes) {
      if (!source.allowedSystems.includes(code.system)) {
        return `${source.id} may not assert ${code.system} codes`;
      }
    }
    if (submission.declaredCategories.length > 0 && source.kind !== "MERCHANT") {
      return "only a MERCHANT source may self-declare categories";
    }
    if (source.kind === "MERCHANT" && submission.subject.kind !== "WALLET_ADDRESS") {
      return "a MERCHANT source may only make claims about a wallet address";
    }
  }
  if (submission.type === "LICENSE_CLAIM" && !source.allowedLicenses.includes(submission.licenseType)) {
    return `${source.id} may not assert ${submission.licenseType}`;
  }
  return undefined;
}

class IdentifierError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toSubject(raw: RawSubject, subjectRef: (nit: string) => string): MerchantSubject {
  if (raw.kind === "WALLET_ADDRESS") return raw;
  return { kind: "TAX_ID", subjectRef: taxIdRef(raw.taxId, subjectRef) };
}

function taxIdRef(taxId: string, subjectRef: (nit: string) => string): string {
  const nit = normalizeNit(taxId);
  if (!nit) throw new IdentifierError("INVALID_IDENTIFIER", "taxId is not a valid NIT");
  return subjectRef(nit);
}

function normalizeCodes(codes: ParsedSubmission & { type: "CATEGORY_CLAIM" }): ExternalCategoryCode[] {
  return codes.codes.map((raw) => {
    const code = normalizeCategoryCode(raw.system, raw.code);
    if (!code) throw new IdentifierError("INVALID_CODE", `${raw.code} is not a well-formed ${raw.system} code`);
    return { system: raw.system, code, ...(raw.role ? { role: raw.role } : {}) };
  });
}

/**
 * The only way evidence enters the trust log. The HTTP route and every pull
 * adapter call it. Order: shape, source, signature, allowed evidence,
 * normalization, append.
 */
export async function ingestCategoryClaim(
  input: IngestCategoryClaimInput,
  deps: IngestCategoryClaimDeps,
): Promise<IngestionResult> {
  const parsed = parseCategoryClaimSubmission(input.body);
  if (!parsed.ok) return reject("INVALID_SUBMISSION", parsed.message);
  const submission = parsed.submission;

  const source = await deps.sources.getById(submission.sourceId);
  if (!source || source.transport !== input.transport) {
    return reject("UNKNOWN_SOURCE", `${submission.sourceId} is not a registered ${input.transport} source`);
  }

  if (source.transport === "PUSH") {
    if (
      !input.signature ||
      !source.publicKeyJwk ||
      !deps.verifySignature(input.body, input.signature, source.publicKeyJwk)
    ) {
      return reject("BAD_SIGNATURE", "signature missing or invalid");
    }
  }

  const notAllowed = evidenceAllowed(source, submission);
  if (notAllowed) return reject("EVIDENCE_NOT_ALLOWED", notAllowed);

  const bodyDigest = createHash("sha256").update(input.body).digest("base64url");
  const existing = await deps.trustLog.findBySubmission(source.id, submission.submissionId);
  if (existing) {
    return existing.bodyDigest === bodyDigest
      ? { ok: true, entryId: existing.id, duplicate: true }
      : reject("SUBMISSION_ID_REUSED", "submissionId was already used with a different body");
  }

  let entry: TrustLogEntry;
  try {
    entry = await buildEntry(submission, {
      id: (deps.newId ?? randomUUID)(),
      sourceId: source.id,
      submissionId: submission.submissionId,
      bodyDigest,
      recordedAt: (deps.now?.() ?? new Date()).toISOString(),
    }, deps);
  } catch (error) {
    if (error instanceof IdentifierError) return reject(error.code, error.message);
    throw error;
  }

  const appended = await deps.trustLog.append(entry);
  if (appended.duplicate && appended.entry.bodyDigest !== bodyDigest) {
    return reject("SUBMISSION_ID_REUSED", "submissionId was already used with a different body");
  }
  return { ok: true, entryId: appended.entry.id, duplicate: appended.duplicate };
}

type EntryBase = Pick<TrustLogEntry, "id" | "sourceId" | "submissionId" | "bodyDigest" | "recordedAt">;

async function buildEntry(
  submission: ParsedSubmission,
  base: EntryBase,
  deps: IngestCategoryClaimDeps,
): Promise<TrustLogEntry> {
  switch (submission.type) {
    case "CATEGORY_CLAIM":
      return {
        ...base,
        type: "CATEGORY_CLAIM",
        subject: toSubject(submission.subject, deps.subjectRef),
        codes: normalizeCodes(submission),
        declaredCategories: submission.declaredCategories,
        observedAt: submission.observedAt,
        ...(submission.validUntil ? { validUntil: submission.validUntil } : {}),
        ...(submission.evidenceRef ? { evidenceRef: submission.evidenceRef } : {}),
      };
    case "LICENSE_CLAIM":
      return {
        ...base,
        type: "LICENSE_CLAIM",
        subject: toSubject(submission.subject, deps.subjectRef),
        licenseType: submission.licenseType,
        licenseRef: submission.licenseRef,
        observedAt: submission.observedAt,
        ...(submission.validUntil ? { validUntil: submission.validUntil } : {}),
      };
    case "IDENTITY_BINDING":
      return {
        ...base,
        type: "IDENTITY_BINDING",
        walletAddressUrl: submission.walletAddressUrl,
        subject: { kind: "TAX_ID", subjectRef: taxIdRef(submission.taxId, deps.subjectRef) },
        observedAt: submission.observedAt,
        ...(submission.validUntil ? { validUntil: submission.validUntil } : {}),
      };
    case "REVOCATION": {
      // Looked up by this source's own submission id, so a source can only revoke its own entries.
      const target = await deps.trustLog.findBySubmission(base.sourceId, submission.revokesSubmissionId);
      if (!target || target.type === "REVOCATION") {
        throw new IdentifierError(
          "REVOCATION_TARGET_NOT_FOUND",
          `${base.sourceId} has no revocable submission ${submission.revokesSubmissionId}`,
        );
      }
      return { ...base, type: "REVOCATION", revokesEntryId: target.id, reason: submission.reason };
    }
    case "FLAG":
      return {
        ...base,
        type: "FLAG",
        walletAddressUrl: submission.walletAddressUrl,
        category: submission.category,
        note: submission.note,
      };
  }
}
