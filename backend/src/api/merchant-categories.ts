import type { IncomingMessage } from "node:http";
import type {
  IngestCategoryClaimInput,
  IngestionErrorCode,
  IngestionResult,
} from "../application/ingest-category-claim.ts";
import { normalizePayPalAccountId } from "../domain/merchant-identifiers.ts";
import type { CategorySourceRegistry } from "../ports/category-source-registry.ts";
import type { MerchantRegistry } from "../ports/merchant-registry.ts";

export const MERCHANT_CATEGORY_CLAIMS_PATH = "/merchant-category-claims";
export const MERCHANT_CATEGORIES_PATH = "/merchants/categories";
export { CLAIM_SIGNATURE_HEADER } from "../integrations/merchant-registry/claim-signature.ts";

/** A claim is small. Anything larger is refused before it is parsed. */
export const MAX_CLAIM_BODY_BYTES = 16 * 1024;

export type JsonResponse = { status: number; body: Record<string, unknown> };

const STATUS_BY_ERROR: Record<IngestionErrorCode, number> = {
  INVALID_SUBMISSION: 400,
  INVALID_CODE: 400,
  INVALID_IDENTIFIER: 400,
  UNKNOWN_SOURCE: 401,
  BAD_SIGNATURE: 401,
  EVIDENCE_NOT_ALLOWED: 403,
  SUBMISSION_ID_REUSED: 409,
  REVOCATION_TARGET_NOT_FOUND: 422,
};

export class BodyTooLargeError extends Error {}

export async function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new BodyTooLargeError(`body exceeds ${maxBytes} bytes`);
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * POST /merchant-category-claims. Push ingestion from wallet nodes and other
 * push sources. There is no session: the source's signature is the authentication.
 */
export async function handleIngestCategoryClaim(
  body: Uint8Array,
  signature: string | undefined,
  deps: { ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult> },
): Promise<JsonResponse> {
  const result = await deps.ingest({
    body,
    ...(signature ? { signature } : {}),
    transport: "PUSH",
  });
  if (!result.ok) {
    return { status: STATUS_BY_ERROR[result.code], body: { error: result.code, message: result.message } };
  }
  return result.duplicate
    ? { status: 200, body: { entryId: result.entryId, duplicate: true } }
    : { status: 202, body: { entryId: result.entryId } };
}

/**
 * GET /merchants/categories?paypalMerchantId=<id>. COMPAS categories, trust
 * levels and source ids. Never subject refs, entry ids or raw identifiers.
 */
export async function handleGetMerchantCategories(
  requestUrl: URL,
  deps: { registry: MerchantRegistry; sources: CategorySourceRegistry },
): Promise<JsonResponse> {
  const raw = requestUrl.searchParams.get("paypalMerchantId");
  const paypalMerchantId = raw ? normalizePayPalAccountId(raw) : undefined;
  if (!paypalMerchantId) {
    return {
      status: 400,
      body: { error: "INVALID_PAYPAL_MERCHANT_ID", message: "paypalMerchantId must be a PayPal merchant id" },
    };
  }

  return { status: 200, body: await merchantCategoryView(paypalMerchantId, deps) };
}

/**
 * A merchant's categories as the category routes show them. A view, not a
 * policy decision. Never subject refs, entry ids or raw identifiers.
 */
export async function merchantCategoryView(
  paypalMerchantId: string,
  deps: { registry: MerchantRegistry; sources: CategorySourceRegistry },
): Promise<Record<string, unknown>> {
  const resolution = await deps.registry.resolve(paypalMerchantId);
  const simulatedSources = new Set<string>();
  for (const sourceId of new Set(resolution.categories.flatMap((category) => category.sourceIds))) {
    if ((await deps.sources.getById(sourceId))?.simulated) simulatedSources.add(sourceId);
  }

  const categories = resolution.categories.map((resolved) => ({
    category: resolved.category,
    trustLevel: resolved.trustLevel,
    sourceIds: resolved.sourceIds,
    simulated: resolved.sourceIds.some((sourceId) => simulatedSources.has(sourceId)),
  }));

  return {
    ...(simulatedSources.size > 0 ? { dataLabel: "demo/test data" } : {}),
    paypalMerchantId: resolution.paypalMerchantId,
    categories,
    declarations: resolution.declarations.map(({ category, corroboration }) => ({ category, corroboration })),
    conflicts: resolution.conflicts.map((conflict) => ({ categories: conflict.categories })),
    flaggedCategories: [...new Set(resolution.flags.map((flag) => flag.category))],
    unmappedEvidence: resolution.unmappedEvidence,
    mappingVersion: resolution.mappingVersion,
    resolvedAt: resolution.resolvedAt,
  };
}
