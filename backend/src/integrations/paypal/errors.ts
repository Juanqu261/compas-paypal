export const PAYPAL_GATEWAY_ERROR_CODES = [
  /** A value COMPAS sends is malformed, for example a currency PayPal doesn't support. */
  "INVALID_INPUT",
  /** PayPal returned 401: the client id and secret were refused. */
  "UNAUTHORIZED",
  /** PayPal returned 403: the app lacks the permission for this call. */
  "FORBIDDEN",
  /** PayPal returned 404: it doesn't know the order, for example because it expired. */
  "NOT_FOUND",
  /** The payee merchant id is not a PayPal account. */
  "PAYEE_ACCOUNT_INVALID",
  /** A capture before the payer approved the order. */
  "ORDER_NOT_APPROVED",
  /** The order was already captured. Read it again for the capture. */
  "ORDER_ALREADY_CAPTURED",
  /** PayPal declined the payer's funding source at capture. */
  "INSTRUMENT_DECLINED",
  /** PayPal rejected the request with another 4xx. */
  "REJECTED",
  /** 5xx, network failure, timeout, or a response COMPAS could not read. */
  "UPSTREAM",
] as const;

export type PayPalGatewayErrorCode = (typeof PAYPAL_GATEWAY_ERROR_CODES)[number];

/** PayPal `details[].issue` values COMPAS reacts to. Every other issue keeps its HTTP status code. */
const ISSUE_CODES: Readonly<Record<string, PayPalGatewayErrorCode>> = {
  PAYEE_ACCOUNT_INVALID: "PAYEE_ACCOUNT_INVALID",
  ORDER_NOT_APPROVED: "ORDER_NOT_APPROVED",
  ORDER_ALREADY_CAPTURED: "ORDER_ALREADY_CAPTURED",
  INSTRUMENT_DECLINED: "INSTRUMENT_DECLINED",
};

/**
 * The only error type the PayPal gateway throws. Every failure fails closed:
 * no caller treats it as a payment. The message never holds a token or the
 * client secret. `debugId` is PayPal's reference for its support.
 */
export class PayPalGatewayError extends Error {
  readonly code: PayPalGatewayErrorCode;
  readonly status?: number;
  readonly issue?: string;
  readonly debugId?: string;

  constructor(
    code: PayPalGatewayErrorCode,
    message: string,
    options: { status?: number; issue?: string; debugId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "PayPalGatewayError";
    this.code = code;
    this.status = options.status;
    this.issue = options.issue;
    this.debugId = options.debugId;
  }
}

function codeForStatus(status: number): PayPalGatewayErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400 && status < 500) return "REJECTED";
  return "UPSTREAM";
}

/** PayPal's error body: `{ name, message, debug_id, details: [{ issue, description }] }`. */
export function toPayPalError(operation: string, status: number, body: unknown): PayPalGatewayError {
  const error = (typeof body === "object" && body !== null ? body : {}) as {
    name?: unknown;
    message?: unknown;
    debug_id?: unknown;
    details?: unknown;
  };
  const detail = Array.isArray(error.details) ? (error.details[0] as { issue?: unknown; description?: unknown }) : undefined;
  const issue = typeof detail?.issue === "string" ? detail.issue : undefined;
  const name = typeof error.name === "string" ? error.name : undefined;
  const description =
    (typeof detail?.description === "string" && detail.description) ||
    (typeof error.message === "string" && error.message) ||
    "no description";
  return new PayPalGatewayError(
    (issue && ISSUE_CODES[issue]) || codeForStatus(status),
    `${operation} failed (${status}${issue ? ` ${issue}` : name ? ` ${name}` : ""}): ${description}`,
    {
      status,
      ...(issue ? { issue } : {}),
      ...(typeof error.debug_id === "string" ? { debugId: error.debug_id } : {}),
    },
  );
}
