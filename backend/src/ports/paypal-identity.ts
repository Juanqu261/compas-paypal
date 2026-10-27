/**
 * Log in with PayPal for merchants. It proves that whoever is at the browser
 * controls PayPal account X, and gives X's verified email. COMPAS uses it to
 * bind a PayPal merchant account to a Cámara de Comercio certificate whose
 * notification email is the same. It moves no money and grants nothing at PayPal.
 */
export type PayPalAccountIdentity = {
  /** The account id PayPal reports. For a business account it must equal the merchant id. */
  payerId: string;
  /** The account's primary email, lower case. */
  email: string;
  /** PayPal reports the email as confirmed. */
  emailConfirmed: boolean;
  /** PayPal reports the account as verified. */
  verifiedAccount: boolean;
};

export interface PayPalIdentityGateway {
  /** Where the browser goes to log in. `state` comes back on the return. */
  authorizeUrl(state: string): string;
  /** Exchanges the return's authorization code for the account's identity. The user's token never leaves the adapter. */
  exchange(code: string): Promise<PayPalAccountIdentity>;
}
