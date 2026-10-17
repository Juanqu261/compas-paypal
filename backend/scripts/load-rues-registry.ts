/**
 * Loads data/seeds/merchant-registry/rues-medellin.json into
 * compas.registry_companies and compas.registry_establishments.
 *
 *   DATABASE_ADMIN_URL=postgres://... npm run registry:load
 *
 * The backend role can only read the registry, so this needs the owner
 * connection string (Supabase: the `postgres` user). Re-running updates rows
 * in place. Rows dropped from a newer extract are left as they were.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { RUES_OPEN_DATA_PROVENANCE } from "../src/integrations/category-sources/json-business-registry-lookup.ts";
import { MERCHANT_REGISTRY_FILE } from "../src/integrations/merchant-registry/data-paths.ts";

type SeedFile = {
  source: { establishments: { updatedAt: string } };
  filter: { status: string; lastRenewedYear: number };
  records: {
    registryKey: string;
    name: string;
    registrationType: string;
    ciiu: { primary: string; secondary: string[] };
    registeredOn?: string;
    renewedOn?: string;
    owner:
      | { type: "PERSONA_NATURAL" }
      | {
          type: "PERSONA_JURIDICA";
          nit: string;
          checkDigit: string;
          name?: string;
          legalForm?: string;
          ciiuPrimary?: string;
        };
  }[];
};

const url = process.env.DATABASE_ADMIN_URL?.trim();
if (!url) throw new Error("Set DATABASE_ADMIN_URL to the owner connection string.");

const seed = JSON.parse(readFileSync(MERCHANT_REGISTRY_FILE, "utf8")) as SeedFile;
if (seed.filter.status !== "ACTIVA") throw new Error("Expected an ACTIVA extract.");
const snapshotAt = seed.source.establishments.updatedAt;

const companies = new Map<string, Record<string, unknown>>();
const establishments = seed.records.map((record) => {
  const [camara, matricula] = record.registryKey.split("-");
  const owner = record.owner;
  if (owner.type === "PERSONA_JURIDICA" && !companies.has(owner.nit)) {
    companies.set(owner.nit, {
      nit: owner.nit,
      check_digit: Number(owner.checkDigit),
      name: owner.name ?? null,
      legal_form: owner.legalForm ?? null,
      ciiu_primary: owner.ciiuPrimary ?? null,
      snapshot_at: snapshotAt,
    });
  }
  return {
    camara,
    matricula,
    name: record.name,
    registration_type: record.registrationType,
    status: "ACTIVE",
    ciiu_primary: record.ciiu.primary,
    ciiu_secondary: record.ciiu.secondary,
    registered_on: record.registeredOn ?? null,
    renewed_on: record.renewedOn ?? null,
    last_renewal_year: seed.filter.lastRenewedYear,
    owner_type: owner.type,
    owner_nit: owner.type === "PERSONA_JURIDICA" ? owner.nit : null,
    provenance: RUES_OPEN_DATA_PROVENANCE,
    snapshot_at: snapshotAt,
  };
});

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    await tx`
      insert into compas.registry_companies (nit, check_digit, name, legal_form, ciiu_primary, snapshot_at)
      select * from jsonb_to_recordset(${tx.json([...companies.values()] as never)}::jsonb) as x(
        nit text, check_digit smallint, name text, legal_form text, ciiu_primary text, snapshot_at timestamptz)
      on conflict (nit) do update set
        check_digit = excluded.check_digit, name = excluded.name, legal_form = excluded.legal_form,
        ciiu_primary = excluded.ciiu_primary, snapshot_at = excluded.snapshot_at`;
    await tx`
      insert into compas.registry_establishments
        (camara, matricula, name, registration_type, status, ciiu_primary, ciiu_secondary, registered_on,
         renewed_on, last_renewal_year, owner_type, owner_nit, provenance, snapshot_at)
      select * from jsonb_to_recordset(${tx.json(establishments as never)}::jsonb) as x(
        camara text, matricula text, name text, registration_type text, status text, ciiu_primary text,
        ciiu_secondary text[], registered_on date, renewed_on date, last_renewal_year smallint,
        owner_type text, owner_nit text, provenance text, snapshot_at timestamptz)
      on conflict (camara, matricula) do update set
        name = excluded.name, registration_type = excluded.registration_type, status = excluded.status,
        ciiu_primary = excluded.ciiu_primary, ciiu_secondary = excluded.ciiu_secondary,
        registered_on = excluded.registered_on, renewed_on = excluded.renewed_on,
        last_renewal_year = excluded.last_renewal_year, owner_type = excluded.owner_type,
        owner_nit = excluded.owner_nit, provenance = excluded.provenance, snapshot_at = excluded.snapshot_at`;
  });
  console.log(`Loaded ${companies.size} companies and ${establishments.length} establishments (snapshot ${snapshotAt}).`);
} finally {
  await sql.end({ timeout: 5 });
}
