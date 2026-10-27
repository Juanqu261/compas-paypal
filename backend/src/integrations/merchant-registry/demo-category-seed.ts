import { createHash, generateKeyPairSync, type JsonWebKey, type KeyObject, sign } from "node:crypto";
import type {
  IngestCategoryClaimInput,
  IngestionResult,
} from "../../application/ingest-category-claim.ts";

/**
 * demo/test data. PayPal merchant ids in PayPal's format that name no PayPal
 * account: COMPAS can evaluate a purchase there, but PayPal refuses the order
 * (PAYEE_ACCOUNT_INVALID). The medication and alcohol fixtures in
 * data/fixtures/demo use these ids.
 */
export const DEMO_DROGUERIA_PAYPAL_ID = "DEMPHARMACY22";
export const DEMO_LIQUOR_PAYPAL_ID = "DEMLAGERBAR22";

export const DEMO_KEY_REF = "nequi-negocios-sim";
const MERCHANT_SOURCE = "nequi-negocios-sim/merchant";
const KYB_SOURCE = "nequi-negocios-sim/kyb";

export type DemoSigningKey = { publicKeyJwk: JsonWebKey; privateKey: KeyObject };

/** Generated at startup and kept in memory. Never written to disk or committed. */
export function generateDemoSigningKey(): DemoSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKeyJwk: publicKey.export({ format: "jwk" }), privateKey };
}

/**
 * The demo arc's lookalike pharmacy: it declares MEDICATION itself and nobody
 * attests it. Its catalog is mostly gift cards, which the analyst flags.
 */
export const DEMO_LOOKALIKE_PAYPAL_ID = "DEMCENTRALL22";

/** A tienda de barrio: self-declared only, no registry, no KYB. Its history is in demo-history-seed.ts. */
export const DEMO_TIENDA_PAYPAL_ID = "DEMTENDAGLRA2";

/**
 * A configured sandbox account can change between starts. A persistent trust
 * log keeps the first body under a submission id, so the slug names the
 * account: a new one gets its own submissions instead of being refused as a reused id.
 */
function sandboxSlug(prefix: string, paypalMerchantId: string): string {
  return `${prefix}-${createHash("sha256").update(paypalMerchantId).digest("hex").slice(0, 12)}`;
}

type DemoMerchant = {
  slug: string;
  paypalMerchantId: string;
  declared: string;
  /** Absent: the simulated wallet attests nothing. */
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
  /** A real PayPal sandbox business account, when configured. It gets Droguería Central's evidence. */
  sandboxMerchantId?: string;
  /** A second sandbox business account, when configured. It gets the liquor store's evidence. */
  sandboxLiquorId?: string;
  now?: Date;
}): Promise<number> {
  const observedAt = (options.now ?? new Date()).toISOString();
  const merchants: DemoMerchant[] = [
    { slug: "drogueria-central", paypalMerchantId: DEMO_DROGUERIA_PAYPAL_ID, declared: "MEDICATION", ciiu: "4773" },
    { slug: "example-liquor", paypalMerchantId: DEMO_LIQUOR_PAYPAL_ID, declared: "ALCOHOL", ciiu: "4724" },
    { slug: "tienda-dona-gloria", paypalMerchantId: DEMO_TIENDA_PAYPAL_ID, declared: "FOOD" },
    { slug: "drogueria-centrall", paypalMerchantId: DEMO_LOOKALIKE_PAYPAL_ID, declared: "MEDICATION" },
  ];
  if (options.sandboxMerchantId) {
    merchants.push({
      slug: sandboxSlug("paypal-sandbox-merchant", options.sandboxMerchantId),
      paypalMerchantId: options.sandboxMerchantId,
      declared: "MEDICATION",
      ciiu: "4773",
    });
  }
  if (options.sandboxLiquorId) {
    merchants.push({
      slug: sandboxSlug("paypal-sandbox-liquor", options.sandboxLiquorId),
      paypalMerchantId: options.sandboxLiquorId,
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
      subject: { kind: "PAYPAL_MERCHANT", paypalMerchantId: merchant.paypalMerchantId },
      declaredCategories: [merchant.declared],
      observedAt,
    },
    ...(merchant.ciiu
      ? [{
          schemaVersion: "1",
          sourceId: KYB_SOURCE,
          submissionId: `demo-kyb-${merchant.slug}`,
          type: "CATEGORY_CLAIM",
          subject: { kind: "PAYPAL_MERCHANT", paypalMerchantId: merchant.paypalMerchantId },
          codes: [{ system: "CIIU_REV4_AC", code: merchant.ciiu, role: "PRIMARY" }],
          observedAt,
          evidenceRef: "demo-kyb-rut",
        }]
      : []),
  ]);

  // Counts entries this start added. A persistent log keeps earlier ones.
  let recorded = 0;
  for (const submission of submissions) {
    const body = new TextEncoder().encode(JSON.stringify(submission));
    const signature = sign(null, body, options.key.privateKey).toString("base64url");
    const result = await options.ingest({ body, signature, transport: "PUSH" });
    // A persistent trust log already holds this submission from an earlier start,
    // with an older observedAt. The first one stands.
    if (!result.ok && result.code === "SUBMISSION_ID_REUSED") continue;
    if (!result.ok) {
      throw new Error(`Demo category seed rejected ${submission.submissionId}: ${result.code} ${result.message}`);
    }
    if (!result.duplicate) recorded += 1;
  }
  return recorded;
}
