import type { BusinessRegistryLookup, RegistryMerchantRecord } from "../../ports/business-registry-lookup.ts";
import { type Database, iso } from "./database.ts";

type EstablishmentRow = {
  camara: string;
  matricula: string;
  status: RegistryMerchantRecord["status"];
  ciiu_primary: string;
  ciiu_secondary: string[];
  last_renewal_year: number;
  owner_nit: string;
  provenance: string;
  snapshot_at: Date;
};

/**
 * BusinessRegistryLookup over compas.registry_establishments, loaded from the
 * Confecámaras RUES extract by `npm run registry:load`. Only company-owned
 * shops carry a NIT, so a natural person's NIT finds nothing.
 */
export class PostgresBusinessRegistryLookup implements BusinessRegistryLookup {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async findByNit(normalizedNit: string): Promise<readonly RegistryMerchantRecord[]> {
    const rows = await this.#sql<EstablishmentRow[]>`
      select camara, matricula, status, ciiu_primary, ciiu_secondary, last_renewal_year, owner_nit,
             provenance, snapshot_at
      from compas.registry_establishments
      where owner_nit = ${normalizedNit}
      order by camara, matricula`;
    return rows.map((row) => ({
      nit: row.owner_nit,
      matricula: row.matricula,
      camara: row.camara,
      status: row.status,
      lastRenewalYear: row.last_renewal_year,
      activities: [
        { ciiu: row.ciiu_primary, role: "PRIMARY" as const },
        ...row.ciiu_secondary.map((ciiu) => ({ ciiu, role: "SECONDARY" as const })),
      ],
      snapshotAt: iso(row.snapshot_at),
      provenance: row.provenance,
    }));
  }
}
