import type { MoneyAmount } from "./money.ts";

/**
 * Integer minor-unit arithmetic. Financial checks use this instead of
 * JavaScript numbers, which cannot represent every cent.
 */

const MINOR = /^(0|[1-9]\d{0,30})$/;
const ASSET = /^[A-Z0-9]{1,12}$/;

export function parseMinorUnits(amount: MoneyAmount): bigint | undefined {
  if (!amount || typeof amount.value !== "string" || !MINOR.test(amount.value)) return undefined;
  if (!Number.isInteger(amount.assetScale) || amount.assetScale < 0 || amount.assetScale > 9) return undefined;
  if (typeof amount.assetCode !== "string" || !ASSET.test(amount.assetCode)) return undefined;
  return BigInt(amount.value);
}

export function sameMoneyAsset(a: MoneyAmount, b: MoneyAmount): boolean {
  return a.assetCode === b.assetCode && a.assetScale === b.assetScale;
}

export function moneyFromMinor(value: bigint, sample: Pick<MoneyAmount, "assetCode" | "assetScale">): MoneyAmount {
  return { value: value.toString(), assetCode: sample.assetCode, assetScale: sample.assetScale };
}

export function zeroMoney(sample: Pick<MoneyAmount, "assetCode" | "assetScale">): MoneyAmount {
  return moneyFromMinor(0n, sample);
}

export type MoneyMathResult = { ok: true; amount: MoneyAmount } | { ok: false; code: "INVALID_AMOUNT" | "CURRENCY_MISMATCH" };

export function addMoney(a: MoneyAmount, b: MoneyAmount): MoneyMathResult {
  const left = parseMinorUnits(a);
  const right = parseMinorUnits(b);
  if (left === undefined || right === undefined) return { ok: false, code: "INVALID_AMOUNT" };
  if (!sameMoneyAsset(a, b)) return { ok: false, code: "CURRENCY_MISMATCH" };
  return { ok: true, amount: moneyFromMinor(left + right, a) };
}

export function subtractMoney(a: MoneyAmount, b: MoneyAmount): MoneyMathResult | { ok: false; code: "NEGATIVE" } {
  const left = parseMinorUnits(a);
  const right = parseMinorUnits(b);
  if (left === undefined || right === undefined) return { ok: false, code: "INVALID_AMOUNT" };
  if (!sameMoneyAsset(a, b)) return { ok: false, code: "CURRENCY_MISMATCH" };
  if (left < right) return { ok: false, code: "NEGATIVE" };
  return { ok: true, amount: moneyFromMinor(left - right, a) };
}

/** -1 when a < b, 0 when equal, 1 when a > b. Undefined when they cannot be compared. */
export function compareMoney(a: MoneyAmount, b: MoneyAmount): -1 | 0 | 1 | undefined {
  const left = parseMinorUnits(a);
  const right = parseMinorUnits(b);
  if (left === undefined || right === undefined || !sameMoneyAsset(a, b)) return undefined;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** `quantity` must be a whole number from 0 to 1000. There is no rounding. */
export function multiplyMoney(unit: MoneyAmount, quantity: number): MoneyMathResult {
  const minor = parseMinorUnits(unit);
  if (minor === undefined || !Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
    return { ok: false, code: "INVALID_AMOUNT" };
  }
  return { ok: true, amount: moneyFromMinor(minor * BigInt(quantity), unit) };
}

export function minMoney(a: MoneyAmount, b: MoneyAmount): MoneyMathResult {
  const order = compareMoney(a, b);
  if (order === undefined) {
    const left = parseMinorUnits(a);
    const right = parseMinorUnits(b);
    if (left === undefined || right === undefined) return { ok: false, code: "INVALID_AMOUNT" };
    return { ok: false, code: "CURRENCY_MISMATCH" };
  }
  return { ok: true, amount: order <= 0 ? a : b };
}
