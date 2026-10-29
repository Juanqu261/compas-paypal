import type { MoneyAmount } from "../domain/money.ts";
import type { PaymentState } from "../domain/spending.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { PayPalCaptureStatus, PayPalGateway, PayPalOrderStatus } from "../ports/paypal-gateway.ts";
import type { SpendingLog } from "../ports/spending-log.ts";

/** How many of the merchant's newest orders are read from PayPal per request. */
export const MERCHANT_PAYMENTS_LIMIT = 8;

/**
 * One COMPAS order to this merchant, as PayPal reports it now. `paypal` is
 * read live from the sandbox; `compasState` is COMPAS's own record of it.
 * Nothing about the payer, the mandate or the purpose: the merchant sees what
 * PayPal would show it, plus COMPAS's reference.
 */
export type MerchantPayPalPayment = {
  orderId: string;
  compasState?: PaymentState;
  recordedAt: string;
  paypal:
    | {
        read: "OK";
        orderStatus: PayPalOrderStatus;
        payeeMerchantId?: string;
        amount?: MoneyAmount;
        capture?: { id: string; status: PayPalCaptureStatus; amount?: MoneyAmount };
      }
    /** PayPal didn't answer for this order. Its error code only. */
    | { read: "UNAVAILABLE"; error: string };
};

export type MerchantPayPalPaymentsResult =
  | { ok: true; merchant: { id: string; displayName: string; paypalMerchantId: string }; payments: readonly MerchantPayPalPayment[] }
  | { ok: false; code: "UNKNOWN_MERCHANT" };

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "error";
}

/**
 * The orders COMPAS created for a demo merchant, each re-read from the PayPal
 * sandbox. A read-only view for the merchant's phone: it calls only
 * `getOrder`, never creates or captures, and a failed read leaves that order
 * marked UNAVAILABLE instead of guessing its state.
 */
export async function listMerchantPayPalPayments(
  merchantId: string,
  deps: {
    merchants: Pick<MerchantDirectory, "getById">;
    spending: Pick<SpendingLog, "listOrdersByMerchant">;
    payments: Pick<PayPalGateway, "getOrder">;
  },
): Promise<MerchantPayPalPaymentsResult> {
  const merchant = await deps.merchants.getById(merchantId);
  if (!merchant) return { ok: false, code: "UNKNOWN_MERCHANT" };

  const records = await deps.spending.listOrdersByMerchant(merchant.paypalMerchantId, MERCHANT_PAYMENTS_LIMIT);
  const payments = await Promise.all(
    records.map(async (record): Promise<MerchantPayPalPayment> => {
      const orderId = record.paypal.orderId!;
      const base = {
        orderId,
        ...(record.paypal.state ? { compasState: record.paypal.state } : {}),
        recordedAt: record.recordedAt,
      };
      try {
        const order = await deps.payments.getOrder(orderId);
        return {
          ...base,
          paypal: {
            read: "OK",
            orderStatus: order.status,
            ...(order.payeeMerchantId ? { payeeMerchantId: order.payeeMerchantId } : {}),
            ...(order.amount ? { amount: order.amount } : {}),
            ...(order.capture ? { capture: order.capture } : {}),
          },
        };
      } catch (error) {
        return { ...base, paypal: { read: "UNAVAILABLE", error: errorCode(error) } };
      }
    }),
  );
  return {
    ok: true,
    // The account the payments arrive in: in a visitor's demo, their business account.
    merchant: { id: merchant.id, displayName: merchant.displayName, paypalMerchantId: merchant.payeeMerchantId ?? merchant.paypalMerchantId },
    payments,
  };
}
