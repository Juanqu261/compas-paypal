import { createHmac } from "node:crypto";

/**
 * Turns a payer or delegate id into an opaque reference for the observation
 * log. Medication purchase patterns are health-adjacent personal data under
 * Ley 1581 de 2012, so the log never holds a party id. The prefix keeps these
 * refs apart from NIT subject refs made with the same key.
 */
export type PartyRefFn = (partyId: string) => string;

export function createPartyRefFn(key: string | Buffer): PartyRefFn {
  if (key.length < 32) {
    throw new Error("The party HMAC key must be at least 32 characters.");
  }
  return (partyId) => createHmac("sha256", key).update(`PARTY:${partyId}`).digest("base64url");
}
