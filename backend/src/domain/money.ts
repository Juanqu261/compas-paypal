/**
 * An integer amount in minor units, stored as a decimal string.
 * This avoids binary floating point. It is not an exchange rate.
 */
export type MoneyAmount = {
  value: string;
  assetCode: string;
  assetScale: number;
};

export function formatMoneyAmount(amount: MoneyAmount): string {
  const negative = amount.value.startsWith("-");
  const digits = negative ? amount.value.slice(1) : amount.value;
  const scale = amount.assetScale;

  if (!/^\d+$/.test(digits) || !Number.isInteger(scale) || scale < 0) {
    return `${amount.assetCode} ${amount.value}`;
  }

  if (scale === 0) {
    return `${negative ? "-" : ""}${amount.assetCode} ${digits}`;
  }

  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale);
  const fraction = padded.slice(padded.length - scale);
  return `${negative ? "-" : ""}${amount.assetCode} ${whole}.${fraction}`;
}
