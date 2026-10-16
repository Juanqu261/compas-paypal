import type { MoneyAmount } from "../domain/money";

/**
 * Public wallet-address information COMPAS needs from Open Payments.
 * This is a port shape, not a live response.
 */
export type WalletAddressInfo = {
  walletAddressUrl: string;
  authServer: string;
  resourceServer: string;
  assetCode?: string;
  assetScale?: number;
};

export type OpenPaymentsAccessType =
  | "incoming-payment"
  | "quote"
  | "outgoing-payment";

export type GrantAccessRequest = {
  type: OpenPaymentsAccessType;
  actions: readonly string[];
};

export type GrantRequest = {
  walletAddressUrl: string;
  access: readonly GrantAccessRequest[];
};

export type GrantContinuation = {
  status: "pending" | "granted";
  continueUrl?: string;
  interactRedirectUrl?: string;
};

export type CreateIncomingPaymentInput = {
  resourceServer: string;
  walletAddressUrl: string;
  incomingAmount?: MoneyAmount;
};

export type IncomingPaymentRef = {
  url: string;
};

export type CreateQuoteInput = {
  resourceServer: string;
  walletAddressUrl: string;
  incomingPaymentUrl: string;
};

export type QuoteRef = {
  url: string;
  debitAmount?: MoneyAmount;
  receiveAmount?: MoneyAmount;
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

export type CreateOutgoingPaymentInput = {
  resourceServer: string;
  walletAddressUrl: string;
  quoteUrl: string;
  metadata?: SafePaymentMetadata;
};

export type OutgoingPaymentRef = {
  url: string;
  status: string;
};

export type PaymentStatus = {
  url: string;
  status: string;
};

/**
 * Shields the COMPAS domain from the Interledger Open Payments SDK.
 * No method in this scaffold performs a network call.
 */
export interface OpenPaymentsGateway {
  resolveWallet(walletAddressUrl: string): Promise<WalletAddressInfo>;
  requestGrant(input: GrantRequest): Promise<GrantContinuation>;
  continueGrant(continueUrl: string): Promise<GrantContinuation>;
  createIncomingPayment(
    input: CreateIncomingPaymentInput,
  ): Promise<IncomingPaymentRef>;
  createQuote(input: CreateQuoteInput): Promise<QuoteRef>;
  createOutgoingPayment(
    input: CreateOutgoingPaymentInput,
  ): Promise<OutgoingPaymentRef>;
  readPaymentStatus(outgoingPaymentUrl: string): Promise<PaymentStatus>;
}
