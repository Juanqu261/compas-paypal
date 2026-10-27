import { type CumIngredient, type CumRecord, normalizeCum } from "../../domain/cum.ts";

/**
 * INVIMA's "Código Único de Medicamentos Vigentes" on datos.gov.co, through
 * the Socrata API. Field names are the dataset's, checked on 2026-10-27.
 */
export const CUM_DATASET_URL = "https://www.datos.gov.co/resource/i7cb-raxc.json";
export const CUM_DATASET_PROVENANCE = "INVIMA CUM, datos.gov.co i7cb-raxc";

export type CumRow = {
  expedientecum?: string;
  consecutivocum?: string;
  producto?: string;
  principioactivo?: string;
  cantidad?: string;
  unidadmedida?: string;
  formafarmaceutica?: string;
  atc?: string;
  descripcioncomercial?: string;
  cantidadcum?: string;
  estadocum?: string;
  estadoregistro?: string;
};

export function cumOfRow(row: CumRow): string | undefined {
  if (!row.expedientecum || !row.consecutivocum) return undefined;
  return normalizeCum(`${row.expedientecum}-${row.consecutivocum}`);
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Groups ingredient rows into one record per CUM, in first-seen order. A row
 * without a CUM is skipped. Rows of one CUM must agree on the product: the
 * first row's product fields stand.
 */
export function groupCumRows(rows: readonly CumRow[]): CumRecord[] {
  const records = new Map<string, { record: CumRecord; ingredients: CumIngredient[] }>();
  for (const row of rows) {
    const cum = cumOfRow(row);
    if (!cum) continue;
    let entry = records.get(cum);
    if (!entry) {
      const ingredients: CumIngredient[] = [];
      const units = Number(row.cantidadcum);
      entry = {
        ingredients,
        record: {
          cum,
          product: clean(row.producto),
          ingredients,
          form: clean(row.formafarmaceutica).toUpperCase(),
          ...(row.atc ? { atc: clean(row.atc) } : {}),
          ...(row.descripcioncomercial ? { presentation: clean(row.descripcioncomercial) } : {}),
          ...(Number.isInteger(units) && units > 0 ? { presentationUnits: units } : {}),
          active: clean(row.estadocum).toLowerCase() === "activo",
          registrationValid: clean(row.estadoregistro).toLowerCase() === "vigente",
        },
      };
      records.set(cum, entry);
    }
    const name = clean(row.principioactivo).toUpperCase();
    if (name && !entry.ingredients.some((ingredient) => ingredient.name === name)) {
      entry.ingredients.push({ name, amount: clean(row.cantidad), unit: clean(row.unidadmedida).toLowerCase() });
    }
  }
  return [...records.values()].map(({ record }) => record);
}
