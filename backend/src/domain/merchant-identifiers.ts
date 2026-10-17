import type { CategoryCodeSystem } from "./merchant-category.ts";

/** CIIU Rev. 4 A.C. classes are four digits. Leading zeros matter ("0111"). */
const CIIU_CLASS = /^\d{4}$/;

/**
 * Format check only. A well-formed code with no mapping is accepted and
 * recorded as unmapped evidence. It never becomes a category.
 */
export function normalizeCategoryCode(
  system: CategoryCodeSystem,
  raw: string,
): string | undefined {
  const code = raw.trim();
  switch (system) {
    case "CIIU_REV4_AC":
      return CIIU_CLASS.test(code) ? code : undefined;
  }
}

/** DIAN prime weights, applied from the rightmost digit of the NIT. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(base: string): number {
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[base.length - 1 - i]) * NIT_WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

/**
 * Accepts "900.123.456-7", "900123456-7" or "900123456" and returns the base
 * NIT without the check digit. A check digit, when given, must be correct.
 */
export function normalizeNit(raw: string): string | undefined {
  const match = /^([\d.\s]+)(?:-(\d))?$/.exec(raw.trim());
  if (!match) return undefined;
  const base = match[1].replace(/[.\s]/g, "");
  if (!/^\d{5,15}$/.test(base)) return undefined;
  if (match[2] !== undefined && Number(match[2]) !== nitCheckDigit(base)) {
    return undefined;
  }
  return base;
}

/**
 * Same form the Open Payments adapter uses: a `$pointer` becomes https,
 * and the trailing slash is dropped. Query strings, fragments and
 * credentials are refused, so one wallet has one spelling.
 */
export function normalizeWalletAddressUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  const candidate = trimmed.startsWith("$") ? `https://${trimmed.slice(1)}` : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
  if (parsed.search || parsed.hash || parsed.username || parsed.password) return undefined;
  return parsed.toString().replace(/\/$/, "");
}
