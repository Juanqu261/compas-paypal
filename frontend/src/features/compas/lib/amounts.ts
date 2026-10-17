/**
 * Turns what a person types into minor units, and back. Integer strings only:
 * no floating point ever touches an amount. This is input handling, not a
 * rate or a quote.
 */

export type AmountParse =
  | { ok: true; minorUnits: string }
  | { ok: false; reason: "EMPTY" | "NOT_A_NUMBER" | "TOO_MANY_DECIMALS" | "NOT_POSITIVE" };

/**
 * Reads "40", "40,50", "40.50", "1.250", "1.250,75" for the given scale.
 * - With a comma, the comma is the decimal mark and dots group thousands (Colombian style).
 * - With one dot and no comma, the dot is decimal when 1 or 2 digits follow it, a group when 3 do.
 * - Several dots group thousands.
 */
export function parseAmountInput(raw: string, assetScale: number): AmountParse {
  const text = raw.trim().replace(/\s/g, "");
  if (!text) return { ok: false, reason: "EMPTY" };
  if (!/^[0-9.,]+$/.test(text)) return { ok: false, reason: "NOT_A_NUMBER" };

  let whole: string;
  let fraction = "";
  const commas = text.split(",").length - 1;
  const dots = text.split(".").length - 1;
  if (commas > 1) return { ok: false, reason: "NOT_A_NUMBER" };
  if (commas === 1) {
    [whole, fraction] = text.split(",");
    whole = whole.replace(/\./g, "");
  } else if (dots === 1 && /\.\d{1,2}$/.test(text)) {
    [whole, fraction] = text.split(".");
  } else {
    whole = text.replace(/\./g, "");
  }

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (whole === "" && fraction === "")) {
    return { ok: false, reason: "NOT_A_NUMBER" };
  }
  if (fraction.length > assetScale) return { ok: false, reason: "TOO_MANY_DECIMALS" };

  const digits = `${whole}${fraction.padEnd(assetScale, "0")}`.replace(/^0+(?=\d)/, "");
  if (/^0*$/.test(digits)) return { ok: false, reason: "NOT_POSITIVE" };
  return { ok: true, minorUnits: digits };
}

/** True when `a` is greater than `b`. Both are non-negative minor-unit strings. */
export function minorGreaterThan(a: string, b: string): boolean {
  const left = a.replace(/^0+(?=\d)/, "");
  const right = b.replace(/^0+(?=\d)/, "");
  if (left.length !== right.length) return left.length > right.length;
  return left > right;
}

/** The share of `part` in `whole`, from 0 to 1, for a progress line. Display only. */
export function shareOf(part: string, whole: string): number {
  if (!/^\d+$/.test(part) || !/^\d+$/.test(whole) || /^0+$/.test(whole)) return 0;
  if (minorGreaterThan(part, whole)) return 1;
  // Twelve significant digits is plenty for a line on a screen.
  const cut = Math.max(whole.length - 12, 0);
  const p = Number(part.length > cut ? part.slice(0, part.length - cut) : "0");
  const w = Number(whole.slice(0, whole.length - cut));
  return Math.min(Math.max(p / w, 0), 1);
}
