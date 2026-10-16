import type { MoneyView } from "@/demo/scenarios";

/** Renders a fixture amount. This is display formatting, not a policy or quote. */
export function formatMoneyAmount(amount: MoneyView): string {
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
