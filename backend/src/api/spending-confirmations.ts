import {
  type ConfirmationErrorCode,
  type ConfirmationResult,
  isPurchaseVerdict,
} from "../application/confirm-purchase-purpose.ts";
import type { PurchaseVerdict } from "../domain/merchant-history.ts";
import type { JsonResponse } from "./merchant-categories.ts";

/** POST /spending-records/<spendingRecordId>/confirmation */
export const SPENDING_CONFIRMATION_PATH = /^\/spending-records\/([A-Za-z0-9_:-][A-Za-z0-9._:-]{0,127})\/confirmation$/;

/** A confirmation is tiny. Anything larger is refused before it is parsed. */
export const MAX_CONFIRMATION_BODY_BYTES = 1024;

const STATUS_BY_ERROR: Record<ConfirmationErrorCode, number> = {
  INVALID_CONFIRMATION: 400,
  NOT_THE_PAYER: 403,
  PURCHASE_NOT_FOUND: 404,
  VERDICT_ALREADY_RECORDED: 409,
};

/**
 * The payer's answer on a paid purchase: `{ "payerId": "…", "verdict": "MATCH" | "MISMATCH" }`.
 *
 * Not wired into server.ts yet: the backend runs no purchases over HTTP, so
 * its observation log would always be empty. The orchestrator wires this
 * together with the purchase routes. There is no payer authentication yet.
 */
export async function handleConfirmPurchasePurpose(
  pathname: string,
  body: Uint8Array,
  deps: {
    confirm: (input: { spendingRecordId: string; payerId: string; verdict: PurchaseVerdict }) => Promise<ConfirmationResult>;
  },
): Promise<JsonResponse> {
  const match = SPENDING_CONFIRMATION_PATH.exec(pathname);
  if (!match) return { status: 404, body: { error: "not_found" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return { status: 400, body: { error: "INVALID_CONFIRMATION", message: "body is not UTF-8 JSON" } };
  }
  const payerId = (parsed as { payerId?: unknown } | null)?.payerId;
  const verdict = (parsed as { verdict?: unknown } | null)?.verdict;
  if (typeof payerId !== "string" || payerId.length === 0 || payerId.length > 128 || !isPurchaseVerdict(verdict)) {
    return {
      status: 400,
      body: { error: "INVALID_CONFIRMATION", message: "payerId and a verdict of MATCH or MISMATCH are required" },
    };
  }

  const result = await deps.confirm({ spendingRecordId: match[1], payerId, verdict });
  if (!result.ok) {
    return { status: STATUS_BY_ERROR[result.code], body: { error: result.code, message: result.message } };
  }
  return result.duplicate
    ? { status: 200, body: { recorded: verdict, duplicate: true } }
    : { status: 201, body: { recorded: verdict } };
}
