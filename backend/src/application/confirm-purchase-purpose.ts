import { PURCHASE_VERDICTS, type PurchaseVerdict } from "../domain/merchant-history.ts";
import type { MerchantHistoryDeps } from "./merchant-history.ts";

export const CONFIRMATION_ERROR_CODES = [
  "INVALID_CONFIRMATION",
  "PURCHASE_NOT_FOUND",
  "NOT_THE_PAYER",
  "VERDICT_ALREADY_RECORDED",
] as const;
export type ConfirmationErrorCode = (typeof CONFIRMATION_ERROR_CODES)[number];

export type ConfirmationResult =
  | { ok: true; observationId: string; duplicate: boolean }
  | { ok: false; code: ConfirmationErrorCode; message: string };

export function isPurchaseVerdict(value: unknown): value is PurchaseVerdict {
  return (PURCHASE_VERDICTS as readonly unknown[]).includes(value);
}

/**
 * The payer says whether a paid purchase fit the purpose. A MATCH is the only
 * thing that raises a merchant's history; a MISMATCH contradicts it.
 *
 * Only the purchase's own payer may answer, once. The same answer again is
 * idempotent. The backend has no payer authentication yet: knowing the payer
 * id is all this checks. That gap must close before a real deployment.
 */
export async function confirmPurchasePurpose(
  input: { spendingRecordId: string; payerId: string; verdict: PurchaseVerdict },
  deps: Pick<MerchantHistoryDeps, "observations" | "partyRef"> & { now?: () => Date },
): Promise<ConfirmationResult> {
  if (!isPurchaseVerdict(input.verdict) || !input.payerId || !input.spendingRecordId) {
    return { ok: false, code: "INVALID_CONFIRMATION", message: "spendingRecordId, payerId and a MATCH or MISMATCH verdict are required" };
  }

  const paid = await deps.observations.findPaid(input.spendingRecordId);
  if (!paid) {
    return { ok: false, code: "PURCHASE_NOT_FOUND", message: "No paid purchase with that id. Only a paid purchase can be confirmed." };
  }
  const payerRef = deps.partyRef(input.payerId);
  if (payerRef !== paid.payerRef) {
    return { ok: false, code: "NOT_THE_PAYER", message: "Only the purchase's payer may confirm it." };
  }

  const existing = await deps.observations.findVerdict(input.spendingRecordId);
  if (existing) {
    return existing.verdict === input.verdict
      ? { ok: true, observationId: existing.id, duplicate: true }
      : { ok: false, code: "VERDICT_ALREADY_RECORDED", message: `This purchase was already marked ${existing.verdict}.` };
  }

  const id = `${input.spendingRecordId}:verdict`;
  await deps.observations.append({
    type: "PAYER_VERDICT",
    id,
    spendingRecordId: input.spendingRecordId,
    paypalMerchantId: paid.paypalMerchantId,
    payerRef,
    verdict: input.verdict,
    observedAt: (deps.now?.() ?? new Date()).toISOString(),
  });
  return { ok: true, observationId: id, duplicate: false };
}
