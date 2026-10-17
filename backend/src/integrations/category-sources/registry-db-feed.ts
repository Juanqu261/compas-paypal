import { normalizeNit } from "../../domain/merchant-identifiers.ts";
import type { BusinessRegistryLookup, RegistryMerchantRecord } from "../../ports/business-registry-lookup.ts";
import type { CategoryEvidenceFeed } from "../../ports/category-evidence-feed.ts";

const UNSAFE_ID_CHARS = /[^A-Za-z0-9._:-]/g;

/**
 * The matrícula is believed to be renewable until 31 March of the following
 * year. Unverified: check against the Código de Comercio and each Cámara.
 * End of 31 March in Colombia (UTC-5) is 1 April 05:00 UTC.
 */
export function renewalDeadline(lastRenewalYear: number): string {
  return new Date(Date.UTC(lastRenewalYear + 1, 3, 1, 5, 0, 0)).toISOString();
}

/** One submission id per matrícula and renewal, so a refresh with no change is idempotent. */
export function registrySubmissionId(record: Pick<RegistryMerchantRecord, "camara" | "matricula" | "lastRenewalYear">): string {
  return `rdb:${record.camara}:${record.matricula}:${record.lastRenewalYear}`.replace(UNSAFE_ID_CHARS, "-");
}

/**
 * Pull adapter over the Cámara de Comercio registry database. It turns
 * registry rows into ordinary submissions, which go through
 * ingestCategoryClaim like any other evidence.
 *
 * Trust follows provenance, not the table: one feed per provenance, each
 * registered as its own source with its own trust level. A row from another
 * provenance is skipped.
 *
 * - ACTIVE and inside its renewal: a CATEGORY_CLAIM about the NIT, with roles kept.
 * - INACTIVE or CANCELLED: a REVOCATION of this source's claim for that renewal.
 * - ACTIVE but past its renewal deadline: nothing. Earlier claims expire on their own.
 *
 * Registry evidence is keyed by NIT. It reaches a wallet only through an
 * IDENTITY_BINDING, and a self-declared binding caps it at SELF_DECLARED.
 */
export class RegistryDbFeed implements CategoryEvidenceFeed {
  readonly sourceId: string;
  readonly #provenance: string;
  readonly #lookup: BusinessRegistryLookup;

  constructor(options: { sourceId: string; provenance: string; lookup: BusinessRegistryLookup }) {
    this.sourceId = options.sourceId;
    this.#provenance = options.provenance;
    this.#lookup = options.lookup;
  }

  async lookupByTaxId(taxId: string): Promise<readonly unknown[]> {
    const nit = normalizeNit(taxId);
    if (!nit) throw new Error("Not a valid NIT.");
    const records = await this.#lookup.findByNit(nit);
    return records.flatMap((record) => (record.provenance === this.#provenance ? this.#submissionsFor(record, nit) : []));
  }

  #submissionsFor(record: RegistryMerchantRecord, nit: string): Record<string, unknown>[] {
    const submissionId = registrySubmissionId(record);
    const base = { schemaVersion: "1", sourceId: this.sourceId };

    if (record.status !== "ACTIVE") {
      return [{
        ...base,
        submissionId: `${submissionId}:revoked`,
        type: "REVOCATION",
        revokesSubmissionId: submissionId,
        reason: `matrícula ${record.status.toLowerCase()} in the registry`,
      }];
    }

    const validUntil = renewalDeadline(record.lastRenewalYear);
    const observedAt = new Date(record.snapshotAt).toISOString();
    if (Date.parse(validUntil) <= Date.parse(observedAt)) return [];

    return [{
      ...base,
      submissionId,
      type: "CATEGORY_CLAIM",
      subject: { kind: "TAX_ID", taxId: nit },
      codes: record.activities.map((activity) => ({
        system: "CIIU_REV4_AC",
        code: activity.ciiu,
        role: activity.role,
      })),
      observedAt,
      validUntil,
      evidenceRef: `${record.camara}:${record.matricula}`.slice(0, 128),
    }];
  }
}
