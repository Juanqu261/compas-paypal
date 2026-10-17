import type { CompasCategory, ConfidenceMinimum, CreateMandateBody, Enforcement, Money } from "../api/contracts";
import { minorGreaterThan, parseAmountInput } from "./amounts.ts";
import { endOfDayIso, startOfDayIso, windowProblem } from "./dates.ts";

/**
 * The create-budget wizard's state and its UX checks. The backend validates
 * everything again and is the only authority. These checks only stop an
 * obviously incomplete step from moving on.
 */

export const WIZARD_STEPS = ["participants", "purpose", "budget", "rules", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Whole units. The backend enforces the same ceiling. */
export const MAX_BUDGET_WHOLE_UNITS = 10_000;

export type WizardDraft = {
  delegateId: string;
  beneficiaryId: string;
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

export function initialDraft(defaults: { delegateId?: string; beneficiaryId?: string; startDate: string; endDate: string }): WizardDraft {
  return {
    delegateId: defaults.delegateId ?? "",
    beneficiaryId: defaults.beneficiaryId ?? "",
    categories: ["MEDICATION"],
    amount: "",
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    enforcement: "ENFORCED",
    monitoredAcknowledged: false,
    confidence: "HIGH",
    capAmount: "",
  };
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
  if (step === "participants") {
    if (!draft.delegateId) issues.push({ field: "delegateId", message: "Elige quién podrá hacer las compras." });
    if (!draft.beneficiaryId) issues.push({ field: "beneficiaryId", message: "Elige para quién es el presupuesto." });
  }
  if (step === "purpose" && draft.categories.length === 0) {
    issues.push({ field: "categories", message: "Elige al menos una categoría." });
  }
  if (step === "budget") {
    const issue = amountIssue(draft.amount, asset, "amount");
    if (issue) issues.push(issue);
    else {
      const parsed = parseAmountInput(draft.amount, asset.assetScale);
      const max = `${MAX_BUDGET_WHOLE_UNITS}${"0".repeat(asset.assetScale)}`;
      if (parsed.ok && minorGreaterThan(parsed.minorUnits, max)) {
        issues.push({ field: "amount", message: `El máximo para un presupuesto es ${MAX_BUDGET_WHOLE_UNITS.toLocaleString("es-CO")} ${asset.assetCode}.` });
      }
    }
    const problem = windowProblem(draft.startDate, draft.endDate, today);
    if (problem === "INVALID_DATE") issues.push({ field: "endDate", message: "Elige las dos fechas." });
    if (problem === "STARTS_IN_PAST") issues.push({ field: "startDate", message: "La fecha de inicio no puede ser anterior a hoy." });
    if (problem === "ENDS_BEFORE_START") issues.push({ field: "endDate", message: "La fecha final debe ser posterior a la de inicio." });
    if (problem === "ENDS_IN_PAST") issues.push({ field: "endDate", message: "La fecha final ya pasó." });
    if (problem === "TOO_LONG") issues.push({ field: "endDate", message: "Un presupuesto puede durar hasta un año." });
  }
  if (step === "rules") {
    if (draft.enforcement === "MONITORED" && !draft.monitoredAcknowledged) {
      issues.push({ field: "monitoredAcknowledged", message: "Confirma que entiendes el modo supervisado." });
    }
    if (draft.confidence !== "HIGH" && draft.capAmount.trim()) {
      const issue = amountIssue(draft.capAmount, asset, "capAmount");
      if (issue) issues.push(issue);
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
  if (!amount.ok || !validFrom || !expiresAt) return undefined;
  const budget: Money = { value: amount.minorUnits, assetCode: asset.assetCode, assetScale: asset.assetScale };

  let maxDebitBelowHigh: Money | undefined;
  if (draft.confidence !== "HIGH" && draft.capAmount.trim()) {
    const cap = parseAmountInput(draft.capAmount, asset.assetScale);
    if (!cap.ok) return undefined;
    maxDebitBelowHigh = { ...budget, value: cap.minorUnits };
  }

  return {
    delegateId: draft.delegateId,
    beneficiaryId: draft.beneficiaryId,
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
  if (field.startsWith("delegate") || field.startsWith("beneficiary")) return "participants";
  if (field.startsWith("categories")) return "purpose";
  if (field.startsWith("budget") || field === "validFrom" || field === "expiresAt") return "budget";
  if (field.startsWith("merchantConfidence") || field.startsWith("enforcement") || field === "monitoredAcknowledged") {
    return "rules";
  }
  return "review";
}
