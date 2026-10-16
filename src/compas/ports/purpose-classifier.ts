import type { MerchantProfile } from "../domain/merchant";
import type { PurchaseLineItem } from "../domain/purchase";

export type ClassificationResult = {
  category: string;
  /** Confidence from 0 to 1. A low score must not become an ALLOW by itself. */
  confidence: number;
  evidence: string;
};

/**
 * Provider-agnostic fallback classifier.
 * An implementation may describe a category. It must not authorize a payment.
 */
export interface PurposeClassifier {
  classify(input: {
    merchant: MerchantProfile;
    lineItems: readonly PurchaseLineItem[];
  }): Promise<ClassificationResult>;
}
