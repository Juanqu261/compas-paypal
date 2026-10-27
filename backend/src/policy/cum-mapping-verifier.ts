import type { CumIngredient, CumRecord } from "../domain/cum.ts";
import type { CatalogMappingCheck } from "../domain/merchant-catalog.ts";

/**
 * Deterministic check that a merchant's SKU text describes a CUM. No AI and
 * no I/O: the caller reads the CUM from the source (INVIMA's dataset) and
 * passes the record in. Every rule fails closed: a record the rules can't
 * read, such as an ingredient written as "X 6.935 MG EQUIVALENTE A Y", is
 * REJECTED, never guessed.
 */
export const CUM_VERIFIER_VERSION = "cum-verifier.2";

/** Salt and hydrate words. "LOSARTAN POTASICO" is checked as "LOSARTAN". */
const SALT_WORDS = new Set([
  "ACETATO", "ANHIDRA", "ANHIDRO", "BESILATO", "BROMHIDRATO", "BROMURO", "CALCICO", "CALCIO", "CITRATO",
  "CLORHIDRATO", "CLORURO", "DE", "DIHIDRATO", "FOSFATO", "FUMARATO", "HEMIHIDRATO", "HIDROCLORURO",
  "MAGNESICO", "MALEATO", "MESILATO", "MONOHIDRATO", "POTASICO", "POTASIO", "SAL", "SODICA", "SODICO",
  "SODIO", "SUCCINATO", "SULFATO", "TARTRATO", "TRIHIDRATO", "Y",
]);

/** Names INVIMA uses next to the name a shop may write instead. */
const INGREDIENT_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  ACETAMINOFEN: ["PARACETAMOL"],
};

const UNITS: Readonly<Record<string, string>> = {
  MG: "MG", G: "G", GR: "G", MCG: "MCG", UG: "MCG", ML: "ML", UI: "UI", IU: "UI", "%": "%",
};

/** A CUM form family, and the words a shop writes for it. */
const FORM_FAMILIES: readonly { family: string; cumPrefixes: readonly string[]; skuWords: readonly string[] }[] = [
  { family: "TABLET", cumPrefixes: ["TABLETA", "COMPRIMIDO"], skuWords: ["TABLETA", "TABLETAS", "TAB", "TABS", "COMPRIMIDO", "COMPRIMIDOS", "COMP", "GRAGEA", "GRAGEAS"] },
  { family: "CAPSULE", cumPrefixes: ["CAPSULA"], skuWords: ["CAPSULA", "CAPSULAS", "CAP", "CAPS"] },
  { family: "SYRUP", cumPrefixes: ["JARABE"], skuWords: ["JARABE"] },
  { family: "SUSPENSION", cumPrefixes: ["SUSPENSION"], skuWords: ["SUSPENSION"] },
  { family: "CREAM", cumPrefixes: ["CREMA"], skuWords: ["CREMA"] },
  { family: "GEL", cumPrefixes: ["GEL"], skuWords: ["GEL"] },
  { family: "OINTMENT", cumPrefixes: ["UNGUENTO"], skuWords: ["UNGUENTO"] },
];

const COUNT_WORDS = "TABLETAS|TABLETA|TABS|TAB|CAPSULAS|CAPSULA|CAPS|COMPRIMIDOS|COMP|GRAGEAS|SOBRES|UNIDADES|UND|UN";

/** Upper case, no accents, µ as MC, decimal commas as points, punctuation as spaces (except "." "/" "%"). */
export function foldText(text: string): string {
  return text
    .replace(/[µμ]/g, "MC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^A-Z0-9./%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(folded: string): Set<string> {
  return new Set(folded.split(" ").map((token) => token.replace(/^\.+|\.+$/g, "")).filter(Boolean));
}

/** "50.0000" -> "50", "12.50" -> "12.5". Undefined when it is not a plain decimal. */
function normalizeAmount(amount: string): string | undefined {
  const cleaned = amount.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return cleaned.includes(".") ? cleaned.replace(/0+$/, "").replace(/\.$/, "") : cleaned.replace(/^0+(?=\d)/, "");
}

function normalizeUnit(unit: string): string | undefined {
  return UNITS[unit.trim().replace(/\.$/, "").toUpperCase()];
}

/** Every "50 mg", "50mg", "50/12.5 mg" in the SKU text, as amounts with their unit. */
function strengthsInText(folded: string): { amounts: string[]; unit: string }[] {
  const found: { amounts: string[]; unit: string }[] = [];
  const pattern = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*(MG|GR|G|MCG|UG|ML|UI|IU|%)(?![A-Z])/g;
  for (const match of folded.matchAll(pattern)) {
    const unit = normalizeUnit(match[2]);
    const amounts = match[1].split("/").map((part) => normalizeAmount(part)).filter((part): part is string => !!part);
    if (unit && amounts.length > 0) found.push({ amounts, unit });
  }
  return found;
}

function ingredientWords(ingredient: CumIngredient): string[] | undefined {
  const folded = foldText(ingredient.name);
  // A name with digits or "EQUIVALENTE" carries a strength or a conversion. Not checkable.
  if (/\d/.test(folded) || folded.includes("EQUIVALENTE")) return undefined;
  const words = folded.split(" ").filter((word) => word && !SALT_WORDS.has(word));
  return words.length > 0 ? words : undefined;
}

function checkIngredients(record: CumRecord, skuTokens: Set<string>): CatalogMappingCheck {
  if (record.ingredients.length === 0) {
    return { check: "INGREDIENTS", passed: false, detail: "the CUM record lists no active ingredient" };
  }
  for (const ingredient of record.ingredients) {
    const words = ingredientWords(ingredient);
    if (!words) return { check: "INGREDIENTS", passed: false, detail: `"${ingredient.name}" is not checkable` };
    const named = words.every(
      (word) => skuTokens.has(word) || (INGREDIENT_SYNONYMS[word] ?? []).some((synonym) => skuTokens.has(synonym)),
    );
    if (!named) return { check: "INGREDIENTS", passed: false, detail: `the SKU does not name ${words.join(" ")}` };
  }
  return { check: "INGREDIENTS", passed: true, detail: record.ingredients.map((ingredient) => ingredient.name).join(" + ") };
}

function checkStrengths(record: CumRecord, folded: string): CatalogMappingCheck {
  const stated = strengthsInText(folded);
  for (const ingredient of record.ingredients) {
    const amount = normalizeAmount(ingredient.amount);
    const unit = normalizeUnit(ingredient.unit);
    if (!amount || !unit) {
      return { check: "STRENGTHS", passed: false, detail: `"${ingredient.amount} ${ingredient.unit}" is not checkable` };
    }
    if (!stated.some((strength) => strength.unit === unit && strength.amounts.includes(amount))) {
      return { check: "STRENGTHS", passed: false, detail: `the SKU does not state ${amount} ${unit.toLowerCase()}` };
    }
  }
  return {
    check: "STRENGTHS",
    passed: true,
    detail: record.ingredients.map((ingredient) => `${normalizeAmount(ingredient.amount)} ${ingredient.unit}`).join(" + "),
  };
}

function checkForm(record: CumRecord, skuTokens: Set<string>): CatalogMappingCheck {
  const cumForm = foldText(record.form);
  const family = FORM_FAMILIES.find((candidate) => candidate.cumPrefixes.some((prefix) => cumForm.startsWith(prefix)));
  if (!family) return { check: "FORM", passed: false, detail: `form "${record.form}" is not checkable` };
  const named = family.skuWords.some((word) => skuTokens.has(word));
  return named
    ? { check: "FORM", passed: true, detail: `${record.form} (${family.family})` }
    : { check: "FORM", passed: false, detail: `the SKU does not say ${family.family.toLowerCase()}` };
}

/** Only when the SKU states a count ("x 30", "30 tabletas") must it equal the CUM's units. */
function checkPresentation(record: CumRecord, folded: string): CatalogMappingCheck {
  const counts = [
    ...folded.matchAll(/(?:^|\s)X\s*(\d{1,4})(?!\s*(?:MG|G|MCG|ML|%))(?![\d.])/g),
    ...folded.matchAll(new RegExp(`(?:^|\\s)(\\d{1,4})\\s*(?:${COUNT_WORDS})(?![A-Z])`, "g")),
  ].map((match) => Number(match[1]));
  if (counts.length === 0) return { check: "PRESENTATION", passed: true, detail: "the SKU states no count" };
  if (!record.presentationUnits) {
    return { check: "PRESENTATION", passed: false, detail: "the SKU states a count, the CUM record none" };
  }
  return counts.includes(record.presentationUnits)
    ? { check: "PRESENTATION", passed: true, detail: `${record.presentationUnits} units` }
    : { check: "PRESENTATION", passed: false, detail: `the SKU states ${counts.join("/")}, the CUM ${record.presentationUnits}` };
}

/** A free medical sample ("MUESTRA MÉDICA") is not for sale, so no shop's SKU is one. */
function checkNotASample(record: CumRecord): CatalogMappingCheck {
  return /\bMUESTRA MEDICA\b/.test(foldText(record.presentation ?? ""))
    ? { check: "NOT_A_SAMPLE", passed: false, detail: "the CUM is a free medical sample (muestra médica), not for sale" }
    : { check: "NOT_A_SAMPLE", passed: true, detail: "a commercial presentation" };
}

export type CumVerification = {
  status: "VERIFIED" | "REJECTED";
  checks: readonly CatalogMappingCheck[];
  verifierVersion: string;
};

/**
 * Pure. Every check runs and is returned, so a rejection says why. VERIFIED
 * only when the CUM exists, is active with a valid registration, is not a
 * free sample, and the SKU names every ingredient, strength and the form.
 */
export function verifyCumMapping(skuText: string, record: CumRecord | undefined): CumVerification {
  if (!record) {
    return {
      status: "REJECTED",
      checks: [{ check: "CUM_EXISTS", passed: false, detail: "the source has no such CUM" }],
      verifierVersion: CUM_VERIFIER_VERSION,
    };
  }
  const folded = foldText(skuText);
  const skuTokens = tokens(folded);
  const checks: CatalogMappingCheck[] = [
    { check: "CUM_EXISTS", passed: true, detail: `${record.cum} ${record.product}` },
    { check: "CUM_ACTIVE", passed: record.active, detail: record.active ? "Activo" : "the CUM is not active" },
    {
      check: "REGISTRATION_VALID",
      passed: record.registrationValid,
      detail: record.registrationValid ? "Vigente" : "the sanitary registration is not vigente",
    },
    checkIngredients(record, skuTokens),
    checkStrengths(record, folded),
    checkForm(record, skuTokens),
    checkPresentation(record, folded),
    checkNotASample(record),
  ];
  return {
    status: checks.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    checks,
    verifierVersion: CUM_VERIFIER_VERSION,
  };
}
