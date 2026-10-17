import { createHash, timingSafeEqual } from "node:crypto";

export type InteractionHashInput = {
  /** The nonce COMPAS sent in `interact.finish.nonce`. */
  clientNonce: string;
  /** The `interact.finish` value the auth server returned. */
  finishNonce: string;
  /** The `interact_ref` on the finish redirect. */
  interactRef: string;
  /** The grant endpoint URL the grant request was sent to. */
  grantEndpoint: string;
};

/**
 * SHA-256 over the four values joined by "\n", Base64 encoded.
 * Source: https://openpayments.dev/identity/hash-verification/
 */
export function computeInteractionHash(input: InteractionHashInput): string {
  const data = [
    input.clientNonce,
    input.finishNonce,
    input.interactRef,
    input.grantEndpoint,
  ].join("\n");
  return createHash("sha256").update(data).digest("base64");
}

/**
 * The docs describe Base64 without padding, but their sample keeps it. A query
 * string may also turn "+" into a space, and some servers use the URL-safe
 * alphabet. All of those encode the same bytes, so normalise before comparing.
 */
function normaliseBase64(value: string): string {
  return value
    .trim()
    .replaceAll(" ", "+")
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .replace(/=+$/, "");
}

/** Constant-time check of the `hash` on the finish redirect. */
export function interactionHashMatches(
  input: InteractionHashInput & { receivedHash: string },
): boolean {
  const expected = Buffer.from(
    normaliseBase64(computeInteractionHash(input)),
  );
  const received = Buffer.from(normaliseBase64(input.receivedHash));
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
