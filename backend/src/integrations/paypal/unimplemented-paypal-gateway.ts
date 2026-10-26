import { notImplemented } from "../../lib/not-implemented.ts";
import type { PayPalGateway, PayPalOrder } from "../../ports/paypal-gateway.ts";

/**
 * Used when the PayPal app is not configured. Every method rejects.
 * Do not replace a rejection with a fabricated order or capture.
 */
export class UnimplementedPayPalGateway implements PayPalGateway {
  createOrder(): Promise<PayPalOrder> {
    return notImplemented("PayPalGateway.createOrder");
  }

  getOrder(): Promise<PayPalOrder> {
    return notImplemented("PayPalGateway.getOrder");
  }

  captureOrder(): Promise<PayPalOrder> {
    return notImplemented("PayPalGateway.captureOrder");
  }
}
