import type { CategoryEvidenceFeed } from "../../ports/category-evidence-feed.ts";
import { notImplemented } from "../../lib/not-implemented.ts";

/**
 * Placeholder for a territorial health authority's pharmacy establishment
 * registry. Whether these registries can be queried is unverified.
 */
export class UnimplementedHealthRegistryFeed implements CategoryEvidenceFeed {
  readonly sourceId = "co-health-authority";

  lookupByTaxId(): Promise<readonly unknown[]> {
    return notImplemented("Health authority pharmacy registry lookup");
  }
}
