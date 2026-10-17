import { OpenPaymentsClientError } from "@interledger/open-payments";

export const OPEN_PAYMENTS_GATEWAY_ERROR_CODES = [
  /** No grant is stored for this key. */
  "GRANT_NOT_FOUND",
  /** The payer has not finished consent yet. */
  "GRANT_NOT_ACTIVE",
  /** The finish redirect's hash did not match. The redirect is not trusted. */
  "INVALID_INTERACTION_HASH",
  /** The auth server asked for interaction where none was expected, or did not finalize. */
  "GRANT_NOT_FINALIZED",
  /** The access token expired and could not be rotated. The payer must consent again. */
  "GRANT_EXPIRED",
  /** An amount does not use the wallet's asset code and scale. */
  "ASSET_MISMATCH",
  /** The quote expired. Re-quote and re-evaluate policy with the new debit amount. */
  "QUOTE_EXPIRED",
  /** A value COMPAS sends is malformed. */
  "INVALID_INPUT",
  /** Open Payments returned 401. */
  "UNAUTHORIZED",
  /** Open Payments returned 403, for example a grant limit or missing access. */
  "FORBIDDEN",
  /** Open Payments returned 404. */
  "NOT_FOUND",
  /** Open Payments rejected the request with another 4xx. */
  "REJECTED",
  /** 5xx, network failure, or a response the SDK could not validate. */
  "UPSTREAM",
] as const;

export type OpenPaymentsGatewayErrorCode =
  (typeof OPEN_PAYMENTS_GATEWAY_ERROR_CODES)[number];

/**
 * The only error type the real gateway throws.
 * Every failure fails closed. No caller should treat it as a payment.
 */
export class OpenPaymentsGatewayError extends Error {
  readonly code: OpenPaymentsGatewayErrorCode;
  readonly status?: number;

  constructor(
    code: OpenPaymentsGatewayErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "OpenPaymentsGatewayError";
    this.code = code;
    this.status = options.status;
  }
}

function codeForStatus(status: number | undefined): OpenPaymentsGatewayErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status !== undefined && status >= 400 && status < 500) return "REJECTED";
  return "UPSTREAM";
}

/**
 * Converts anything thrown during an SDK call. The SDK error's description
 * is kept for debugging. It never contains our tokens.
 */
export function toGatewayError(
  operation: string,
  error: unknown,
): OpenPaymentsGatewayError {
  if (error instanceof OpenPaymentsGatewayError) {
    return error;
  }

  if (error instanceof OpenPaymentsClientError) {
    const details = [error.description, ...(error.validationErrors ?? [])]
      .filter(Boolean)
      .join("; ");
    return new OpenPaymentsGatewayError(
      codeForStatus(error.status),
      `${operation} failed${error.status ? ` (${error.status})` : ""}: ${details || error.message}`,
      { status: error.status, cause: error },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new OpenPaymentsGatewayError(
    "UPSTREAM",
    `${operation} failed: ${message}`,
    { cause: error },
  );
}
