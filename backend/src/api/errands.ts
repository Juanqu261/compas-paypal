import type { ErrandErrorCode, ErrandFailure, ErrandService } from "../application/errands.ts";
import type { Actor } from "../application/mandates.ts";
import type { JsonResponse } from "./merchant-categories.ts";

export const ERRANDS_PATH = "/errands";
export const ERRAND_DRAFTS_PATH = "/errands/drafts";
const CANCEL_PATH = /^\/errands\/(errand-[A-Za-z0-9-]{1,80})\/cancel$/;
export const MAX_ERRAND_BODY_BYTES = 8 * 1024;

const STATUS_BY_ERROR: Record<ErrandErrorCode, number> = {
  INVALID_ERRAND: 400,
  INVALID_MANDATE: 400,
  CONSENT_REQUIRED: 400,
  NOT_FOUND: 404,
  UNKNOWN_ERRAND: 404,
  NOT_THE_PAYER: 403,
  NOT_THE_DELEGATE: 403,
  INVALID_STATE: 409,
};

export function isErrandApiPath(pathname: string): boolean {
  return pathname === ERRANDS_PATH || pathname === ERRAND_DRAFTS_PATH || CANCEL_PATH.test(pathname);
}

function fail(result: ErrandFailure): JsonResponse {
  return {
    status: STATUS_BY_ERROR[result.code],
    body: { error: result.code, message: result.message, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) },
  };
}

/**
 * Errand routes. The actor comes from the session. A draft stores nothing and
 * is never an errand: only `POST /errands` with `confirmed: true`, by the
 * mandate's delegate, makes one.
 */
export async function handleErrandRequest(
  request: { method: string; url: URL; body?: unknown },
  actor: Actor,
  deps: { service: ErrandService },
): Promise<JsonResponse> {
  const { pathname } = request.url;
  if (pathname === ERRAND_DRAFTS_PATH) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    try {
      const result = await deps.service.draft(actor, request.body);
      return result.ok ? { status: 200, body: { draft: result.draft, confirmed: false } } : fail(result);
    } catch (error) {
      // The model or the search is not configured, or the model answered nonsense. Nothing was stored.
      const name = error instanceof Error ? error.name : "";
      if (name === "NotImplementedError") {
        return { status: 503, body: { error: "DRAFTING_NOT_CONFIGURED", message: "Drafting is not configured here. Write the errand yourself." } };
      }
      if (name === "AnalystOutputError" || name === "AnalystModelError") {
        return { status: 422, body: { error: "DRAFT_UNREADABLE", message: "The draft could not be read. Try again, or write the errand yourself." } };
      }
      throw error;
    }
  }
  const cancel = CANCEL_PATH.exec(pathname);
  if (cancel) {
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await deps.service.cancel(actor, cancel[1]);
    return result.ok ? { status: 200, body: { errand: result.errand } } : fail(result);
  }
  if (pathname === ERRANDS_PATH) {
    if (request.method === "POST") {
      const result = await deps.service.create(actor, request.body);
      return result.ok ? { status: 201, body: { errand: result.errand } } : fail(result);
    }
    if (request.method === "GET") {
      const mandateId = request.url.searchParams.get("mandateId") ?? "";
      const result = await deps.service.list(actor, mandateId);
      return result.ok ? { status: 200, body: { errands: result.errands, viewerRole: result.role } } : fail(result);
    }
    return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
  }
  return { status: 404, body: { error: "not_found" } };
}
