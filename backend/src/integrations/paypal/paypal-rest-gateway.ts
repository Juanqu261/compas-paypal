import type {
  CreateOrderInput,
  PayPalCaptureStatus,
  PayPalGateway,
  PayPalOrder,
  PayPalOrderStatus,
} from "../../ports/paypal-gateway.ts";
import { fromPayPalAmount, toPayPalAmount } from "./amounts.ts";
import { PayPalGatewayError } from "./errors.ts";
import type { PayPalRestClient } from "./rest-client.ts";

/** PayPal order ids are short upper-case tokens. Anything else never reaches a URL path. */
const ORDER_ID = /^[A-Z0-9]{1,36}$/;
/** PayPal's limit for custom_id and invoice_id. reference_id allows more, COMPAS never needs it. */
const MAX_REFERENCE_LENGTH = 127;

const ORDER_STATUSES: readonly PayPalOrderStatus[] = [
  "CREATED",
  "SAVED",
  "APPROVED",
  "VOIDED",
  "COMPLETED",
  "PAYER_ACTION_REQUIRED",
];
const CAPTURE_STATUSES: readonly PayPalCaptureStatus[] = [
  "COMPLETED",
  "DECLINED",
  "PARTIALLY_REFUNDED",
  "PENDING",
  "REFUNDED",
  "FAILED",
];

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

function checkOrderId(orderId: string): string {
  if (!ORDER_ID.test(orderId)) throw new PayPalGatewayError("INVALID_INPUT", `Not a PayPal order id: ${orderId}`);
  return orderId;
}

function checkReference(name: string, value: string): string {
  if (value.length === 0 || value.length > MAX_REFERENCE_LENGTH) {
    throw new PayPalGatewayError("INVALID_INPUT", `${name} must be 1 to ${MAX_REFERENCE_LENGTH} characters`);
  }
  return value;
}

/** Only a PayPal page is ever handed to the payer's browser. */
function paypalPageUrl(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  try {
    const url = new URL(href);
    const host = url.hostname;
    return url.protocol === "https:" && (host === "paypal.com" || host.endsWith(".paypal.com")) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Reads an Orders v2 response. A body COMPAS can't read is an UPSTREAM error, never a guess. */
export function toPayPalOrder(body: unknown): PayPalOrder {
  const order = record(body);
  const id = order?.id;
  const status = order?.status;
  if (typeof id !== "string" || !ORDER_ID.test(id) || !ORDER_STATUSES.includes(status as PayPalOrderStatus)) {
    throw new PayPalGatewayError("UPSTREAM", "PayPal returned an order COMPAS can't read");
  }

  const unit = record(Array.isArray(order!.purchase_units) ? order!.purchase_units[0] : undefined);
  const links = Array.isArray(order!.links) ? order!.links.map(record) : [];
  const link = (rel: string) => links.find((candidate) => candidate?.rel === rel)?.href;
  const approvalUrl = paypalPageUrl(link("payer-action") ?? link("approve"));
  const payeeMerchantId = record(unit?.payee)?.merchant_id;
  const payerId = record(order!.payer)?.payer_id ?? record(record(order!.payment_source)?.paypal)?.account_id;

  const captures = record(unit?.payments)?.captures;
  const rawCapture = record(Array.isArray(captures) ? captures[0] : undefined);
  let capture: PayPalOrder["capture"];
  if (rawCapture) {
    if (typeof rawCapture.id !== "string" || !CAPTURE_STATUSES.includes(rawCapture.status as PayPalCaptureStatus)) {
      throw new PayPalGatewayError("UPSTREAM", "PayPal returned a capture COMPAS can't read");
    }
    capture = {
      id: rawCapture.id,
      status: rawCapture.status as PayPalCaptureStatus,
      ...(rawCapture.amount ? { amount: fromPayPalAmount(rawCapture.amount) } : {}),
    };
  }

  return {
    id,
    status: status as PayPalOrderStatus,
    ...(approvalUrl && (status === "PAYER_ACTION_REQUIRED" || status === "CREATED") ? { approvalUrl } : {}),
    ...(typeof payeeMerchantId === "string" ? { payeeMerchantId } : {}),
    ...(unit?.amount ? { amount: fromPayPalAmount(unit.amount) } : {}),
    ...(typeof unit?.custom_id === "string" ? { customId: unit.custom_id } : {}),
    ...(typeof payerId === "string" ? { payerId } : {}),
    ...(capture ? { capture } : {}),
  };
}

/**
 * The PayPal Orders v2 adapter. An order pays the merchant directly
 * (`payee.merchant_id`) and waits for the payer's approval at PayPal.
 * Nothing in it names a product: lines are "Item 1", "Item 2", and the only
 * references are the COMPAS mandate, decision and intent ids.
 */
export class PayPalRestGateway implements PayPalGateway {
  readonly #client: PayPalRestClient;
  readonly #returnUrl: string;
  readonly #cancelUrl: string;

  constructor(deps: { client: PayPalRestClient; returnUrl: string; cancelUrl: string }) {
    this.#client = deps.client;
    this.#returnUrl = deps.returnUrl;
    this.#cancelUrl = deps.cancelUrl;
  }

  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const { amount, lineAmounts, metadata } = input;
    if (lineAmounts.length === 0) throw new PayPalGatewayError("INVALID_INPUT", "An order needs at least one line.");
    if (lineAmounts.some((line) => line.assetCode !== amount.assetCode || line.assetScale !== amount.assetScale)) {
      throw new PayPalGatewayError("INVALID_INPUT", "Every line must use the order's asset.");
    }
    if (lineAmounts.reduce((sum, line) => sum + BigInt(line.value), 0n) !== BigInt(amount.value)) {
      throw new PayPalGatewayError("INVALID_INPUT", "The lines must add up to the order amount.");
    }
    const total = toPayPalAmount(amount);

    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: checkReference("compasMandateId", metadata.compasMandateId),
          custom_id: checkReference("compasDecisionId", metadata.compasDecisionId),
          invoice_id: checkReference("externalReference", metadata.externalReference),
          // The merchant receives the payment directly. PayPal shows the payer the merchant's own name.
          payee: { merchant_id: input.payeeMerchantId },
          amount: { ...total, breakdown: { item_total: total } },
          items: lineAmounts.map((line, index) => ({
            name: `Item ${index + 1}`,
            quantity: "1",
            unit_amount: toPayPalAmount(line),
          })),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: this.#returnUrl,
            cancel_url: this.#cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    };
    const order = toPayPalOrder(
      await this.#client.request("PayPal create order", "POST", "/v2/checkout/orders", {
        body,
        requestId: checkReference("requestId", input.requestId),
      }),
    );
    if (!order.approvalUrl) {
      throw new PayPalGatewayError("UPSTREAM", `PayPal created order ${order.id} without a payer approval link`);
    }
    return order;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    return toPayPalOrder(
      await this.#client.request("PayPal get order", "GET", `/v2/checkout/orders/${checkOrderId(orderId)}`),
    );
  }

  async captureOrder(input: { orderId: string; requestId: string }): Promise<PayPalOrder> {
    return toPayPalOrder(
      await this.#client.request("PayPal capture order", "POST", `/v2/checkout/orders/${checkOrderId(input.orderId)}/capture`, {
        body: {},
        requestId: checkReference("requestId", input.requestId),
      }),
    );
  }
}
