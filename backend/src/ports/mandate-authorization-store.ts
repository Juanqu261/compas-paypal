/**
 * COMPAS's own record of where a mandate's payer authorization stands.
 * It holds no token. The grant itself, and every secret, stays in the
 * gateway's GrantStore. This record only says what COMPAS asked for and what
 * the provider confirmed.
 */
export type ConsentState =
  /** COMPAS never asked the payer's wallet for a grant. */
  | "NOT_STARTED"
  /** The grant was requested. The payer has not finished consent at their wallet. */
  | "WAITING_FOR_PAYER"
  /** The finish callback verified the interaction and the auth server issued an access token. */
  | "GRANTED";

export type GrantCancellationState =
  /** No grant was ever requested, so nothing to cancel at the provider. */
  | "NOT_NEEDED"
  /** COMPAS already blocks the mandate. The provider has not confirmed the cancellation yet. */
  | "PENDING"
  /** The provider cancelled the grant, or it no longer exists there. */
  | "DONE";

export type MandateAuthorizationRecord = {
  mandateId: string;
  consent: ConsentState;
  /** Set when the mandate is revoked. */
  grantCancellation?: GrantCancellationState;
  /** The last gateway error for this mandate: an error code, never a token or a raw payload. */
  lastError?: { operation: "AUTHORIZE" | "CANCEL"; code: string; at: string };
  updatedAt: string;
};

export interface MandateAuthorizationStore {
  get(mandateId: string): Promise<MandateAuthorizationRecord | undefined>;
  put(record: MandateAuthorizationRecord): Promise<void>;
}
