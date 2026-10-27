import type { CompasCategory } from "./merchant-category.ts";

/**
 * What the AI analyst found about a merchant. It works on merchant data only
 * (catalogs and Cámara certificates), never on errands, payers or purchases.
 *
 * Two kinds of output, with different standing (idea doc, section 1):
 * - A POINTER names checkable evidence ("SKU x is CUM y"). It counts only
 *   after a deterministic verifier re-reads it from the source, and then as
 *   that source's evidence.
 * - A JUDGMENT is something no source can check ("half the catalog is gift
 *   cards"). It can only become a FLAG on one declared category, which turns
 *   that category into REVIEW. It never adds support.
 */

export const POINTER_KINDS = ["CUM_MAPPING", "CAMARA_CERTIFICATE"] as const;
export type PointerKind = (typeof POINTER_KINDS)[number];

export const JUDGMENT_KINDS = [
  /** Too much of the catalog is outside the declared category. */
  "CATALOG_OFF_PURPOSE",
  /** The catalog imitates another shop or reads like something else than it declares. */
  "LOOKALIKE_SIGNALS",
] as const;
export type JudgmentKind = (typeof JUDGMENT_KINDS)[number];

/** How the model classified one SKU. A judgment, so it can only feed a flag. */
export const ITEM_CLASSES = ["MEDICINE", "NOT_MEDICINE", "UNSURE"] as const;
export type ItemClass = (typeof ITEM_CLASSES)[number];

/** OPEN: the flag stands. RESPONDED: the merchant answered. WITHDRAWN: a human reviewer revoked the flag. */
export const JUDGMENT_STATUSES = ["OPEN", "RESPONDED", "WITHDRAWN"] as const;
export type JudgmentStatus = (typeof JUDGMENT_STATUSES)[number];

type FindingBase = {
  id: string;
  runId: string;
  paypalMerchantId: string;
  recordedAt: string;
};

export type CumMappingPointer = FindingBase & {
  kind: "POINTER";
  pointer: "CUM_MAPPING";
  skuId: string;
  cum: string;
  /** The verifier's result. Only VERIFIED counts. */
  outcome: "VERIFIED" | "REJECTED";
};

export type CamaraCertificatePointer = FindingBase & {
  kind: "POINTER";
  pointer: "CAMARA_CERTIFICATE";
  verificationCode: string;
  /**
   * VERIFIED_BOUND: the Cámara has the certificate, its NIT matches, and its
   * email is the merchant's verified PayPal email. VERIFIED_UNBOUND: the same
   * without the email match. REJECTED: the Cámara doesn't confirm it.
   */
  outcome: "VERIFIED_BOUND" | "VERIFIED_UNBOUND" | "REJECTED";
  /** Why, in one line. Never a NIT or an email. */
  detail: string;
};

export type Judgment = FindingBase & {
  kind: "JUDGMENT";
  judgment: JudgmentKind;
  category: CompasCategory;
  citedSkuIds: readonly string[];
  note: string;
  /** The FLAG this judgment put in the trust log, and its submission id, which a withdrawal revokes. */
  flagEntryId: string;
  flagSubmissionId: string;
  status: JudgmentStatus;
  /** The merchant's answer, shown to the reviewer. Untrusted text. */
  merchantResponse?: { text: string; respondedAt: string };
  withdrawal?: { reason: string; withdrawnAt: string; revocationEntryId: string };
};

export type AnalystFinding = CumMappingPointer | CamaraCertificatePointer | Judgment;
