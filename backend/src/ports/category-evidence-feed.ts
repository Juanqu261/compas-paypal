/**
 * Pull adapter for one evidence source, such as RUES or a territorial health
 * registry. It returns raw submissions. Every submission goes through
 * ingestCategoryClaim, exactly like a push.
 *
 * The raw NIT is passed only here, at lookup time. The trust log stores an HMAC.
 */
export interface CategoryEvidenceFeed {
  readonly sourceId: string;
  lookupByTaxId(taxId: string): Promise<readonly unknown[]>;
}
