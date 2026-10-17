import type { CategoryEvidenceFeed } from "../../ports/category-evidence-feed.ts";
import { notImplemented } from "../../lib/not-implemented.ts";

/**
 * Placeholder for RUES (Cámaras de Comercio). No API or bulk feed has been
 * found; lookups go one NIT at a time. It must not return fabricated CIIU codes.
 */
export class UnimplementedRuesCiiuFeed implements CategoryEvidenceFeed {
  readonly sourceId = "rues";

  lookupByTaxId(): Promise<readonly unknown[]> {
    return notImplemented("RUES CIIU lookup");
  }
}
