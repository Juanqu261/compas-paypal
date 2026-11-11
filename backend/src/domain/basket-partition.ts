import type { CompasCategory } from "./merchant-category.ts";
import type { MoneyAmount } from "./money.ts";
import { addMoney, compareMoney, parseMinorUnits, sameMoneyAsset, zeroMoney } from "./money-math.ts";

/**
 * Splits one merchant cart into what the mandate can cover and what it
 * cannot. The input cart is not modified. Only the eligible partition may
 * be sent to the payment gate. The personal partition is not a COMPAS payment.
 */

export type BasketLineInput = {
  id: string;
  label: string;
  amount: MoneyAmount;
  category: CompasCategory | "UNKNOWN";
  /** KNOWN: a verifier or a declared category. UNKNOWN must not become eligible. UNCERTAIN is review. */
  classification: "KNOWN" | "UNKNOWN" | "UNCERTAIN";
  merchantEligible: boolean;
  errandFit: "FIT" | "MISMATCH" | "NONE";
};

export type PartitionedLine = BasketLineInput & { reasonCodes: readonly string[] };

export type BasketPartition = {
  eligible: readonly PartitionedLine[];
  ineligible: readonly PartitionedLine[];
  review: readonly PartitionedLine[];
  totals: { eligible: MoneyAmount; ineligible: MoneyAmount; review: MoneyAmount; currency: string };
  budgetFits: boolean;
  /** False when nothing eligible remains or the eligible total exceeds remaining capacity. */
  checkoutAllowed: boolean;
  explanation: string;
  dataLabel?: "demo/test data";
};

function withReasons(line: BasketLineInput, reasonCodes: string[]): PartitionedLine {
  return { ...line, reasonCodes };
}

export function partitionBasket(input: {
  lines: readonly BasketLineInput[];
  allowedCategories: readonly CompasCategory[];
  currency: Pick<MoneyAmount, "assetCode" | "assetScale">;
  remaining?: MoneyAmount;
  dataLabel?: "demo/test data";
}): BasketPartition {
  const allowed = new Set<string>(input.allowedCategories);
  const eligible: PartitionedLine[] = [];
  const ineligible: PartitionedLine[] = [];
  const review: PartitionedLine[] = [];
  const sample = { ...input.currency, value: "0" };

  for (const line of input.lines) {
    const reasons: string[] = [];
    const amountOk = parseMinorUnits(line.amount) !== undefined;
    if (!amountOk) {
      ineligible.push(withReasons(line, ["INVALID_AMOUNT"]));
      continue;
    }
    if (!sameMoneyAsset(line.amount, sample)) {
      ineligible.push(withReasons(line, ["CURRENCY_MISMATCH"]));
      continue;
    }
    if (!line.merchantEligible) reasons.push("MERCHANT_NOT_ELIGIBLE");
    if (line.classification === "UNKNOWN" || line.category === "UNKNOWN") reasons.push("UNKNOWN_CATEGORY");
    else if (line.classification === "UNCERTAIN") reasons.push("CLASSIFICATION_UNCERTAIN");
    else if (!allowed.has(line.category)) reasons.push("PURPOSE_MISMATCH");
    if (line.errandFit === "MISMATCH") reasons.push("ERRAND_MISMATCH");

    const copy = withReasons({ ...line, amount: { ...line.amount } }, reasons);
    if (reasons.includes("CLASSIFICATION_UNCERTAIN") || reasons.includes("ERRAND_MISMATCH")) review.push(copy);
    else if (reasons.length > 0) ineligible.push(copy);
    else eligible.push(copy);
  }

  const total = (lines: readonly PartitionedLine[]) =>
    lines.reduce((sum, line) => {
      const next = addMoney(sum, line.amount);
      return next.ok ? next.amount : sum;
    }, zeroMoney(input.currency));

  const eligibleTotal = total(eligible);
  const budgetFits = input.remaining ? compareMoney(eligibleTotal, input.remaining) !== 1 : true;
  const checkoutAllowed = eligible.length > 0 && budgetFits && eligibleTotal.value !== "0";

  const covered = formatWhole(eligibleTotal);
  const personal = formatWhole(total(ineligible));
  return {
    eligible,
    ineligible,
    review,
    totals: {
      eligible: eligibleTotal,
      ineligible: total(ineligible),
      review: total(review),
      currency: input.currency.assetCode,
    },
    budgetFits,
    checkoutAllowed,
    explanation: checkoutAllowed
      ? `COMPAS can cover ${covered}. ${personal} is outside the mandate and is not part of the COMPAS order.`
      : eligible.length === 0
        ? "Nothing in this cart is eligible. COMPAS will not create an order."
        : "The eligible lines exceed the remaining capacity. COMPAS will not create an order for them.",
    ...(input.dataLabel ? { dataLabel: input.dataLabel } : {}),
  };
}

function formatWhole(amount: MoneyAmount): string {
  const minor = parseMinorUnits(amount);
  if (minor === undefined) return amount.assetCode;
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(amount.assetScale + 1, "0");
  const whole = digits.slice(0, digits.length - amount.assetScale);
  const fraction = digits.slice(digits.length - amount.assetScale);
  return `${negative ? "-" : ""}${amount.assetCode} ${amount.assetScale === 0 ? whole : `${whole}.${fraction}`}`;
}

const usd = (value: string): MoneyAmount => ({ value, assetCode: "USD", assetScale: 2 });

/** Losartan covered, shampoo paid separately. Invented amounts, labeled demo/test data. */
export function splitBasketFixture(remaining?: MoneyAmount): BasketPartition {
  return partitionBasket({
    allowedCategories: ["MEDICATION"],
    currency: { assetCode: "USD", assetScale: 2 },
    ...(remaining ? { remaining } : {}),
    dataLabel: "demo/test data",
    lines: [
      {
        id: "losartan",
        label: "Losartan 50 mg",
        amount: usd("1500"),
        category: "MEDICATION",
        classification: "KNOWN",
        merchantEligible: true,
        errandFit: "FIT",
      },
      {
        id: "shampoo",
        label: "Shampoo",
        amount: usd("700"),
        category: "UNKNOWN",
        classification: "UNKNOWN",
        merchantEligible: true,
        errandFit: "NONE",
      },
    ],
  });
}
