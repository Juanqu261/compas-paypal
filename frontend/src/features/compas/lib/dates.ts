/**
 * Date handling for the budget window. A date input gives `YYYY-MM-DD` in the
 * person's own calendar. The budget starts at the beginning of the first day
 * and ends at the end of the last day, in local time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` for a local date. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateInput(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getDate() === Number(match[3]) ? date : undefined;
}

export function startOfDayIso(value: string): string | undefined {
  return parseDateInput(value)?.toISOString();
}

export function endOfDayIso(value: string): string | undefined {
  const date = parseDateInput(value);
  if (!date) return undefined;
  return new Date(date.getTime() + DAY_MS - 1000).toISOString();
}

export type WindowProblem = "INVALID_DATE" | "ENDS_BEFORE_START" | "ENDS_IN_PAST" | "STARTS_IN_PAST" | "TOO_LONG";

/** UX checks only. The backend validates the window again. */
export function windowProblem(start: string, end: string, today: Date): WindowProblem | undefined {
  const from = parseDateInput(start);
  const to = parseDateInput(end);
  if (!from || !to) return "INVALID_DATE";
  const todayStart = parseDateInput(toDateInput(today));
  if (todayStart && from.getTime() < todayStart.getTime()) return "STARTS_IN_PAST";
  if (to.getTime() < from.getTime()) return "ENDS_BEFORE_START";
  if (todayStart && to.getTime() < todayStart.getTime()) return "ENDS_IN_PAST";
  if (to.getTime() - from.getTime() > 365 * DAY_MS) return "TOO_LONG";
  return undefined;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME_FORMAT.format(date);
}
