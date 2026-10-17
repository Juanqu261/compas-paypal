import type { CompasCategory, ConfidenceMinimum, CreateMandateBody, Enforcement, Money } from "../api/contracts";
import { minorGreaterThan, parseAmountInput } from "./amounts.ts";
import { addDays, endOfDayIso, startOfDayIso, toDateInput, windowProblem } from "./dates.ts";

/**
 * The create-budget wizard's state and its UX checks. The backend validates
 * everything again and is the only authority. These checks only stop an
 * obviously incomplete step from moving on.
 */

export const WIZARD_STEPS = ["contact", "budget", "confirm"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  contact: "Contacto",
  budget: "Presupuesto",
  confirm: "Confirmar",
};

/** Whole units. The backend enforces the same ceiling. */
export const MAX_BUDGET_WHOLE_UNITS = 10_000;

/** Quick choices for how long a budget lasts, in days. A date input covers the rest. */
export const DURATIONS = [
  { days: 7, label: "1 semana" },
  { days: 30, label: "1 mes" },
  { days: 90, label: "3 meses" },
] as const;

export type WizardDraft = {
  /**
   * The one person who receives the budget. The contract still has a
   * delegate and a beneficiary; this screen sends the same person as both,
   * and never adds someone the payer did not choose.
   */
  contactId: string;
  categories: CompasCategory[];
  amount: string;
  startDate: string;
  endDate: string;
  enforcement: Enforcement;
  monitoredAcknowledged: boolean;
  confidence: ConfidenceMinimum;
  capAmount: string;
};

export type Asset = { assetCode: string; assetScale: number };

export type StepIssue = { field: keyof WizardDraft; message: string };

/** Nobody and no category is chosen for the payer. The rules start at their safest. */
export function initialDraft(dates: { startDate: string; endDate: string }): WizardDraft {
  return {
    contactId: "",
    categories: [],
    amount: "",
    startDate: dates.startDate,
    endDate: dates.endDate,
    enforcement: "ENFORCED",
    monitoredAcknowledged: false,
    confidence: "HIGH",
    capAmount: "",
  };
}

/** A start of today and an end `days` later, as date inputs. */
export function datesFor(days: number, today = new Date()): { startDate: string; endDate: string } {
  return { startDate: toDateInput(today), endDate: toDateInput(addDays(today, days)) };
}

function amountIssue(raw: string, asset: Asset, field: keyof WizardDraft): StepIssue | undefined {
  const parsed = parseAmountInput(raw, asset.assetScale);
  if (parsed.ok) return undefined;
  const message =
    parsed.reason === "EMPTY"
      ? "Escribe un monto."
      : parsed.reason === "TOO_MANY_DECIMALS"
        ? `Usa como máximo ${asset.assetScale} decimales.`
        : parsed.reason === "NOT_POSITIVE"
          ? "El monto debe ser mayor que cero."
          : "Escribe solo números, por ejemplo 40 o 40,50.";
  return { field, message };
}

export function stepIssues(step: WizardStep, draft: WizardDraft, asset: Asset, today: Date): StepIssue[] {
  const issues: StepIssue[] = [];
  if (step === "contact" && !draft.contactId) {
    issues.push({ field: "contactId", message: "Elige quién recibe el presupuesto." });
  }
  if (step === "budget") {
    const issue = amountIssue(draft.amount, asset, "amount");
    if (issue) issues.push(issue);
    else {
      const parsed = parseAmountInput(draft.amount, asset.assetScale);
      const max = `${MAX_BUDGET_WHOLE_UNITS}${"0".repeat(asset.assetScale)}`;
      if (parsed.ok && minorGreaterThan(parsed.minorUnits, max)) {
        issues.push({ field: "amount", message: `El máximo es ${MAX_BUDGET_WHOLE_UNITS.toLocaleString("es-CO")} ${asset.assetCode}.` });
      }
    }
    if (draft.categories.length === 0) issues.push({ field: "categories", message: "Elige al menos una categoría." });
    const problem = windowProblem(draft.startDate, draft.endDate, today);
    if (problem === "INVALID_DATE") issues.push({ field: "endDate", message: "Elige hasta cuándo." });
    if (problem === "STARTS_IN_PAST") issues.push({ field: "startDate", message: "No puede empezar antes de hoy." });
    if (problem === "ENDS_BEFORE_START") issues.push({ field: "endDate", message: "Debe terminar después de empezar." });
    if (problem === "ENDS_IN_PAST") issues.push({ field: "endDate", message: "Esa fecha ya pasó." });
    if (problem === "TOO_LONG") issues.push({ field: "endDate", message: "Puede durar hasta un año." });
    if (draft.enforcement === "MONITORED" && !draft.monitoredAcknowledged) {
      issues.push({ field: "monitoredAcknowledged", message: "Confirma que entiendes el modo «Permitir y avisarme»." });
    }
    if (draft.confidence !== "HIGH" && draft.capAmount.trim()) {
      const capIssue = amountIssue(draft.capAmount, asset, "capAmount");
      if (capIssue) issues.push(capIssue);
      else {
        const cap = parseAmountInput(draft.capAmount, asset.assetScale);
        const budget = parseAmountInput(draft.amount, asset.assetScale);
        if (cap.ok && budget.ok && minorGreaterThan(cap.minorUnits, budget.minorUnits)) {
          issues.push({ field: "capAmount", message: "El límite por compra no puede superar el presupuesto." });
        }
      }
    }
  }
  return issues;
}

/** The request the backend validates. The payer is not in it: the backend takes it from the session. */
export function toCreateBody(draft: WizardDraft, asset: Asset): CreateMandateBody | undefined {
  const amount = parseAmountInput(draft.amount, asset.assetScale);
  const validFrom = startOfDayIso(draft.startDate);
  const expiresAt = endOfDayIso(draft.endDate);
  if (!draft.contactId || !amount.ok || !validFrom || !expiresAt) return undefined;
  const budget: Money = { value: amount.minorUnits, assetCode: asset.assetCode, assetScale: asset.assetScale };

  let maxDebitBelowHigh: Money | undefined;
  if (draft.confidence !== "HIGH" && draft.capAmount.trim()) {
    const cap = parseAmountInput(draft.capAmount, asset.assetScale);
    if (!cap.ok) return undefined;
    maxDebitBelowHigh = { ...budget, value: cap.minorUnits };
  }

  return {
    // One person: the one who pays is the one the budget is for.
    delegateId: draft.contactId,
    beneficiaryId: draft.contactId,
    categories: draft.categories,
    budget,
    validFrom,
    expiresAt,
    enforcement: draft.enforcement,
    ...(draft.enforcement === "MONITORED" ? { monitoredAcknowledged: draft.monitoredAcknowledged } : {}),
    merchantConfidence: {
      minimum: draft.confidence,
      ...(maxDebitBelowHigh ? { maxDebitBelowHigh } : {}),
    },
  };
}

/** Which step a backend field error belongs to, so the wizard can send the person back there. */
export function stepForField(field: string): WizardStep {
  if (field.startsWith("delegate") || field.startsWith("beneficiary")) return "contact";
  if (
    field.startsWith("categories") ||
    field.startsWith("budget") ||
    field === "validFrom" ||
    field === "expiresAt" ||
    field.startsWith("merchantConfidence") ||
    field.startsWith("enforcement") ||
    field === "monitoredAcknowledged"
  ) {
    return "budget";
  }
  return "confirm";
}

/** Contacts whose name contains every word typed, ignoring case and accents. */
export function searchContacts<T extends { displayName: string }>(people: readonly T[], query: string): T[] {
  const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  return people.filter((person) => {
    const name = fold(person.displayName);
    return words.every((word) => name.includes(word));
  });
}
