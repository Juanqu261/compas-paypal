/**
 * A recurring care plan prepares a cycle. It does not charge PayPal and it
 * does not renew a mandate by itself. The payer still approves every order.
 */

export const CARE_PLAN_STATUSES = ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED"] as const;
export type CarePlanStatus = (typeof CARE_PLAN_STATUSES)[number];

export type CarePlan = {
  id: string;
  payerId: string;
  delegateId: string;
  beneficiaryId: string;
  mandateId: string;
  name: string;
  purpose: "MEDICATION";
  /** CUMs the payer named. A cycle copies them. It does not add medicines. */
  authorizedCums: readonly string[];
  productLabel: string;
  maxAmountPerPeriod: { value: string; assetCode: string; assetScale: number };
  currency: string;
  recurrenceRule: "MONTHLY";
  timezone: string;
  /** Day of month the plan started on, in `timezone`. February clamps it. */
  anchorDay: number;
  startsAt: string;
  endsAt?: string;
  status: CarePlanStatus;
  lastGeneratedPeriod?: string;
  nextDueAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CycleDecision =
  | { action: "CREATE"; periodId: string; dueDay: number }
  | { action: "REPLAY"; periodId: string; dueDay: number }
  | { action: "SKIP"; reason: string };

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDay(year: number, month: number, anchorDay: number): number {
  return Math.min(Math.max(anchorDay, 1), daysInMonth(year, month));
}

export function zonedYmd(instant: Date, timeZone: string): { year: number; month: number; day: number } | undefined {
  if (!isValidTimeZone(timeZone)) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!year || !month || !day) return undefined;
  return { year, month, day };
}

export function periodIdOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * One calendar month in the plan's timezone. Running this twice for the same
 * month returns REPLAY when that period id is already stored.
 */
export function decideCycle(input: {
  status: CarePlanStatus;
  timeZone: string;
  startsAt: string;
  endsAt?: string;
  anchorDay: number;
  now: Date;
  existingPeriodIds: readonly string[];
}): CycleDecision {
  if (input.status !== "ACTIVE") return { action: "SKIP", reason: "PLAN_NOT_ACTIVE" };
  const today = zonedYmd(input.now, input.timeZone);
  const start = zonedYmd(new Date(input.startsAt), input.timeZone);
  if (!today || !start) return { action: "SKIP", reason: "INVALID_TIME_ZONE" };
  const todayKey = today.year * 10000 + today.month * 100 + today.day;
  const startKey = start.year * 10000 + start.month * 100 + start.day;
  if (todayKey < startKey) return { action: "SKIP", reason: "NOT_STARTED" };
  if (input.endsAt) {
    const end = zonedYmd(new Date(input.endsAt), input.timeZone);
    if (!end) return { action: "SKIP", reason: "INVALID_TIME_ZONE" };
    const endKey = end.year * 10000 + end.month * 100 + end.day;
    if (todayKey > endKey) return { action: "SKIP", reason: "PLAN_ENDED" };
  }
  const periodId = periodIdOf(today.year, today.month);
  const dueDay = clampDay(today.year, today.month, input.anchorDay);
  if (input.existingPeriodIds.includes(periodId)) return { action: "REPLAY", periodId, dueDay };
  return { action: "CREATE", periodId, dueDay };
}
