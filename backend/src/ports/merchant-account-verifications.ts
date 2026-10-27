/**
 * What Log in with PayPal proved about a merchant's PayPal account: its
 * verified email, at a time. Kept so a later certificate upload can be
 * bound. Not a session and not a permission.
 */
export type MerchantAccountVerification = {
  paypalMerchantId: string;
  email: string;
  emailConfirmed: boolean;
  verifiedAccount: boolean;
  verifiedAt: string;
};

export interface MerchantAccountVerificationStore {
  put(verification: MerchantAccountVerification): Promise<void>;
  get(paypalMerchantId: string): Promise<MerchantAccountVerification | undefined>;
}
