/**
 * PayPal resource ids associated with a COMPAS decision.
 * Values are references, not copies of payment payloads.
 */
export type PayPalResourceRefs = {
  orderId?: string;
  captureId?: string;
};

export type AuditEvent = {
  id: string;
  type: string;
  occurredAt: string;
  mandateId?: string;
  decisionId?: string;
  actorId?: string;
  paypalRefs?: PayPalResourceRefs;
  payload: Readonly<Record<string, string>>;
};
