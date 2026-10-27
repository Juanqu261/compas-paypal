import type { Errand, ErrandUsage } from "../domain/errand.ts";
import type { MoneyAmount } from "../domain/money.ts";
import type { PolicyReason } from "../domain/policy-decision.ts";

/** A cart line as the errand check sees it: the CUM only if a current, verified catalog mapping gives one. */
export type ErrandLine = { cum?: string; quantity: number };

export type ErrandCheck = {
  /** Hard DENY reasons: the errand is not this delegate's under this mandate. */
  hardReasons: readonly PolicyReason[];
  /** REVIEW reasons, even under MONITORED: the cart does not fit what the delegate confirmed. */
  holdReasons: readonly PolicyReason[];
  /** What this cart would reserve, per item and in total. Present when it fits. */
  usage?: ErrandUsage;
};

function mismatch(message: string): PolicyReason {
  return { code: "ERRAND_MISMATCH", message };
}

/**
 * Deterministic. No AI and no I/O. Every cart line must be a verified CUM on
 * one of the errand's items, and the units and amount, added to what earlier
 * purchases still hold, must stay within the errand. An extra line, even an
 * in-purpose one, or one box too many, holds the purchase.
 */
export function checkErrand(input: {
  errand: Errand;
  mandateId: string;
  delegateId: string;
  lines: readonly ErrandLine[];
  amount: MoneyAmount;
  /** Live usage of the errand in its current window. */
  used: ErrandUsage;
  now: Date;
}): ErrandCheck {
  const { errand } = input;
  if (errand.mandateId !== input.mandateId || errand.delegateId !== input.delegateId) {
    return {
      hardReasons: [{ code: "DELEGATE_NOT_AUTHORIZED", message: "The errand belongs to another delegate or mandate." }],
      holdReasons: [],
    };
  }

  const hold: PolicyReason[] = [];
  if (errand.status !== "ACTIVE") hold.push(mismatch("The errand was cancelled."));
  if (input.now.getTime() >= Date.parse(errand.expiresAt)) hold.push(mismatch("The errand has expired."));

  const units = errand.items.map(() => 0);
  input.lines.forEach((line, index) => {
    if (!line.cum) {
      hold.push(mismatch(`Line ${index + 1} is not a product with a verified CUM.`));
      return;
    }
    const item = errand.items.findIndex((candidate) => candidate.acceptedCums.includes(line.cum!));
    if (item < 0) {
      hold.push(mismatch(`Line ${index + 1} is not on the errand.`));
      return;
    }
    units[item] += line.quantity;
  });
  errand.items.forEach((item, index) => {
    if (input.used.units[index] + units[index] > item.maxUnits) {
      hold.push(mismatch(`The cart has more of "${item.label}" than the errand allows.`));
    }
  });

  const cap = errand.maxAmount;
  if (input.amount.assetCode !== cap.assetCode || input.amount.assetScale !== cap.assetScale) {
    hold.push(mismatch(`The charge is in ${input.amount.assetCode}, the errand in ${cap.assetCode}. COMPAS does not convert.`));
  } else if (BigInt(input.used.amount.value) + BigInt(input.amount.value) > BigInt(cap.value)) {
    hold.push(mismatch("The charge exceeds what the errand allows."));
  }

  return hold.length > 0
    ? { hardReasons: [], holdReasons: hold }
    : { hardReasons: [], holdReasons: [], usage: { units, amount: input.amount } };
}
