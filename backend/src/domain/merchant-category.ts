import type { JsonWebKey } from "node:crypto";
import type { MerchantTrustLevel } from "./merchant.ts";

/**
 * External code systems COMPAS can receive.
 */
export const CATEGORY_CODE_SYSTEMS = ["CIIU_REV4_AC"] as const;
export type CategoryCodeSystem = (typeof CATEGORY_CODE_SYSTEMS)[number];
export const CATEGORY_CODE_ROLES = ["PRIMARY", "SECONDARY"] as const;
export type CategoryCodeRole = (typeof CATEGORY_CODE_ROLES)[number];

export type ExternalCategoryCode = {
  system: CategoryCodeSystem;
  /** Normalized, for example "4773". */
  code: string;
  role?: CategoryCodeRole;
};

/** Sector licenses that prove a purpose more directly than a CIIU code. */
export const LICENSE_TYPES = ["CO_PHARMACY_ESTABLISHMENT"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export const COMPAS_CATEGORIES = [
  "MEDICATION",
  "FOOD",
  "PERSONAL_CARE",
  "ALCOHOL",
  "TOBACCO",
] as const;
export type CompasCategory = (typeof COMPAS_CATEGORIES)[number];

export const CATEGORY_SOURCE_KINDS = [
  "MERCHANT",
  "WALLET_PROVIDER",
  "BUSINESS_REGISTRY",
  "HEALTH_AUTHORITY",
  "PROGRAM_OPERATOR",
  /** COMPAS's AI analyst. It may only flag: a judgment can lower confidence, never raise it. */
  "COMPAS_ANALYST",
] as const;
export type CategorySourceKind = (typeof CATEGORY_SOURCE_KINDS)[number];

/** Push sources sign each submission. Pull sources are in-process adapters. */
export const CATEGORY_SOURCE_TRANSPORTS = ["PUSH", "PULL"] as const;
export type CategorySourceTransport = (typeof CATEGORY_SOURCE_TRANSPORTS)[number];

export const TRUST_LOG_ENTRY_TYPES = [
  "CATEGORY_CLAIM",
  "LICENSE_CLAIM",
  "IDENTITY_BINDING",
  "REVOCATION",
  "FLAG",
] as const;
export type TrustLogEntryType = (typeof TRUST_LOG_ENTRY_TYPES)[number];

/**
 * A registered evidence source. The trust level is assigned here,
 * never by a submission.
 */
export type CategorySource = {
  id: string;
  kind: CategorySourceKind;
  trustLevel: MerchantTrustLevel;
  transport: CategorySourceTransport;
  /** Entry types this source may submit. A source may always revoke its own entries. */
  allowedEntryTypes: readonly Exclude<TrustLogEntryType, "REVOCATION">[];
  allowedSystems: readonly CategoryCodeSystem[];
  allowedLicenses: readonly LicenseType[];
  /** Ed25519 public key. Required for PUSH sources. */
  publicKeyJwk?: JsonWebKey;
  /** True for every demo source. */
  simulated: boolean;
};

export type MerchantSubject =
  | { kind: "PAYPAL_MERCHANT"; paypalMerchantId: string }
  /** HMAC of the NIT. Never the raw NIT, which is a cédula for a sole proprietor. */
  | { kind: "TAX_ID"; subjectRef: string };

type TrustLogEntryBase = {
  id: string;
  sourceId: string;
  submissionId: string;
  /** SHA-256 of the exact submission bytes, base64url. */
  bodyDigest: string;
  recordedAt: string;
};

export type CategoryClaimEntry = TrustLogEntryBase & {
  type: "CATEGORY_CLAIM";
  subject: MerchantSubject;
  codes: readonly ExternalCategoryCode[];
  /** MERCHANT sources only. */
  declaredCategories: readonly CompasCategory[];
  observedAt: string;
  validUntil?: string;
  evidenceRef?: string;
};

export type LicenseClaimEntry = TrustLogEntryBase & {
  type: "LICENSE_CLAIM";
  subject: MerchantSubject;
  licenseType: LicenseType;
  licenseRef: string;
  observedAt: string;
  validUntil?: string;
};

export type IdentityBindingEntry = TrustLogEntryBase & {
  type: "IDENTITY_BINDING";
  paypalMerchantId: string;
  subject: Extract<MerchantSubject, { kind: "TAX_ID" }>;
  observedAt: string;
  validUntil?: string;
};

export type RevocationEntry = TrustLogEntryBase & {
  type: "REVOCATION";
  revokesEntryId: string;
  reason: string;
};

export type FlagEntry = TrustLogEntryBase & {
  type: "FLAG";
  paypalMerchantId: string;
  category: CompasCategory;
  note: string;
};

/** One append-only trust-log entry. */
export type TrustLogEntry =
  | CategoryClaimEntry
  | LicenseClaimEntry
  | IdentityBindingEntry
  | RevocationEntry
  | FlagEntry;

export type ResolvedCategory = {
  category: CompasCategory;
  /** Strongest live, bound evidence for this category. */
  trustLevel: MerchantTrustLevel;
  supportingEntryIds: readonly string[];
  sourceIds: readonly string[];
};

export type CategoryConflict = {
  categories: readonly CompasCategory[];
  entryIds: readonly string[];
};

export type CategoryFlag = {
  entryId: string;
  category: CompasCategory;
};

/**
 * How well independent evidence backs a category the merchant declared.
 * After CONTRADICTED, ordered weakest to strongest.
 *
 * - CONTRADICTED: the strongest independent evidence places the shop elsewhere.
 * - UNCORROBORATED: only the merchant says so, for example a tienda de barrio.
 * - REGISTRY_UNBOUND: a registry (or another verified source) agrees, but it is
 *   joined to the PayPal account only through a NIT the merchant typed itself.
 * - PROVIDER_VERIFIED / EXTERNAL_VERIFIED: an independent source agrees.
 */
export const CORROBORATION_TIERS = [
  "CONTRADICTED",
  "UNCORROBORATED",
  "REGISTRY_UNBOUND",
  "PROVIDER_VERIFIED",
  "EXTERNAL_VERIFIED",
] as const;
export type CorroborationTier = (typeof CORROBORATION_TIERS)[number];

/** A category the merchant declared at registration, and how independent evidence bears on it. */
export type DeclaredCategory = {
  category: CompasCategory;
  corroboration: CorroborationTier;
  declarationEntryIds: readonly string[];
  /** Independent claims that include the category. */
  supportingEntryIds: readonly string[];
  /** Independent claims whose main activity leaves it out. */
  contradictingEntryIds: readonly string[];
};

export type MerchantCategoryResolution = {
  paypalMerchantId: string;
  categories: readonly ResolvedCategory[];
  /**
   * The merchant's own declarations. Only these can make a shop eligible.
   * Evidence for a category the merchant never declared does not.
   */
  declarations: readonly DeclaredCategory[];
  conflicts: readonly CategoryConflict[];
  flags: readonly CategoryFlag[];
  /** Evidence with no mapping, for example "CIIU_REV4_AC:9609". Not a category. */
  unmappedEvidence: readonly string[];
  mappingVersion: string;
  resolvedAt: string;
};

export function isCompasCategory(value: unknown): value is CompasCategory {
  return (COMPAS_CATEGORIES as readonly unknown[]).includes(value);
}
