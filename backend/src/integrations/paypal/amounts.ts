import type { MoneyAmount } from "../../domain/money.ts";
import { PayPalGatewayError } from "./errors.ts";

/**
 * Currencies PayPal accepts in an order, with the decimals its amounts must
 * have. HUF, JPY and TWD take no decimals. A currency outside this table,
 * such as COP, fails closed: COMPAS does not convert.
 */
const PAYPAL_CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  AUD: 2, BRL: 2, CAD: 2, CHF: 2, CNY: 2, CZK: 2, DKK: 2, EUR: 2, GBP: 2, HKD: 2, HUF: 0, ILS: 2,
  JPY: 0, MXN: 2, MYR: 2, NOK: 2, NZD: 2, PHP: 2, PLN: 2, SEK: 2, SGD: 2, THB: 2, TWD: 0, USD: 2,
};

export type PayPalAmount = { currency_code: string; value: string };

function decimalsOf(currency: unknown): number | undefined {
  return typeof currency === "string" && Object.hasOwn(PAYPAL_CURRENCY_DECIMALS, currency)
    ? PAYPAL_CURRENCY_DECIMALS[currency]
    : undefined;
}

/** Whether PayPal takes this asset in an order, at this scale. */
export function paypalAcceptsAsset(asset: Pick<MoneyAmount, "assetCode" | "assetScale">): boolean {
  return decimalsOf(asset.assetCode) === asset.assetScale;
}

/** Minor units to PayPal's decimal string: 1120 USD/2 is "11.20". Never rounds. */
export function toPayPalAmount(amount: MoneyAmount): PayPalAmount {
  const decimals = decimalsOf(amount.assetCode);
  if (decimals === undefined) {
    throw new PayPalGatewayError("INVALID_INPUT", `PayPal does not take ${amount.assetCode} in an order.`);
  }
  if (amount.assetScale !== decimals) {
    throw new PayPalGatewayError(
      "INVALID_INPUT",
      `${amount.assetCode} amounts have ${decimals} decimals at PayPal, not ${amount.assetScale}.`,
    );
  }
  if (!/^\d+$/.test(amount.value)) {
    throw new PayPalGatewayError("INVALID_INPUT", `Not an amount in minor units: ${amount.value}`);
  }
  const digits = amount.value.replace(/^0+(?=\d)/, "");
  if (decimals === 0) return { currency_code: amount.assetCode, value: digits };
  const padded = digits.padStart(decimals + 1, "0");
  return {
    currency_code: amount.assetCode,
    value: `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`,
  };
}

/** PayPal's decimal string back to minor units, at the currency's own scale. */
export function fromPayPalAmount(amount: unknown): MoneyAmount {
  const { currency_code: code, value } = (amount ?? {}) as { currency_code?: unknown; value?: unknown };
  const decimals = decimalsOf(code);
  const match = typeof value === "string" ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null;
  if (decimals === undefined || !match || (match[2]?.length ?? 0) > decimals) {
    throw new PayPalGatewayError("UPSTREAM", `PayPal returned an amount COMPAS can't read: ${JSON.stringify(amount)}`);
  }
  const minor = `${match[1]}${(match[2] ?? "").padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return { value: minor, assetCode: code as string, assetScale: decimals };
}
