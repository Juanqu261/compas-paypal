import type { MoneyAmount } from "../domain/money";

/**
 * Public wallet-address information COMPAS needs from Open Payments.
 */
export type WalletAddressInfo = {
  walletAddressUrl: string;
  authServer: string;
  resourceServer: string;
  assetCode: string;
  assetScale: number;
};

/**
 * Metadata that is safe to send to Open Payments.
 * Health details and other sensitive purpose data do not belong here.
 */
export type SafePaymentMetadata = {
  compasMandateId?: string;
  compasDecisionId?: string;
  externalReference?: string;
};

export type StartPayerGrantInput = {
  /** The COMPAS mandate id. Callers refer to the grant by this key only. */
  grantKey: string;
  payerWalletAddressUrl: string;
  /** Mandate budget. Must use the payer wallet's asset. */
  debitLimit: MoneyAmount;
  /** ISO 8601 repeating interval. Omit for a lifetime cap. */
  interval?: string;
};

export type PayerGrantStarted = {
  /** Where to send the payer to consent at their own wallet. */
  redirectUrl: string;
};

export type FinishPayerGrantInput = {
  grantKey: string;
  interactRef: string;
  hash: string;
};

export type PayerGrantFinished = {
  status: "GRANTED";
};

export type CreateIncomingPaymentInput = {
  merchantWalletAddressUrl: string;
  /** Must use the merchant wallet's asset. No conversion happens here. */
  incomingAmount: MoneyAmount;
  expiresAt?: string;
  metadata?: SafePaymentMetadata;
};

export type IncomingPaymentRef = {
  url: string;
  walletAddressUrl: string;
  incomingAmount?: MoneyAmount;
  receivedAmount: MoneyAmount;
  completed: boolean;
  expiresAt?: string;
};

export type CreateQuoteInput = {
  payerWalletAddressUrl: string;
  incomingPaymentUrl: string;
};

export type QuoteRef = {
  /** The quote URL. Open Payments calls it the quote id. */
  id: string;
  /** What leaves the payer wallet, fees included, in the payer's asset. */
  debitAmount: MoneyAmount;
  /** What the merchant receives, in the merchant's asset. */
  receiveAmount: MoneyAmount;
  expiresAt?: string;
};

export type CreateOutgoingPaymentInput = {
  /** The payer grant that authorizes this debit. */
  grantKey: string;
  quoteId: string;
  metadata: SafePaymentMetadata;
};

/**
 * Derived by COMPAS. Open Payments has no status field on an outgoing payment.
 * COMPLETED means sentAmount reached debitAmount. A receiver-side check uses
 * readIncomingPayment.
 */
export type PaymentState = "PENDING" | "COMPLETED" | "FAILED";

export type OutgoingPaymentRef = {
  url: string;
  state: PaymentState;
  receiverUrl: string;
  debitAmount: MoneyAmount;
  receiveAmount: MoneyAmount;
  sentAmount: MoneyAmount;
  createdAt: string;
};

export type ReadOutgoingPaymentInput = {
  grantKey: string;
  outgoingPaymentUrl: string;
};

export type GrantSpentAmounts = {
  spentDebitAmount?: MoneyAmount;
  spentReceiveAmount?: MoneyAmount;
};

/**
 * Shields the COMPAS domain from the Interledger Open Payments SDK.
 * Access tokens, continuation tokens and nonces never cross this boundary.
 *
 * createOutgoingPayment must only be reached through
 * createOutgoingPaymentIfAllowed after policy returns ALLOW.
 */
export interface OpenPaymentsGateway {
  resolveWallet(walletAddressUrl: string): Promise<WalletAddressInfo>;
  startPayerGrant(input: StartPayerGrantInput): Promise<PayerGrantStarted>;
  finishPayerGrant(input: FinishPayerGrantInput): Promise<PayerGrantFinished>;
  cancelPayerGrant(grantKey: string): Promise<void>;
  createIncomingPayment(
    input: CreateIncomingPaymentInput,
  ): Promise<IncomingPaymentRef>;
  readIncomingPayment(incomingPaymentUrl: string): Promise<IncomingPaymentRef>;
  createQuote(input: CreateQuoteInput): Promise<QuoteRef>;
  createOutgoingPayment(
    input: CreateOutgoingPaymentInput,
  ): Promise<OutgoingPaymentRef>;
  readOutgoingPayment(
    input: ReadOutgoingPaymentInput,
  ): Promise<OutgoingPaymentRef>;
  readGrantSpentAmounts(grantKey: string): Promise<GrantSpentAmounts>;
}
