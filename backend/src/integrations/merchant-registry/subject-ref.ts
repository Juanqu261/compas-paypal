import { createHmac, randomBytes } from "node:crypto";

/**
 * Turns a normalized NIT into an opaque subject reference.
 * A sole proprietor's NIT is their cédula plus a check digit, which is
 * personal data under Ley 1581 de 2012. The trust log keeps only this HMAC.
 */
export type SubjectRefFn = (normalizedNit: string) => string;

export function createSubjectRefFn(key: string | Buffer): SubjectRefFn {
  if (key.length < 32) {
    throw new Error("MERCHANT_SUBJECT_HMAC_KEY must be at least 32 characters.");
  }
  return (normalizedNit) =>
    createHmac("sha256", key).update(`CO_NIT:${normalizedNit}`).digest("base64url");
}

/** For a process whose trust log lives in memory. Refs do not survive a restart, and neither does the log. */
export function ephemeralSubjectRefKey(): Buffer {
  return randomBytes(32);
}
