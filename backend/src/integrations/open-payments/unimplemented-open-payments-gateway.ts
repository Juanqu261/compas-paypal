import type {
  GrantContinuation,
  IncomingPaymentRef,
  OpenPaymentsGateway,
  OutgoingPaymentRef,
  PaymentStatus,
  QuoteRef,
  WalletAddressInfo,
} from "../../ports/open-payments-gateway";
import { notImplemented } from "../../lib/not-implemented";

/**
 * Placeholder adapter. Every method rejects.
 * Do not replace a rejection with a fabricated wallet, grant, quote, or payment.
 */
export class UnimplementedOpenPaymentsGateway implements OpenPaymentsGateway {
  resolveWallet(): Promise<WalletAddressInfo> {
    return notImplemented("OpenPaymentsGateway.resolveWallet");
  }

  requestGrant(): Promise<GrantContinuation> {
    return notImplemented("OpenPaymentsGateway.requestGrant");
  }

  continueGrant(): Promise<GrantContinuation> {
    return notImplemented("OpenPaymentsGateway.continueGrant");
  }

  createIncomingPayment(): Promise<IncomingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.createIncomingPayment");
  }

  createQuote(): Promise<QuoteRef> {
    return notImplemented("OpenPaymentsGateway.createQuote");
  }

  createOutgoingPayment(): Promise<OutgoingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.createOutgoingPayment");
  }

  readPaymentStatus(): Promise<PaymentStatus> {
    return notImplemented("OpenPaymentsGateway.readPaymentStatus");
  }
}
