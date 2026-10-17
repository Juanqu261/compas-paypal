import { generateKeyPairSync, type JsonWebKey, type KeyObject, sign } from "node:crypto";
import type {
  IngestCategoryClaimInput,
  IngestionResult,
} from "../../application/ingest-category-claim.ts";

/**
 * demo/test data. Wallets on the reserved example domain. They are not real wallets.
 * The medication and alcohol fixtures in data/fixtures/demo use these addresses.
 */
export const DEMO_DROGUERIA_WALLET = "https://wallet.example/demo-drogueria-central";
export const DEMO_LIQUOR_WALLET = "https://wallet.example/demo-example-liquor";

export const DEMO_KEY_REF = "nequi-negocios-sim";
const MERCHANT_SOURCE = "nequi-negocios-sim/merchant";
const KYB_SOURCE = "nequi-negocios-sim/kyb";

export type DemoSigningKey = { publicKeyJwk: JsonWebKey; privateKey: KeyObject };

/** Generated at startup and kept in memory. Never written to disk or committed. */
export function generateDemoSigningKey(): DemoSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKeyJwk: publicKey.export({ format: "jwk" }), privateKey };
}

/** A tienda de barrio: self-declared only, no registry, no KYB. Its history is in demo-history-seed.ts. */
export const DEMO_TIENDA_WALLET = "https://wallet.example/demo-tienda-dona-gloria";

type DemoMerchant = {
  slug: string;
  walletAddressUrl: string;
  declared: string;
  /** Absent: the wallet attests nothing. */
  ciiu?: string;
};

/**
 * Walks the trust ladder for the demo, through the real ingestion path with
 * real signatures: the merchant self-declares, then the simulated wallet
 * attests the CIIU code from the RUT it saw at KYB.
 */
export async function seedDemoMerchantCategories(options: {
  ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
  key: DemoSigningKey;
  /** The real test-network merchant wallet, when configured. It gets Droguería Central's evidence. */
  testNetworkMerchantWallet?: string;
  /** A second real test-network wallet, when configured. It gets the liquor store's evidence. */
  testNetworkLiquorWallet?: string;
  now?: Date;
}): Promise<number> {
  const observedAt = (options.now ?? new Date()).toISOString();
  const merchants: DemoMerchant[] = [
    { slug: "drogueria-central", walletAddressUrl: DEMO_DROGUERIA_WALLET, declared: "MEDICATION", ciiu: "4773" },
    { slug: "example-liquor", walletAddressUrl: DEMO_LIQUOR_WALLET, declared: "ALCOHOL", ciiu: "4724" },
    { slug: "tienda-dona-gloria", walletAddressUrl: DEMO_TIENDA_WALLET, declared: "FOOD" },
  ];
  if (options.testNetworkMerchantWallet) {
    merchants.push({
      slug: "test-network-merchant",
      walletAddressUrl: options.testNetworkMerchantWallet,
      declared: "MEDICATION",
      ciiu: "4773",
    });
  }
  if (options.testNetworkLiquorWallet) {
    merchants.push({
      slug: "test-network-liquor",
      walletAddressUrl: options.testNetworkLiquorWallet,
      declared: "ALCOHOL",
      ciiu: "4724",
    });
  }

  const submissions = merchants.flatMap((merchant) => [
    {
      schemaVersion: "1",
      sourceId: MERCHANT_SOURCE,
      submissionId: `demo-self-declared-${merchant.slug}`,
      type: "CATEGORY_CLAIM",
      subject: { kind: "WALLET_ADDRESS", walletAddressUrl: merchant.walletAddressUrl },
      declaredCategories: [merchant.declared],
      observedAt,
    },
    ...(merchant.ciiu
      ? [{
          schemaVersion: "1",
          sourceId: KYB_SOURCE,
          submissionId: `demo-kyb-${merchant.slug}`,
          type: "CATEGORY_CLAIM",
          subject: { kind: "WALLET_ADDRESS", walletAddressUrl: merchant.walletAddressUrl },
          codes: [{ system: "CIIU_REV4_AC", code: merchant.ciiu, role: "PRIMARY" }],
          observedAt,
          evidenceRef: "demo-kyb-rut",
        }]
      : []),
  ]);

  for (const submission of submissions) {
    const body = new TextEncoder().encode(JSON.stringify(submission));
    const signature = sign(null, body, options.key.privateKey).toString("base64url");
    const result = await options.ingest({ body, signature, transport: "PUSH" });
    if (!result.ok) {
      throw new Error(`Demo category seed rejected ${submission.submissionId}: ${result.code} ${result.message}`);
    }
  }
  return submissions.length;
}
