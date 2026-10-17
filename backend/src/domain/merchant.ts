import type { ResolvedCategory } from "./merchant-category.ts";

/** Ordered weakest to strongest. The order is used to cap and compare evidence. */
export const MERCHANT_TRUST_LEVELS = [
  "SELF_DECLARED",
  "PROVIDER_VERIFIED",
  "EXTERNAL_VERIFIED",
] as const;

export type MerchantTrustLevel = (typeof MERCHANT_TRUST_LEVELS)[number];

export function trustRank(level: MerchantTrustLevel): number {
  return MERCHANT_TRUST_LEVELS.indexOf(level);
}

export function weakerTrustLevel(
  a: MerchantTrustLevel,
  b: MerchantTrustLevel,
): MerchantTrustLevel {
  return trustRank(a) <= trustRank(b) ? a : b;
}

/**
 * Read model built by the merchant registry from the trust log.
 * A purchase intent never supplies it.
 */
export type MerchantProfile = {
  walletAddressUrl: string;
  displayName?: string;
  categories: readonly ResolvedCategory[];
};
