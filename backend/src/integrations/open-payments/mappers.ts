import type { MoneyAmount } from "../../domain/money";
import type {
  PaymentState,
  SafePaymentMetadata,
} from "../../ports/open-payments-gateway";
import { OpenPaymentsGatewayError } from "./errors.ts";

/** The amount shape Open Payments uses. It matches MoneyAmount field by field. */
export type OpenPaymentsAmount = {
  value: string;
  assetCode: string;
  assetScale: number;
};

const UNSIGNED_INTEGER = /^\d+$/;

function assertAmount(amount: OpenPaymentsAmount, label: string): void {
  if (
    !UNSIGNED_INTEGER.test(amount.value) ||
    !Number.isInteger(amount.assetScale) ||
    amount.assetScale < 0 ||
    amount.assetScale > 255 ||
    amount.assetCode.length === 0
  ) {
    throw new OpenPaymentsGatewayError(
      "INVALID_INPUT",
      `${label} is not a valid amount: ${amount.assetCode} ${amount.value} (scale ${amount.assetScale})`,
    );
  }
}

/** Open Payments to COMPAS. A malformed value fails closed. */
export function toMoneyAmount(
  amount: OpenPaymentsAmount,
  label = "amount",
): MoneyAmount {
  assertAmount(amount, label);
  return {
    value: amount.value,
    assetCode: amount.assetCode,
    assetScale: amount.assetScale,
  };
}

/** COMPAS to Open Payments. Builds a fresh object so no extra field leaks. */
export function toOpenPaymentsAmount(
  amount: MoneyAmount,
  label = "amount",
): OpenPaymentsAmount {
  assertAmount(amount, label);
  return {
    value: amount.value,
    assetCode: amount.assetCode,
    assetScale: amount.assetScale,
  };
}

/** Throws ASSET_MISMATCH unless the amount uses the wallet's asset. */
export function assertWalletAsset(
  amount: MoneyAmount,
  wallet: { walletAddressUrl: string; assetCode: string; assetScale: number },
  label: string,
): void {
  if (
    amount.assetCode !== wallet.assetCode ||
    amount.assetScale !== wallet.assetScale
  ) {
    throw new OpenPaymentsGatewayError(
      "ASSET_MISMATCH",
      `${label} uses ${amount.assetCode}/${amount.assetScale}, but ${wallet.walletAddressUrl} uses ${wallet.assetCode}/${wallet.assetScale}. COMPAS does not convert amounts. A quote does.`,
    );
  }
}

const SAFE_METADATA_KEYS = [
  "compasMandateId",
  "compasDecisionId",
  "externalReference",
] as const satisfies readonly (keyof SafePaymentMetadata)[];

const MAX_METADATA_VALUE_LENGTH = 128;

/**
 * Copies only the three opaque COMPAS references. Any other key on the input
 * object is dropped, so a diagnosis or drug name cannot reach Open Payments
 * metadata by accident.
 */
export function toSafeMetadata(
  metadata: SafePaymentMetadata | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;

  const safe: Record<string, string> = {};
  for (const key of SAFE_METADATA_KEYS) {
    const value: unknown = metadata[key];
    if (value === undefined) continue;
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_METADATA_VALUE_LENGTH
    ) {
      throw new OpenPaymentsGatewayError(
        "INVALID_INPUT",
        `metadata.${key} must be a non-empty string of at most ${MAX_METADATA_VALUE_LENGTH} characters`,
      );
    }
    safe[key] = value;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

/**
 * Open Payments has no status on an outgoing payment. It has `failed`,
 * `debitAmount` and `sentAmount`. This is the COMPAS reading of them.
 */
export function deriveOutgoingPaymentState(payment: {
  failed: boolean;
  debitAmount: OpenPaymentsAmount;
  sentAmount: OpenPaymentsAmount;
}): PaymentState {
  if (payment.failed) return "FAILED";
  const sent = BigInt(payment.sentAmount.value);
  const debit = BigInt(payment.debitAmount.value);
  return sent >= debit ? "COMPLETED" : "PENDING";
}
