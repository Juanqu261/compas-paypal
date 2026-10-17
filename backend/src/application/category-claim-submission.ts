import {
  CATEGORY_CODE_ROLES,
  CATEGORY_CODE_SYSTEMS,
  type CategoryCodeRole,
  type CategoryCodeSystem,
  type CompasCategory,
  isCompasCategory,
  LICENSE_TYPES,
  type LicenseType,
} from "../domain/merchant-category.ts";
import { normalizeWalletAddressUrl } from "../domain/merchant-identifiers.ts";

/**
 * Parser for the push and pull submission shape in
 * contracts/merchant-categories/category-claim-submission.schema.json.
 * It checks shape only. Codes and tax ids are normalized after the source
 * and its signature are checked.
 */

export const SUBMISSION_SCHEMA_VERSION = "1";

const ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;
const MAX_REF_LENGTH = 128;
const MAX_TEXT_LENGTH = 280;
/** One main CIIU activity plus up to three secondary ones. */
const MAX_CODES = 4;

export type RawSubject =
  | { kind: "WALLET_ADDRESS"; walletAddressUrl: string }
  | { kind: "TAX_ID"; taxId: string };

export type RawCode = { system: CategoryCodeSystem; code: string; role?: CategoryCodeRole };

type Base = { sourceId: string; submissionId: string };

export type ParsedSubmission =
  | (Base & {
      type: "CATEGORY_CLAIM";
      subject: RawSubject;
      codes: readonly RawCode[];
      declaredCategories: readonly CompasCategory[];
      observedAt: string;
      validUntil?: string;
      evidenceRef?: string;
    })
  | (Base & {
      type: "LICENSE_CLAIM";
      subject: RawSubject;
      licenseType: LicenseType;
      licenseRef: string;
      observedAt: string;
      validUntil?: string;
    })
  | (Base & {
      type: "IDENTITY_BINDING";
      walletAddressUrl: string;
      taxId: string;
      observedAt: string;
      validUntil?: string;
    })
  | (Base & { type: "REVOCATION"; revokesSubmissionId: string; reason: string })
  | (Base & { type: "FLAG"; walletAddressUrl: string; category: CompasCategory; note: string });

export type ParseResult =
  | { ok: true; submission: ParsedSubmission }
  | { ok: false; message: string };

class ShapeError extends Error {}

function fail(message: string): never {
  throw new ShapeError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
  if ("trustLevel" in value) {
    fail(`${where}: trustLevel is not accepted. The source registry assigns trust.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${where}: unexpected field ${key}`);
  }
}

function idField(value: unknown, where: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    fail(`${where} must match ${ID_PATTERN.source}`);
  }
  return value;
}

function textField(value: unknown, where: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    fail(`${where} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function optionalText(value: unknown, where: string, max: number): string | undefined {
  return value === undefined ? undefined : textField(value, where, max);
}

function timestamp(value: unknown, where: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(`${where} must be an ISO 8601 date-time`);
  }
  return new Date(value).toISOString();
}

function walletAddress(value: unknown, where: string): string {
  const normalized = typeof value === "string" ? normalizeWalletAddressUrl(value) : undefined;
  if (!normalized) fail(`${where} must be a wallet address URL`);
  return normalized;
}

function category(value: unknown, where: string): CompasCategory {
  if (!isCompasCategory(value)) fail(`${where} is not a COMPAS category`);
  return value;
}

function subject(value: unknown, where: string): RawSubject {
  if (!isRecord(value)) fail(`${where} must be an object`);
  if (value.kind === "WALLET_ADDRESS") {
    onlyKeys(value, ["kind", "walletAddressUrl"], where);
    return { kind: "WALLET_ADDRESS", walletAddressUrl: walletAddress(value.walletAddressUrl, `${where}.walletAddressUrl`) };
  }
  if (value.kind === "TAX_ID") {
    onlyKeys(value, ["kind", "taxId"], where);
    return { kind: "TAX_ID", taxId: textField(value.taxId, `${where}.taxId`, 32) };
  }
  fail(`${where}.kind must be WALLET_ADDRESS or TAX_ID`);
}

function codes(value: unknown, where: string): RawCode[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CODES) {
    fail(`${where} must be an array of at most ${MAX_CODES} codes`);
  }
  const parsed = value.map((item, index) => {
    const at = `${where}[${index}]`;
    if (!isRecord(item)) fail(`${at} must be an object`);
    onlyKeys(item, ["system", "code", "role"], at);
    if (!(CATEGORY_CODE_SYSTEMS as readonly unknown[]).includes(item.system)) {
      fail(`${at}.system must be one of ${CATEGORY_CODE_SYSTEMS.join(", ")}`);
    }
    if (item.role !== undefined && !(CATEGORY_CODE_ROLES as readonly unknown[]).includes(item.role)) {
      fail(`${at}.role must be PRIMARY or SECONDARY`);
    }
    return {
      system: item.system as CategoryCodeSystem,
      code: textField(item.code, `${at}.code`, 16),
      ...(item.role ? { role: item.role as CategoryCodeRole } : {}),
    };
  });
  if (parsed.filter((code) => code.role === "PRIMARY").length > 1) {
    fail(`${where} may hold at most one PRIMARY code`);
  }
  return parsed;
}

function declaredCategories(value: unknown, where: string): CompasCategory[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  return [...new Set(value.map((item, index) => category(item, `${where}[${index}]`)))];
}

function validity(observedAt: string, rawValidUntil: unknown): string | undefined {
  if (rawValidUntil === undefined) return undefined;
  const validUntil = timestamp(rawValidUntil, "validUntil");
  if (Date.parse(validUntil) <= Date.parse(observedAt)) fail("validUntil must be after observedAt");
  return validUntil;
}

function parseShape(value: unknown): ParsedSubmission {
  if (!isRecord(value)) fail("submission must be a JSON object");
  if (value.schemaVersion !== SUBMISSION_SCHEMA_VERSION) {
    fail(`schemaVersion must be "${SUBMISSION_SCHEMA_VERSION}"`);
  }
  const base = {
    sourceId: idField(value.sourceId, "sourceId"),
    submissionId: idField(value.submissionId, "submissionId"),
  };
  const common = ["schemaVersion", "sourceId", "submissionId", "type"];

  switch (value.type) {
    case "CATEGORY_CLAIM": {
      onlyKeys(value, [...common, "subject", "codes", "declaredCategories", "observedAt", "validUntil", "evidenceRef"], "submission");
      const observedAt = timestamp(value.observedAt, "observedAt");
      const parsedCodes = codes(value.codes, "codes");
      const declared = declaredCategories(value.declaredCategories, "declaredCategories");
      if (parsedCodes.length === 0 && declared.length === 0) {
        fail("a category claim needs codes or declaredCategories");
      }
      const validUntil = validity(observedAt, value.validUntil);
      const evidenceRef = optionalText(value.evidenceRef, "evidenceRef", MAX_REF_LENGTH);
      return {
        ...base,
        type: "CATEGORY_CLAIM",
        subject: subject(value.subject, "subject"),
        codes: parsedCodes,
        declaredCategories: declared,
        observedAt,
        ...(validUntil ? { validUntil } : {}),
        ...(evidenceRef ? { evidenceRef } : {}),
      };
    }
    case "LICENSE_CLAIM": {
      onlyKeys(value, [...common, "subject", "licenseType", "licenseRef", "observedAt", "validUntil"], "submission");
      if (!(LICENSE_TYPES as readonly unknown[]).includes(value.licenseType)) {
        fail(`licenseType must be one of ${LICENSE_TYPES.join(", ")}`);
      }
      const observedAt = timestamp(value.observedAt, "observedAt");
      const validUntil = validity(observedAt, value.validUntil);
      return {
        ...base,
        type: "LICENSE_CLAIM",
        subject: subject(value.subject, "subject"),
        licenseType: value.licenseType as LicenseType,
        licenseRef: textField(value.licenseRef, "licenseRef", MAX_REF_LENGTH),
        observedAt,
        ...(validUntil ? { validUntil } : {}),
      };
    }
    case "IDENTITY_BINDING": {
      onlyKeys(value, [...common, "walletAddressUrl", "taxId", "observedAt", "validUntil"], "submission");
      const observedAt = timestamp(value.observedAt, "observedAt");
      const validUntil = validity(observedAt, value.validUntil);
      return {
        ...base,
        type: "IDENTITY_BINDING",
        walletAddressUrl: walletAddress(value.walletAddressUrl, "walletAddressUrl"),
        taxId: textField(value.taxId, "taxId", 32),
        observedAt,
        ...(validUntil ? { validUntil } : {}),
      };
    }
    case "REVOCATION":
      onlyKeys(value, [...common, "revokesSubmissionId", "reason"], "submission");
      return {
        ...base,
        type: "REVOCATION",
        revokesSubmissionId: idField(value.revokesSubmissionId, "revokesSubmissionId"),
        reason: textField(value.reason, "reason", MAX_TEXT_LENGTH),
      };
    case "FLAG":
      onlyKeys(value, [...common, "walletAddressUrl", "category", "note"], "submission");
      return {
        ...base,
        type: "FLAG",
        walletAddressUrl: walletAddress(value.walletAddressUrl, "walletAddressUrl"),
        category: category(value.category, "category"),
        note: textField(value.note, "note", MAX_TEXT_LENGTH),
      };
    default:
      fail("type must be CATEGORY_CLAIM, LICENSE_CLAIM, IDENTITY_BINDING, REVOCATION or FLAG");
  }
}

export function parseCategoryClaimSubmission(body: Uint8Array): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return { ok: false, message: "body is not UTF-8 JSON" };
  }
  try {
    return { ok: true, submission: parseShape(json) };
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, message: error.message };
    throw error;
  }
}
