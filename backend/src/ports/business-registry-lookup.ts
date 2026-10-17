/**
 * PROVISIONAL. This is our assumption about the Cámara de Comercio registry
 * database being built on another branch, not its real schema. When the real
 * contract lands, change this type, RegistryDbFeed and its test fixtures.
 * Nothing else in the backend reads it. See contracts/merchant-registry/README.md.
 */
export type RegistryMerchantRecord = {
  /** NIT, with or without the check digit. Passed only to the adapter, never stored raw. */
  nit: string;
  /** Matrícula mercantil number. */
  matricula: string;
  /** The Cámara that holds the matrícula, for example "CCMA". */
  camara: string;
  status: "ACTIVE" | "INACTIVE" | "CANCELLED";
  /** Last year the matrícula was renewed. */
  lastRenewalYear: number;
  /** One main CIIU Rev. 4 A.C. activity plus up to three secondary ones. */
  activities: readonly { ciiu: string; role: "PRIMARY" | "SECONDARY" }[];
  /** When this row was captured from its origin. */
  snapshotAt: string;
  /** How the row was obtained, for example "rues-lookup" or a dataset name and version. */
  provenance: string;
};

export interface BusinessRegistryLookup {
  /** Every registered business with this NIT. The NIT is the normalized base, without the check digit. */
  findByNit(normalizedNit: string): Promise<readonly RegistryMerchantRecord[]>;
}
