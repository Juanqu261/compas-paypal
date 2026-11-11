import { createHash } from "node:crypto";
import type { MoneyAmount } from "./money.ts";
import { compareMoney, parseMinorUnits, sameMoneyAsset } from "./money-math.ts";

/**
 * Proof of purpose: whether a structured receipt agrees with the purchase
 * COMPAS already authorized. VERIFIED_DOCUMENT_MATCH means the document's
 * fields match that purchase. It is not proof the medicine was handed over.
 *
 * The verifier ignores instructions inside the document. Unknown fields stay
 * unknown. A model may extract candidates; this function decides.
 */

export const VERIFICATION_STATUSES = [
  "NOT_SUBMITTED",
  "PENDING_VERIFICATION",
  "VERIFIED_DOCUMENT_MATCH",
  "MISMATCH",
  "REVIEW_REQUIRED",
  "REJECTED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EVIDENCE_TYPES = ["STRUCTURED_RECEIPT", "RECEIPT_TEXT"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const VERIFIER_VERSION = "fulfillment-verifier.1";

/** Exact minor units. A one-cent difference is a mismatch. */
export const PRICE_TOLERANCE_MINOR_UNITS = 0n;

export type ClaimedItem = {
  description?: string;
  cum?: string;
  quantity?: number;
  unitPrice?: MoneyAmount;
  lineTotal?: MoneyAmount;
};

export type AuthorizedPurchaseLine = {
  cum?: string;
  quantity: number;
  lineTotal: MoneyAmount;
};

export type FulfillmentVerification = {
  status: VerificationStatus;
  reasonCodes: readonly string[];
  matchedItems: readonly { cum?: string; quantity: number; lineTotal: MoneyAmount }[];
  /** Document agreement only. Physical delivery is a separate fact COMPAS does not claim. */
  provesPhysicalDelivery: false;
  verifierVersion: typeof VERIFIER_VERSION;
};

const CUM = /^\d{5,12}-\d{1,4}$/;

export function canonicalEvidenceBody(body: {
  merchantId?: string;
  items: readonly ClaimedItem[];
  total?: MoneyAmount;
}): string {
  return JSON.stringify({
    merchantId: body.merchantId ?? null,
    total: body.total ?? null,
    items: body.items.map((item) => ({
      description: item.description ?? null,
      cum: item.cum ?? null,
      quantity: item.quantity ?? null,
      unitPrice: item.unitPrice ?? null,
      lineTotal: item.lineTotal ?? null,
    })),
  });
}

export function documentHash(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

export function verifyFulfillment(input: {
  merchantId: string;
  lines: readonly AuthorizedPurchaseLine[];
  total: MoneyAmount;
  claimedMerchantId?: string;
  claimedItems: readonly ClaimedItem[];
  claimedTotal?: MoneyAmount;
  /** True when extraction could not read a required field. Contradictions still mismatch. */
  extractionUncertain: boolean;
}): FulfillmentVerification {
  const reasons: string[] = [];
  const authorized = input.lines.filter((line) => line.cum);
  if (authorized.length === 0) {
    return done("REVIEW_REQUIRED", ["UNKNOWN_PRODUCT"]);
  }
  if (input.claimedItems.length === 0) {
    return done("REVIEW_REQUIRED", ["MISSING_FIELDS"]);
  }
  if (input.claimedMerchantId && input.claimedMerchantId !== input.merchantId) {
    reasons.push("MERCHANT_MISMATCH");
  }
  if (!input.claimedMerchantId) reasons.push("MISSING_MERCHANT");

  const matched: { cum?: string; quantity: number; lineTotal: MoneyAmount }[] = [];
  for (const item of input.claimedItems) {
    if (!item.cum || !item.quantity || !item.lineTotal || !CUM.test(item.cum)) {
      reasons.push("MISSING_FIELDS");
      continue;
    }
    if (!parseMinorUnits(item.lineTotal)) {
      reasons.push("MALFORMED_AMOUNT");
      continue;
    }
    const line = authorized.find((candidate) => candidate.cum === item.cum);
    if (!line) {
      reasons.push("CUM_MISMATCH");
      continue;
    }
    if (item.quantity !== line.quantity) reasons.push("QUANTITY_MISMATCH");
    if (!sameMoneyAsset(item.lineTotal, line.lineTotal) || compareMoney(item.lineTotal, line.lineTotal) !== 0) {
      reasons.push("AMOUNT_MISMATCH");
    }
    if (item.quantity === line.quantity && compareMoney(item.lineTotal, line.lineTotal) === 0) {
      matched.push({ cum: item.cum, quantity: item.quantity, lineTotal: item.lineTotal });
    }
  }

  if (input.claimedTotal && compareMoney(input.claimedTotal, input.total) !== 0) reasons.push("AMOUNT_MISMATCH");
  if (!input.claimedTotal) reasons.push("MISSING_TOTAL");

  const unique = [...new Set(reasons)];
  const hard = unique.some((code) =>
    ["MERCHANT_MISMATCH", "CUM_MISMATCH", "QUANTITY_MISMATCH", "AMOUNT_MISMATCH", "MALFORMED_AMOUNT"].includes(code),
  );
  if (hard) return done("MISMATCH", unique, matched);
  if (unique.length > 0 || input.extractionUncertain || matched.length !== authorized.length) {
    return done("REVIEW_REQUIRED", unique.length > 0 ? unique : ["UNCERTAIN_EXTRACTION"], matched);
  }
  return done("VERIFIED_DOCUMENT_MATCH", [], matched);
}

function done(
  status: VerificationStatus,
  reasonCodes: string[],
  matchedItems: FulfillmentVerification["matchedItems"] = [],
): FulfillmentVerification {
  return {
    status,
    reasonCodes,
    matchedItems,
    provesPhysicalDelivery: false,
    verifierVersion: VERIFIER_VERSION,
  };
}

export type ParsedReceipt =
  | { ok: true; merchantId?: string; items: ClaimedItem[]; total?: MoneyAmount; uncertain: boolean }
  | { ok: false; code: "MALFORMED" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function moneyField(value: unknown): MoneyAmount | undefined {
  if (!isRecord(value)) return undefined;
  const amount = { value: value.value, assetCode: value.assetCode, assetScale: value.assetScale } as MoneyAmount;
  return parseMinorUnits(amount) !== undefined ? amount : undefined;
}

/** Accepts only known fields. Missing values stay missing. Extra fields are dropped. */
export function parseStructuredReceipt(input: unknown): ParsedReceipt {
  if (!isRecord(input)) return { ok: false, code: "MALFORMED" };
  const itemsRaw = input.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length > 20) return { ok: false, code: "MALFORMED" };
  const items: ClaimedItem[] = [];
  for (const raw of itemsRaw) {
    if (!isRecord(raw)) return { ok: false, code: "MALFORMED" };
    const item: ClaimedItem = {};
    if (raw.description !== undefined) {
      if (typeof raw.description !== "string" || raw.description.length > 200) return { ok: false, code: "MALFORMED" };
      item.description = raw.description;
    }
    if (raw.cum !== undefined) {
      if (typeof raw.cum !== "string") return { ok: false, code: "MALFORMED" };
      item.cum = raw.cum;
    }
    if (raw.quantity !== undefined) {
      if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 100) {
        return { ok: false, code: "MALFORMED" };
      }
      item.quantity = raw.quantity;
    }
    if (raw.unitPrice !== undefined) {
      const unitPrice = moneyField(raw.unitPrice);
      if (!unitPrice) return { ok: false, code: "MALFORMED" };
      item.unitPrice = unitPrice;
    }
    if (raw.lineTotal !== undefined) {
      const lineTotal = moneyField(raw.lineTotal);
      if (!lineTotal) return { ok: false, code: "MALFORMED" };
      item.lineTotal = lineTotal;
    }
    items.push(item);
  }
  let merchantId: string | undefined;
  if (input.merchantId !== undefined) {
    if (typeof input.merchantId !== "string" || !/^[a-z0-9-]{1,64}$/.test(input.merchantId)) return { ok: false, code: "MALFORMED" };
    merchantId = input.merchantId;
  }
  let total: MoneyAmount | undefined;
  if (input.total !== undefined) {
    total = moneyField(input.total);
    if (!total) return { ok: false, code: "MALFORMED" };
  }
  return { ok: true, ...(merchantId ? { merchantId } : {}), items, ...(total ? { total } : {}), uncertain: false };
}

const INSTRUCTION = /\b(ignore previous|system prompt|you are now|approve this|call the refund|reveal your)\b/i;

/**
 * Reads labeled lines only: merchant, cum, qty, total. Anything else,
 * including an instruction, is ignored and does not fill a missing field.
 */
export function extractReceiptText(text: string): ParsedReceipt {
  if (typeof text !== "string" || text.length === 0 || text.length > 4000) return { ok: false, code: "MALFORMED" };
  let merchantId: string | undefined;
  let cum: string | undefined;
  let quantity: number | undefined;
  let total: MoneyAmount | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (INSTRUCTION.test(trimmed)) continue;
    const merchant = /^merchant:\s*([a-z0-9-]{1,64})\s*$/i.exec(trimmed);
    if (merchant && !merchantId) merchantId = merchant[1];
    const cumLine = /^cum:\s*(\d{5,12}-\d{1,4})\s*$/i.exec(trimmed);
    if (cumLine && !cum) cum = cumLine[1];
    const qty = /^qty:\s*(\d{1,3})\s*$/i.exec(trimmed);
    if (qty && quantity === undefined) quantity = Number(qty[1]);
    const amount = /^total:\s*(\d{1,8})\.(\d{2})\s+USD\s*$/i.exec(trimmed);
    if (amount && !total) total = { value: `${amount[1]}${amount[2]}`.replace(/^0+(?=\d)/, ""), assetCode: "USD", assetScale: 2 };
  }
  const item: ClaimedItem = {};
  if (cum) item.cum = cum;
  if (quantity) item.quantity = quantity;
  if (total) item.lineTotal = total;
  const uncertain = !merchantId || !cum || !quantity || !total;
  return {
    ok: true,
    ...(merchantId ? { merchantId } : {}),
    items: Object.keys(item).length > 0 ? [item] : [],
    ...(total ? { total } : {}),
    uncertain,
  };
}

/** A stored body whose hash no longer matches is not shown as verified. */
export function evidenceViewStatus(stored: VerificationStatus, storedHash: string, recomputedHash: string): VerificationStatus {
  if (storedHash !== recomputedHash) return "REVIEW_REQUIRED";
  return stored;
}
