import type { MandateStatus } from "./mandate.ts";
import type { MoneyAmount } from "./money.ts";
import { addMoney, compareMoney, minMoney, parseMinorUnits, subtractMoney, zeroMoney } from "./money-math.ts";

/**
 * Refunds change COMPAS authorization capacity only after a verified
 * completion, and only while the mandate can still be spent. They never
 * change a PayPal balance COMPAS does not hold. A repeated event credits once.
 *
 * PayPal refund statuses used here: COMPLETED, PENDING, CANCELLED, FAILED.
 * Only COMPLETED can restore capacity.
 */

export const REFUND_STATUSES = ["REQUESTED", "PENDING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export type RefundDecision = {
  status: RefundStatus;
  /** PayPal's refunded amount, when the event is a real refund. Zero when rejected. */
  refundAmount: MoneyAmount;
  /** Capacity given back. Zero when the mandate cannot be spent, or the event is a duplicate. */
  capacityRestored: MoneyAmount;
  duplicate: boolean;
  reason?: string;
};

export function decideRefund(input: {
  captured: MoneyAmount;
  alreadyRefunded: MoneyAmount;
  amount: MoneyAmount;
  paypalStatus: "COMPLETED" | "PENDING" | "CANCELLED" | "FAILED";
  mandateStatus: MandateStatus;
  mandateExpiresAt: string;
  now: Date;
  duplicate: boolean;
}): RefundDecision {
  const zero = zeroMoney(input.captured);
  if (input.duplicate) {
    return { status: statusOf(input.paypalStatus), refundAmount: input.amount, capacityRestored: zero, duplicate: true, reason: "DUPLICATE" };
  }
  if (parseMinorUnits(input.amount) === undefined || parseMinorUnits(input.captured) === undefined) {
    return { status: "FAILED", refundAmount: zero, capacityRestored: zero, duplicate: false, reason: "INVALID_AMOUNT" };
  }
  if (input.amount.assetCode !== input.captured.assetCode || input.amount.assetScale !== input.captured.assetScale) {
    return { status: "FAILED", refundAmount: zero, capacityRestored: zero, duplicate: false, reason: "CURRENCY_MISMATCH" };
  }
  if (input.paypalStatus !== "COMPLETED") {
    return {
      status: statusOf(input.paypalStatus),
      refundAmount: input.paypalStatus === "PENDING" ? input.amount : zero,
      capacityRestored: zero,
      duplicate: false,
      reason: input.paypalStatus,
    };
  }
  const room = subtractMoney(input.captured, input.alreadyRefunded);
  if (!room.ok) {
    return { status: "FAILED", refundAmount: zero, capacityRestored: zero, duplicate: false, reason: "OVER_REFUND" };
  }
  if (compareMoney(input.amount, room.amount) === 1) {
    return { status: "FAILED", refundAmount: zero, capacityRestored: zero, duplicate: false, reason: "OVER_REFUND" };
  }
  const restorable = input.mandateStatus === "ACTIVE" && input.now.getTime() < Date.parse(input.mandateExpiresAt);
  return {
    status: "COMPLETED",
    refundAmount: input.amount,
    capacityRestored: restorable ? input.amount : zero,
    duplicate: false,
    ...(!restorable ? { reason: input.mandateStatus === "ACTIVE" ? "MANDATE_EXPIRED" : "MANDATE_NOT_RESTORABLE" } : {}),
  };
}

function statusOf(status: "COMPLETED" | "PENDING" | "CANCELLED" | "FAILED"): RefundStatus {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "PENDING") return "PENDING";
  if (status === "CANCELLED") return "CANCELLED";
  return "FAILED";
}

export type CapacityPicture = {
  authorized: MoneyAmount;
  reserved: MoneyAmount;
  captured: MoneyAmount;
  refunded: MoneyAmount;
  available: MoneyAmount;
};

/**
 * available = authorized - reserved - captured + refunded, and never above
 * authorized. `refunded` here is only the portion that was allowed back.
 */
export function capacityPicture(input: {
  authorized: MoneyAmount;
  reserved: MoneyAmount;
  captured: MoneyAmount;
  refundedRestored: MoneyAmount;
}): CapacityPicture | undefined {
  const netCaptured = subtractMoney(input.captured, input.refundedRestored);
  if (!netCaptured.ok) return undefined;
  const afterReserved = subtractMoney(input.authorized, input.reserved);
  if (!afterReserved.ok) return undefined;
  const available = subtractMoney(afterReserved.amount, netCaptured.amount);
  if (!available.ok) return undefined;
  const capped = minMoney(available.amount, input.authorized);
  if (!capped.ok) return undefined;
  return {
    authorized: input.authorized,
    reserved: input.reserved,
    captured: input.captured,
    refunded: input.refundedRestored,
    available: capped.amount,
  };
}

export function sumMoney(amounts: readonly MoneyAmount[], sample: MoneyAmount): MoneyAmount | undefined {
  return amounts.reduce<MoneyAmount | undefined>((sum, amount) => {
    if (!sum) return undefined;
    const next = addMoney(sum, amount);
    return next.ok ? next.amount : undefined;
  }, zeroMoney(sample));
}
