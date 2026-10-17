import { createPublicKey, type JsonWebKey, verify } from "node:crypto";

/** Request header that carries the Ed25519 signature over the raw body, base64url. */
export const CLAIM_SIGNATURE_HEADER = "compas-signature";

/**
 * Checks an Ed25519 signature over the exact submission bytes.
 * Signing raw bytes avoids JSON canonicalization.
 * Ed25519 is the key type Open Payments clients already use.
 */
export function verifyClaimSignature(
  body: Uint8Array,
  signature: string,
  publicKeyJwk: JsonWebKey,
): boolean {
  if (publicKeyJwk.kty !== "OKP" || publicKeyJwk.crv !== "Ed25519") return false;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(signature)) return false;
  try {
    const key = createPublicKey({ key: publicKeyJwk, format: "jwk" });
    return verify(null, body, key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}
