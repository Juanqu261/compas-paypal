import { listMerchantPayPalPayments } from "../application/merchant-paypal-payments.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { PayPalGateway } from "../ports/paypal-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import type { JsonResponse } from "./merchant-categories.ts";

const MERCHANT_PAYMENTS = /^\/demo\/merchants\/([A-Za-z0-9-]{1,80})\/payments$/;

/** Where the merchant logs in to its own sandbox business account to see the money arrive. */
export const PAYPAL_SANDBOX_ACTIVITY_URL = "https://www.sandbox.paypal.com/myaccount/activities/";

export function merchantPaymentsId(pathname: string): string | undefined {
  return MERCHANT_PAYMENTS.exec(pathname)?.[1];
}

/**
 * GET /demo/merchants/:id/payments: the demo merchant's COMPAS orders, each
 * read live from the PayPal sandbox. demo/test data identities, real sandbox
 * orders. Only on with demo sessions, and only with PayPal configured: an
 * unconfigured gateway would throw on every read, and nothing is faked.
 */
export async function handleMerchantPayments(
  merchantId: string,
  deps: {
    enabled: boolean;
    paypalConfigured: boolean;
    merchants: Pick<MerchantDirectory, "getById">;
    spending: Pick<SpendingLog, "listOrdersByMerchant">;
    payments: Pick<PayPalGateway, "getOrder">;
  },
): Promise<JsonResponse> {
  if (!deps.enabled) {
    return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED", message: "Demo sessions are disabled." } };
  }
  if (!deps.paypalConfigured) {
    return { status: 503, body: { error: "PAYPAL_NOT_CONFIGURED", message: "PayPal is not configured in this environment." } };
  }
  const result = await listMerchantPayPalPayments(merchantId, deps);
  if (!result.ok) return { status: 404, body: { error: result.code } };
  return {
    status: 200,
    body: {
      environment: "sandbox",
      sandboxActivityUrl: PAYPAL_SANDBOX_ACTIVITY_URL,
      merchant: result.merchant,
      payments: result.payments,
    },
  };
}
