/**
 * Builds data/seeds/merchant-registry/rues-medellin.json from the RUES open
 * data that Confecámaras publishes on datos.gov.co (CC BY-SA 4.0).
 *
 *   npm run registry:fetch
 *
 * Keeps establishments of the Cámara de Comercio de Medellín para Antioquia
 * that are ACTIVA, renewed in RENEWAL_YEAR, and whose main CIIU code is in
 * data/seeds/category-mappings/ciiu-rev4-ac.json. Each code gets a quota.
 * Rows are ordered by SHA-256 of the registry key, so a re-run against the
 * same dataset version picks the same rows. Confecámaras refreshes the
 * dataset monthly, so a later run can differ.
 *
 * Owners that are companies are joined to the persons dataset by NIT for
 * their name and main CIIU. Owners that are natural persons keep no
 * identifier at all: their NIT is their cédula (Ley 1581 de 2012).
 *
 * This is public registry data, not a COMPAS attestation. It says what a
 * shop registered, not what it sells.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nitCheckDigit } from "../src/domain/merchant-identifiers.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MAPPING_FILE = join(repoRoot, "data/seeds/category-mappings/ciiu-rev4-ac.json");
const OUTPUT_FILE = join(repoRoot, "data/seeds/merchant-registry/rues-medellin.json");

const DATOS = "https://www.datos.gov.co";
const ESTABLISHMENTS = "nb3d-v3n7";
const PERSONS = "c82u-588k";

const CAMARA = "MEDELLIN PARA ANTIOQUIA";
const RENEWAL_YEAR = "2026";
/** Rows kept per main CIIU code. Codes not listed get DEFAULT_QUOTA. */
const QUOTAS: Record<string, number> = { "4773": 900, "4724": 400 };
const DEFAULT_QUOTA = 120;
const PAGE_SIZE = 50_000;
const NIT_BATCH = 100;

type EstablishmentRow = {
  codigo_camara: string;
  matricula: string;
  razon_social?: string;
  categoria_matricula?: string;
  cod_ciiu_act_econ_pri: string;
  cod_ciiu_act_econ_sec?: string;
  ciiu3?: string;
  ciiu4?: string;
  fecha_matricula?: string;
  fecha_renovacion?: string;
  clase_identificacion?: string;
  nit_propietario?: string;
  digito_verificacion?: string;
};

type PersonRow = {
  nit: string;
  razon_social?: string;
  organizacion_juridica?: string;
  cod_ciiu_act_econ_pri?: string;
  estado_matricula?: string;
};

type Owner =
  | { type: "PERSONA_NATURAL" }
  | {
      type: "PERSONA_JURIDICA";
      nit: string;
      checkDigit: string;
      name?: string;
      legalForm?: string;
      ciiuPrimary?: string;
    };

type RegistryRecord = {
  registryKey: string;
  name: string;
  registrationType: string;
  ciiu: { primary: string; secondary: string[] };
  registeredOn?: string;
  renewedOn?: string;
  owner: Owner;
};

async function soql<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`/resource/${dataset}.json`, DATOS);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`${dataset}: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T[];
}

async function datasetUpdatedAt(dataset: string): Promise<string> {
  const response = await fetch(new URL(`/api/views/${dataset}.json`, DATOS), {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${dataset} metadata: HTTP ${response.status}`);
  const view = (await response.json()) as { rowsUpdatedAt: number };
  return new Date(view.rowsUpdatedAt * 1000).toISOString();
}

async function fetchEstablishments(code: string): Promise<EstablishmentRow[]> {
  const rows: EstablishmentRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await soql<EstablishmentRow>(ESTABLISHMENTS, {
      $select: [
        "codigo_camara",
        "matricula",
        "razon_social",
        "categoria_matricula",
        "cod_ciiu_act_econ_pri",
        "cod_ciiu_act_econ_sec",
        "ciiu3",
        "ciiu4",
        "fecha_matricula",
        "fecha_renovacion",
        "clase_identificacion",
        "nit_propietario",
        "digito_verificacion",
      ].join(","),
      $where: [
        `camara_comercio='${CAMARA}'`,
        `estado_matricula='ACTIVA'`,
        `ultimo_ano_renovado='${RENEWAL_YEAR}'`,
        `cod_ciiu_act_econ_pri='${code}'`,
      ].join(" AND "),
      $order: "matricula",
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Active rows first: a NIT can have cancelled rows in other cámaras. */
async function fetchCompanyOwners(nits: string[]): Promise<Map<string, PersonRow>> {
  const owners = new Map<string, PersonRow>();
  for (let i = 0; i < nits.length; i += NIT_BATCH) {
    const batch = nits.slice(i, i + NIT_BATCH);
    const rows = await soql<PersonRow>(PERSONS, {
      $select: "nit,razon_social,organizacion_juridica,cod_ciiu_act_econ_pri,estado_matricula",
      $where: `nit in(${batch.map((nit) => `'${nit}'`).join(",")})`,
      $limit: String(NIT_BATCH * 20),
    });
    for (const row of rows) {
      const current = owners.get(row.nit);
      if (!current || (current.estado_matricula !== "ACTIVA" && row.estado_matricula === "ACTIVA")) {
        owners.set(row.nit, row);
      }
    }
  }
  return owners;
}

function sampleRank(row: EstablishmentRow): string {
  return createHash("sha256").update(registryKey(row)).digest("hex");
}

function registryKey(row: EstablishmentRow): string {
  return `${row.codigo_camara}-${row.matricula}`;
}

/** "20091117" -> "2009-11-17". */
function isoDate(raw: string | undefined): string | undefined {
  return raw && /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}` : undefined;
}

function secondaryCodes(row: EstablishmentRow): string[] {
  const codes = [row.cod_ciiu_act_econ_sec, row.ciiu3, row.ciiu4]
    .map((code) => code?.trim())
    .filter((code): code is string => !!code && /^\d{4}$/.test(code) && code !== row.cod_ciiu_act_econ_pri);
  return [...new Set(codes)];
}

function hasValidNit(row: EstablishmentRow): boolean {
  const nit = row.nit_propietario ?? "";
  return (
    row.clase_identificacion === "NIT" &&
    /^\d{5,15}$/.test(nit) &&
    String(nitCheckDigit(nit)) === row.digito_verificacion
  );
}

function toOwner(row: EstablishmentRow, owners: Map<string, PersonRow>): Owner {
  if (!hasValidNit(row)) return { type: "PERSONA_NATURAL" };
  const company = owners.get(row.nit_propietario!);
  // A NIT row registered as a natural person is a cédula. Keep nothing.
  if (company?.organizacion_juridica === "PERSONA NATURAL") return { type: "PERSONA_NATURAL" };
  return {
    type: "PERSONA_JURIDICA",
    nit: row.nit_propietario!,
    checkDigit: row.digito_verificacion!,
    name: company?.razon_social?.trim(),
    legalForm: company?.organizacion_juridica,
    ciiuPrimary: company?.cod_ciiu_act_econ_pri,
  };
}

function toRecord(row: EstablishmentRow, owners: Map<string, PersonRow>): RegistryRecord {
  return {
    registryKey: registryKey(row),
    name: (row.razon_social ?? "").trim(),
    registrationType: (row.categoria_matricula ?? "").replace(/ /g, "_"),
    ciiu: { primary: row.cod_ciiu_act_econ_pri, secondary: secondaryCodes(row) },
    registeredOn: isoDate(row.fecha_matricula),
    renewedOn: isoDate(row.fecha_renovacion),
    owner: toOwner(row, owners),
  };
}

const mapping = JSON.parse(readFileSync(MAPPING_FILE, "utf8")) as {
  version: string;
  mappings: { code: string }[];
};
const codes = mapping.mappings.map((entry) => entry.code).sort();

const population: Record<string, number> = {};
const sampled: EstablishmentRow[] = [];
for (const code of codes) {
  // A co-owned establishment has one row per owner. Keep the first.
  const unique = new Map<string, EstablishmentRow>();
  for (const row of await fetchEstablishments(code)) {
    if (!unique.has(registryKey(row))) unique.set(registryKey(row), row);
  }
  const rows = [...unique.values()];
  population[code] = rows.length;
  const quota = QUOTAS[code] ?? DEFAULT_QUOTA;
  const ranked = rows.map((row) => ({ row, rank: sampleRank(row) }));
  ranked.sort((a, b) => (a.rank < b.rank ? -1 : 1));
  sampled.push(...ranked.slice(0, quota).map(({ row }) => row));
  console.log(`CIIU ${code}: ${rows.length} active, kept ${Math.min(quota, rows.length)}`);
}

const companyNits = [...new Set(sampled.filter(hasValidNit).map((row) => row.nit_propietario!))];
const owners = await fetchCompanyOwners(companyNits);
console.log(`Company owners: ${companyNits.length} NITs, ${owners.size} found in ${PERSONS}`);

const records = sampled
  .map((row) => toRecord(row, owners))
  .sort((a, b) => a.ciiu.primary.localeCompare(b.ciiu.primary) || a.name.localeCompare(b.name));

const header = {
  dataLabel: "public registry extract",
  description:
    "Sample of active establishments registered with the Cámara de Comercio de Medellín para Antioquia, from the RUES open data. It says what each shop registered, not what it sells.",
  source: {
    publisher: "Confecámaras (Registro Único Empresarial y Social, RUES)",
    establishments: {
      dataset: "Establecimientos - Agencias - Sucursales",
      url: `${DATOS}/d/${ESTABLISHMENTS}`,
      updatedAt: await datasetUpdatedAt(ESTABLISHMENTS),
    },
    owners: {
      dataset: "Personas Naturales, Personas Jurídicas y Entidades Sin Animo de Lucro",
      url: `${DATOS}/d/${PERSONS}`,
      updatedAt: await datasetUpdatedAt(PERSONS),
    },
    license: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)",
    fetchedAt: new Date().toISOString(),
  },
  filter: {
    camara: CAMARA,
    status: "ACTIVA",
    lastRenewedYear: Number(RENEWAL_YEAR),
    primaryCiiu: codes,
    ciiuMappingVersion: mapping.version,
  },
  sampling: {
    method: "Per main CIIU code, rows ordered by SHA-256 of registryKey, first N kept.",
    quotas: Object.fromEntries(codes.map((code) => [code, QUOTAS[code] ?? DEFAULT_QUOTA])),
  },
  population,
  privacy:
    "Owners that are natural persons keep no identifier, because their NIT is their cédula. Company NITs are kept. Legal representatives are not included.",
  notes: [
    "registryKey is the cámara code and the matrícula. It is a registry id, not a wallet address.",
    "A CIIU code is registered activity, not proof of what a shop sells. 4773 also covers cosmetics and toiletries.",
    "This file is evidence input. It does not bind any shop to an Open Payments wallet.",
  ],
};

const json = JSON.stringify(header, null, 2).replace(
  /\n}$/,
  `,\n  "records": [\n${records.map((record) => `    ${JSON.stringify(record)}`).join(",\n")}\n  ]\n}\n`,
);
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, json);
console.log(`Wrote ${records.length} records to ${OUTPUT_FILE}`);
