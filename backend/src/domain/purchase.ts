import type { MoneyAmount } from "./money";

export type PurchaseLineItem = {
  id: string;
  description: string;
  category?: string;
  amount: MoneyAmount;
};

export type PurchaseIntent = {
  id: string;
  mandateId: string;
  delegateId: string;
  /**
   * The payee's PayPal merchant id. COMPAS resolves the merchant's
   * categories from it. The intent never carries category evidence.
   */
  paypalMerchantId: string;
  /** Display only. Not evidence. */
  merchantDisplayName?: string;
  lineItems: readonly PurchaseLineItem[];
  amount: MoneyAmount;
  createdAt: string;
};
