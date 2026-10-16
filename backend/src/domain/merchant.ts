export const MERCHANT_TRUST_LEVELS = [
  "SELF_DECLARED",
  "PROVIDER_VERIFIED",
  "EXTERNAL_VERIFIED",
] as const;

export type MerchantTrustLevel = (typeof MERCHANT_TRUST_LEVELS)[number];

export type MerchantCategoryClaim = {
  category: string;
  trustLevel: MerchantTrustLevel;
  /** Opaque evidence reference. Not a medical record. */
  evidenceRef?: string;
};

export type MerchantProfile = {
  id: string;
  displayName: string;
  categoryClaims: readonly MerchantCategoryClaim[];
};
