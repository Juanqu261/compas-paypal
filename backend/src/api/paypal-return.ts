import type { PayPalOrderSettlement, SettlementResult } from "../application/settle-paypal-order.ts";
import { PAYPAL_ORDER_CANCEL_PATH, PAYPAL_ORDER_RETURN_PATH } from "../integrations/paypal/config.ts";

export { PAYPAL_ORDER_CANCEL_PATH, PAYPAL_ORDER_RETURN_PATH };

/**
 * What the frontend is told, as a hint only: the screen reads the mandate's
 * activity again. UNCONFIRMED: PayPal gave no clear answer, and the next read
 * of the activity reconciles the order. ENDED: the visitor's demo that made
 * the order is gone, so nothing was captured.
 */
export type PayerReturnResult = "completed" | "pending" | "waiting" | "cancelled" | "failed" | "unconfirmed" | "ended";

/** PayPal order ids are short upper-case tokens. Anything else is not looked up. */
const ORDER_ID = /^[A-Z0-9]{1,36}$/;

const RESULT_BY_STATE: Record<SettlementResult, PayerReturnResult> = {
  COMPLETED: "completed",
  PENDING: "pending",
  AWAITING_PAYER_APPROVAL: "waiting",
  CANCELLED: "cancelled",
  FAILED: "failed",
  UNKNOWN_ORDER: "failed",
};

export type PayPalReturnDeps = {
  /** The settlement of the demo that created the order, or undefined when that demo has ended. */
  settlementFor: (orderId: string) => Pick<PayPalOrderSettlement, "approved" | "cancelled"> | undefined;
  /** Frontend page the payer's browser returns to. */
  returnUrl: string;
  logError?: (message: string) => void;
};

export function isPayPalReturnPath(pathname: string): boolean {
  return pathname === PAYPAL_ORDER_RETURN_PATH || pathname === PAYPAL_ORDER_CANCEL_PATH;
}

/**
 * PayPal sends the payer's browser here after they approve (`return`) or
 * cancel (`cancel`) an order, with the order id as `token`. Nothing in the
 * URL is trusted: the settlement asks PayPal for the order and checks the
 * mandate before it captures. The response is only a redirect: no PayPal
 * payload, account id or token reaches the browser.
 */
export async function handlePayPalReturn(
  requestUrl: URL,
  deps: PayPalReturnDeps,
): Promise<{ location: string; result: PayerReturnResult }> {
  const orderId = requestUrl.searchParams.get("token");
  let result: PayerReturnResult = "failed";
  let mandateId: string | undefined;

  const settlement = orderId && ORDER_ID.test(orderId) ? deps.settlementFor(orderId) : undefined;
  if (orderId && ORDER_ID.test(orderId) && !settlement) result = "ended";
  if (orderId && settlement) {
    try {
      const outcome =
        requestUrl.pathname === PAYPAL_ORDER_CANCEL_PATH
          ? await settlement.cancelled(orderId)
          : await settlement.approved(orderId);
      result = RESULT_BY_STATE[outcome.result];
      mandateId = outcome.mandateId;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      deps.logError?.(`PayPal return for order ${orderId} not settled: ${typeof code === "string" ? code : "error"}`);
      result = "unconfirmed";
    }
  }

  const location = new URL(deps.returnUrl);
  location.searchParams.set("paypalOrder", result);
  if (mandateId) location.searchParams.set("mandateId", mandateId);
  return { location: location.toString(), result };
}
