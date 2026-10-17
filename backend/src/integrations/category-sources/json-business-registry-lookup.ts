import { readFileSync } from "node:fs";
import { normalizeCategoryCode, normalizeNit } from "../../domain/merchant-identifiers.ts";
import type { BusinessRegistryLookup, RegistryMerchantRecord } from "../../ports/business-registry-lookup.ts";
import { MERCHANT_REGISTRY_FILE } from "../merchant-registry/data-paths.ts";

/** Provenance of rows from the Confecámaras RUES open data extract. Register one source for it. */
export const RUES_OPEN_DATA_PROVENANCE = "datos-gov-co/nb3d-v3n7";

type SeedFile = {
  source: { establishments: { updatedAt: string } };
  filter: { status: string; lastRenewedYear: number };
  records: readonly {
    registryKey: string;
    ciiu: { primary: string; secondary: readonly string[] };
    owner: { type: "PERSONA_NATURAL" } | { type: "PERSONA_JURIDICA"; nit: string; checkDigit: string };
  }[];
};

/**
 * BusinessRegistryLookup over data/seeds/merchant-registry/rues-medellin.json,
 * a sample of the Confecámaras RUES extract. Only shops owned by a company
 * carry a NIT there, so a natural person's NIT finds nothing. An empty result
 * means "not in the sample", not "not registered".
 *
 * Each establishment is its own record, so a chain's NIT returns all of its
 * shops in the sample, whatever their CIIU codes.
 */
export class JsonBusinessRegistryLookup implements BusinessRegistryLookup {
  readonly #byNit = new Map<string, RegistryMerchantRecord[]>();

  constructor(file: string = MERCHANT_REGISTRY_FILE) {
    const seed = JSON.parse(readFileSync(file, "utf8")) as SeedFile;
    if (seed.filter?.status !== "ACTIVA") throw new Error(`${file}: expected an ACTIVA extract`);
    if (!Number.isInteger(seed.filter.lastRenewedYear)) throw new Error(`${file}: lastRenewedYear missing`);
    const snapshotAt = new Date(seed.source.establishments.updatedAt).toISOString();

    for (const row of seed.records) {
      if (row.owner.type !== "PERSONA_JURIDICA") continue;
      const nit = normalizeNit(`${row.owner.nit}-${row.owner.checkDigit}`);
      if (!nit) throw new Error(`${file}: ${row.registryKey} has an invalid NIT`);
      const codes = [row.ciiu.primary, ...row.ciiu.secondary];
      if (codes.some((code) => normalizeCategoryCode("CIIU_REV4_AC", code) === undefined)) {
        throw new Error(`${file}: ${row.registryKey} has a malformed CIIU code`);
      }
      const [camara, matricula] = row.registryKey.split("-");
      const record: RegistryMerchantRecord = {
        nit,
        matricula,
        camara,
        status: "ACTIVE",
        lastRenewalYear: seed.filter.lastRenewedYear,
        activities: [
          { ciiu: row.ciiu.primary, role: "PRIMARY" },
          ...row.ciiu.secondary.map((ciiu) => ({ ciiu, role: "SECONDARY" as const })),
        ],
        snapshotAt,
        provenance: RUES_OPEN_DATA_PROVENANCE,
      };
      this.#byNit.set(nit, [...(this.#byNit.get(nit) ?? []), record]);
    }
  }

  async findByNit(normalizedNit: string): Promise<readonly RegistryMerchantRecord[]> {
    return this.#byNit.get(normalizedNit) ?? [];
  }
}
