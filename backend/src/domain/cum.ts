/**
 * INVIMA's Código Único de Medicamentos. One CUM names one commercial
 * presentation of one sanitary registration: `expediente-consecutivo`, for
 * example "20119982-7". The public dataset is "Código Único de Medicamentos
 * Vigentes" on datos.gov.co (resource i7cb-raxc), one row per active
 * ingredient of a presentation.
 *
 * A CUM is public data about a product. It is health data only once it is
 * tied to a person, as in an errand.
 */

const CUM_PATTERN = /^(\d{1,12})-(\d{1,4})$/;

export type CumIngredient = {
  /** principioactivo, upper case as INVIMA writes it, e.g. "LOSARTAN POTASICO". */
  name: string;
  /** cantidad, as a decimal string, e.g. "50" or "12.5". */
  amount: string;
  /** unidadmedida, e.g. "mg". */
  unit: string;
};

export type CumRecord = {
  cum: string;
  /** producto: the registered product name. */
  product: string;
  ingredients: readonly CumIngredient[];
  /** formafarmaceutica, e.g. "TABLETA RECUBIERTA". */
  form: string;
  atc?: string;
  /** descripcioncomercial: the box, e.g. "CAJA X 30 TABLETAS". */
  presentation?: string;
  /** cantidadcum: units in the presentation. */
  presentationUnits?: number;
  /** estadocum is "Activo". */
  active: boolean;
  /** estadoregistro is "Vigente". */
  registrationValid: boolean;
};

/** A CUM from the search index, before any source confirms it. Never evidence. */
export type CumCandidate = {
  cum: string;
  product: string;
  ingredients: readonly CumIngredient[];
  form: string;
  presentation?: string;
  score: number;
};

/** "20119982-7" from its parts or a typed string. Undefined when malformed. */
export function normalizeCum(value: string): string | undefined {
  const match = CUM_PATTERN.exec(value.trim());
  if (!match) return undefined;
  return `${match[1]}-${Number(match[2])}`;
}

export function cumParts(cum: string): { expediente: string; consecutivo: string } | undefined {
  const normalized = normalizeCum(cum);
  if (!normalized) return undefined;
  const [expediente, consecutivo] = normalized.split("-");
  return { expediente, consecutivo };
}
