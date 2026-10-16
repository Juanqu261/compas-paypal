import type { MerchantProfile } from "./merchant";
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
  merchant: MerchantProfile;
  lineItems: readonly PurchaseLineItem[];
  amount: MoneyAmount;
  createdAt: string;
};
