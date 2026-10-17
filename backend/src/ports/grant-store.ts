/**
 * Server-side state for a payer's outgoing-payment grant, keyed by the
 * COMPAS mandate id. Every token here is a secret. Do not log it, return it
 * over HTTP or write it to data/.
 */
type PayerGrantBase = {
  grantKey: string;
  payerWalletAddressUrl: string;
  resourceServer: string;
  /** Used to cancel the grant. */
  continueUri: string;
  continueAccessToken: string;
};

/** Waiting for the payer to consent at their wallet. */
export type PendingPayerGrant = PayerGrantBase & {
  state: "PENDING";
  /** The grant endpoint the request went to. Part of the finish hash. */
  grantEndpoint: string;
  clientNonce: string;
  /** The auth server's `interact.finish` value. Part of the finish hash. */
  finishNonce: string;
};

/** Consent given. The access token can create outgoing payments. */
export type ActivePayerGrant = PayerGrantBase & {
  state: "ACTIVE";
  accessToken: string;
  manageUrl: string;
  /** ISO timestamp. Absent when the auth server sets no expiry. */
  accessTokenExpiresAt?: string;
};

export type StoredPayerGrant = PendingPayerGrant | ActivePayerGrant;

export interface GrantStore {
  get(grantKey: string): Promise<StoredPayerGrant | undefined>;
  put(grant: StoredPayerGrant): Promise<void>;
  delete(grantKey: string): Promise<void>;
}
