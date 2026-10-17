import type { CategoryEvidenceFeed } from "../ports/category-evidence-feed.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "./ingest-category-claim.ts";

export type RefreshResult = {
  /** Entries appended, or already present with the same body. */
  recorded: number;
  /** Revocations of a claim this source never made. Nothing to undo. */
  nothingToRevoke: number;
  rejected: readonly { submissionId: string; code: string; message: string }[];
};

/**
 * Looks a NIT up in a pull source and ingests what it returns through the one
 * ingestion path. Run it when a merchant binds a NIT and again before its
 * claims expire. The trust log, not the registry, is the record decisions read.
 */
export async function refreshRegistryEvidence(
  taxId: string,
  deps: {
    feed: CategoryEvidenceFeed;
    ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
  },
): Promise<RefreshResult> {
  const submissions = await deps.feed.lookupByTaxId(taxId);
  let recorded = 0;
  let nothingToRevoke = 0;
  const rejected: { submissionId: string; code: string; message: string }[] = [];

  for (const submission of submissions) {
    const body = new TextEncoder().encode(JSON.stringify(submission));
    const result = await deps.ingest({ body, transport: "PULL" });
    if (result.ok) {
      recorded += 1;
    } else if (result.code === "REVOCATION_TARGET_NOT_FOUND") {
      nothingToRevoke += 1;
    } else {
      const submissionId = (submission as { submissionId?: unknown }).submissionId;
      rejected.push({ submissionId: String(submissionId), code: result.code, message: result.message });
    }
  }
  return { recorded, nothingToRevoke, rejected };
}
