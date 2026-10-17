import { notImplemented } from "../../lib/not-implemented.ts";
import type { BusinessRegistryLookup } from "../../ports/business-registry-lookup.ts";

/**
 * Placeholder for the Cámara de Comercio registry database, which another
 * branch is building. It must not return fabricated registry rows.
 */
export class UnimplementedBusinessRegistryLookup implements BusinessRegistryLookup {
  findByNit(): Promise<never> {
    return notImplemented("Cámara de Comercio registry lookup");
  }
}
