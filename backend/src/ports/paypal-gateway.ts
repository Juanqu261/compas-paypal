import type { MoneyAmount } from "../domain/money.ts";

/**
 * Metadata that is safe to send to PayPal. Opaque references only: health
 * details and other sensitive purpose data never go into a PayPal order.
 */
export type SafePaymentMetadata = {
  compasMandateId: string;
  compasDecisionId: string;
  /** The purchase intent id. PayPal keeps it as the order's invoice id. */
  externalReference: string;
};

export type CreateOrderInput = {
  /** Sent as PayPal-Request-Id: the same id returns the same order instead of a second one. */
  requestId: string;
  /** The merchant's PayPal account. PayPal pays it directly: the money never passes through COMPAS. */
  payeeMerchantId: string;
  amount: MoneyAmount;
  /**
   * One amount per cart line, in the order's asset, adding up to `amount`.
   * The adapter names every line neutrally: a product name can name a medicine.
   */
  lineAmounts: readonly MoneyAmount[];
  metadata: SafePaymentMetadata;
};

/** PayPal's order status, as the Orders v2 API reports it. */
export type PayPalOrderStatus =
  | "CREATED"
  | "SAVED"
  | "APPROVED"
  | "VOIDED"
  | "COMPLETED"
  | "PAYER_ACTION_REQUIRED";

export type PayPalCaptureStatus =
  | "COMPLETED"
  | "DECLINED"
  | "PARTIALLY_REFUNDED"
  | "PENDING"
  | "REFUNDED"
  | "FAILED";

export type PayPalOrder = {
  id: string;
  status: PayPalOrderStatus;
  /** Where the payer approves the order. Present while it waits for the payer. */
  approvalUrl?: string;
  payeeMerchantId?: string;
  amount?: MoneyAmount;
  /** The compasDecisionId, as COMPAS sent it. */
  customId?: string;
  /** The PayPal account that approved the order. Present once the payer approved. */
  payerId?: string;
  /** Present once PayPal captured, or tried to capture, the order. */
  capture?: { id: string; status: PayPalCaptureStatus; amount?: MoneyAmount };
};

/**
 * Shields COMPAS from the PayPal REST API. The client secret and access
 * tokens never cross this boundary.
 *
 * An order moves no money by itself: the payer approves it at PayPal, and
 * only `captureOrder` pays the merchant. `createOrder` must only be reached
 * through createPayPalOrderIfAllowed after policy returns ALLOW, and
 * `captureOrder` only through the settlement that checks the mandate again.
 */
export interface PayPalGateway {
  createOrder(input: CreateOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  captureOrder(input: { orderId: string; requestId: string }): Promise<PayPalOrder>;
}
