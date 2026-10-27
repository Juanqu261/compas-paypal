import type { DelegatePurchaseService, PurchaseErrorCode, PurchaseFailure } from "../application/delegate-purchases.ts";
import type { Actor } from "../application/mandates.ts";
import type { CategorySourceRegistry } from "../ports/category-source-registry.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";
import { type JsonResponse, merchantCategoryView } from "./merchant-categories.ts";

export const PURCHASES_PATH = "/purchases";
export const PURCHASE_PREVIEW_PATH = "/purchases/preview";
export const DEMO_MERCHANTS_PATH = "/demo/merchants";
/** A purchase request is small. Anything larger is refused before it is parsed. */
export const MAX_PURCHASE_BODY_BYTES = 8 * 1024;

const STATUS_BY_ERROR: Record<PurchaseErrorCode, number> = {
  INVALID_PURCHASE: 400,
  INVALID_MANDATE: 400,
  NOT_FOUND: 404,
  NOT_THE_PAYER: 403,
  NOT_THE_DELEGATE: 403,
  UNKNOWN_MERCHANT: 422,
  UNKNOWN_ERRAND: 422,
  PURCHASES_DISABLED_FOR_DEMO: 403,
  PAYPAL_NOT_CONFIGURED: 503,
  INVALID_STATE: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  PAYMENT_NOT_STARTED: 503,
};

export function isPurchaseApiPath(pathname: string): boolean {
  return pathname === PURCHASES_PATH || pathname === PURCHASE_PREVIEW_PATH;
}

function fail(result: PurchaseFailure): JsonResponse {
  return {
    status: STATUS_BY_ERROR[result.code],
    body: {
      error: result.code,
      message: result.message,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
      // Nothing was paid, and COMPAS holds no order for the attempt.
      ...(result.code === "PAYMENT_NOT_STARTED" ? { retryable: true } : {}),
    },
  };
}

/**
 * The delegate's purchase routes. The actor comes from the session, never
 * from the body. A preview writes nothing and calls no PayPal API. A purchase
 * is the whole COMPAS flow and answers 201 for any decision it records,
 * DENY and REVIEW included: a refusal is a result, not an error. An ALLOW
 * answers with a PayPal order waiting for the payer's approval.
 */
export async function handlePurchaseRequest(
  request: { method: string; url: URL; body?: unknown },
  actor: Actor,
  deps: { service: DelegatePurchaseService },
): Promise<JsonResponse> {
  if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };

  if (request.url.pathname === PURCHASE_PREVIEW_PATH) {
    const result = await deps.service.preview(actor, request.body);
    return result.ok ? { status: 200, body: { preview: result.preview } } : fail(result);
  }
  if (request.url.pathname === PURCHASES_PATH) {
    const result = await deps.service.purchase(actor, request.body);
    return result.ok
      ? { status: result.replayed ? 200 : 201, body: { purchase: result.purchase, replayed: result.replayed } }
      : fail(result);
  }
  return { status: 404, body: { error: "not_found" } };
}

/**
 * GET /demo/merchants: the demo merchants and the categories COMPAS resolves
 * for each one now. demo/test data. The PayPal merchant id stays on the
 * server: a purchase names the merchant by id. A view, not a policy decision.
 */
export async function handleListDemoMerchants(deps: {
  merchants: MerchantDirectory;
  registry: MerchantRegistry;
  sources: CategorySourceRegistry;
  /** Registered evidence sources. 0 means every trust-log entry is ignored. */
  sourceCount: number;
}): Promise<JsonResponse> {
  const merchants = [];
  for (const merchant of await deps.merchants.list()) {
    const { paypalMerchantId: _account, ...categories } = await merchantCategoryView(merchant.paypalMerchantId, deps);
    merchants.push({ id: merchant.id, displayName: merchant.displayName, ...categories });
  }
  return {
    status: 200,
    body: {
      dataLabel: "demo/test data",
      categorySources: deps.sourceCount > 0 ? "REGISTERED" : "NONE_REGISTERED",
      merchants,
    },
  };
}
