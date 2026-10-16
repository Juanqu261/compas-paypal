import type {
  GrantSpentAmounts,
  IncomingPaymentRef,
  OpenPaymentsGateway,
  OutgoingPaymentRef,
  PayerGrantFinished,
  PayerGrantStarted,
  QuoteRef,
  WalletAddressInfo,
} from "../../ports/open-payments-gateway";
import { notImplemented } from "../../lib/not-implemented.ts";

/**
 * Used when the Open Payments client is not configured. Every method rejects.
 * Do not replace a rejection with a fabricated wallet, grant, quote, or payment.
 */
export class UnimplementedOpenPaymentsGateway implements OpenPaymentsGateway {
  resolveWallet(): Promise<WalletAddressInfo> {
    return notImplemented("OpenPaymentsGateway.resolveWallet");
  }

  startPayerGrant(): Promise<PayerGrantStarted> {
    return notImplemented("OpenPaymentsGateway.startPayerGrant");
  }

  finishPayerGrant(): Promise<PayerGrantFinished> {
    return notImplemented("OpenPaymentsGateway.finishPayerGrant");
  }

  cancelPayerGrant(): Promise<void> {
    return notImplemented("OpenPaymentsGateway.cancelPayerGrant");
  }

  createIncomingPayment(): Promise<IncomingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.createIncomingPayment");
  }

  readIncomingPayment(): Promise<IncomingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.readIncomingPayment");
  }

  createQuote(): Promise<QuoteRef> {
    return notImplemented("OpenPaymentsGateway.createQuote");
  }

  createOutgoingPayment(): Promise<OutgoingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.createOutgoingPayment");
  }

  readOutgoingPayment(): Promise<OutgoingPaymentRef> {
    return notImplemented("OpenPaymentsGateway.readOutgoingPayment");
  }

  readGrantSpentAmounts(): Promise<GrantSpentAmounts> {
    return notImplemented("OpenPaymentsGateway.readGrantSpentAmounts");
  }
}
