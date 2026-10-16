/**
 * Open Payments resource URLs associated with a COMPAS decision.
 * Values are references, not copies of payment payloads.
 */
export type OpenPaymentsResourceRefs = {
  walletAddressUrl?: string;
  grantUrl?: string;
  incomingPaymentUrl?: string;
  quoteUrl?: string;
  outgoingPaymentUrl?: string;
};

export type AuditEvent = {
  id: string;
  type: string;
  occurredAt: string;
  mandateId?: string;
  decisionId?: string;
  actorId?: string;
  openPaymentsRefs?: OpenPaymentsResourceRefs;
  /**
   * Opaque operational fields only.
   * Do not put diagnoses, medication names, or other health details here
   * if the event may later be mapped into Open Payments metadata.
   */
  payload: Readonly<Record<string, string>>;
};
