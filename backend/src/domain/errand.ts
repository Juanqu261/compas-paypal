import type { MoneyAmount } from "./money.ts";

/**
 * An errand: what the delegate confirmed may be bought under a mandate, item
 * by item. It is the delegate's action that design decision 4 requires for
 * every spend, made once instead of at every cart. A purchase that names an
 * errand must fit it, line by line, or it is held (ERRAND_MISMATCH).
 *
 * An errand names medicines by CUM, so it is health data (Ley 1581 de 2012).
 * It stays in COMPAS: it never reaches PayPal, the analyst or the search index.
 */

export const ERRAND_KINDS = ["ONE_OFF", "STANDING"] as const;
export type ErrandKind = (typeof ERRAND_KINDS)[number];

/** Stored statuses. EXPIRED and FULFILLED are derived for display. */
export const ERRAND_STATUSES = ["ACTIVE", "CANCELLED"] as const;
export type ErrandStatus = (typeof ERRAND_STATUSES)[number];

export type ErrandItem = {
  /** What the delegate called it, e.g. "Losartán 50 mg". Display only. */
  label: string;
  /** The exact CUMs the delegate accepted for this item. A line matches by set membership. */
  acceptedCums: readonly string[];
  /** Units (boxes) allowed: in total for ONE_OFF, per refill window for STANDING. */
  maxUnits: number;
};

export type Errand = {
  id: string;
  mandateId: string;
  /** The delegate who confirmed it. Only they, or later an agent acting for them, may buy under it. */
  delegateId: string;
  kind: ErrandKind;
  status: ErrandStatus;
  items: readonly ErrandItem[];
  /** Spend allowed: in total for ONE_OFF, per refill window for STANDING. */
  maxAmount: MoneyAmount;
  /** STANDING only: units and amount reset every this many days. */
  refillEveryDays?: number;
  expiresAt: string;
  /** Who wrote the fields the delegate confirmed. A model may draft; only the delegate confirms. */
  draftedBy: "MODEL" | "DELEGATE";
  confirmedAt: string;
  createdAt: string;
};

/** Units per item (in item order) and the amount a purchase holds against an errand. */
export type ErrandUsage = { units: readonly number[]; amount: MoneyAmount };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where the current window starts: the errand's creation for ONE_OFF, the last refill for STANDING. */
export function errandWindowStart(errand: Errand, now: Date): Date {
  if (errand.kind !== "STANDING" || !errand.refillEveryDays) return new Date(errand.createdAt);
  const created = Date.parse(errand.createdAt);
  const period = errand.refillEveryDays * DAY_MS;
  const elapsed = Math.max(0, now.getTime() - created);
  return new Date(created + Math.floor(elapsed / period) * period);
}
