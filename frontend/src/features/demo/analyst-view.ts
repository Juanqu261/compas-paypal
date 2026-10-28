import type { AnalystFinding, AnalyzedSku } from "../compas/api/contracts.ts";

/**
 * How /demo tells what the AI analyst found. Views only: a finding never
 * decides a payment, and the backend's checkout reads the trust log itself.
 */

export type StandingFlag = Extract<AnalystFinding, { kind: "JUDGMENT" }>;

/** The flags that still hold the category: open or answered, not withdrawn by a person. */
export function standingFlags(findings: readonly AnalystFinding[]): StandingFlag[] {
  return findings.filter((finding): finding is StandingFlag => finding.kind === "JUDGMENT" && finding.status !== "WITHDRAWN");
}

/** The analyst's record for a merchant: the latest mapping per SKU, and the flags that stand. */
export function analystRecord(findings: readonly AnalystFinding[]): {
  verified: number;
  rejected: number;
  flags: StandingFlag[];
  lastRecordedAt?: string;
} {
  const latest = new Map<string, "VERIFIED" | "REJECTED">();
  let lastRecordedAt: string | undefined;
  for (const finding of findings) {
    if (finding.kind === "POINTER" && finding.pointer === "CUM_MAPPING") latest.set(finding.skuId, finding.outcome);
    if (!lastRecordedAt || finding.recordedAt > lastRecordedAt) lastRecordedAt = finding.recordedAt;
  }
  const outcomes = [...latest.values()];
  return {
    verified: outcomes.filter((outcome) => outcome === "VERIFIED").length,
    rejected: outcomes.filter((outcome) => outcome === "REJECTED").length,
    flags: standingFlags(findings),
    ...(lastRecordedAt ? { lastRecordedAt } : {}),
  };
}

export const ITEM_CLASS_LABEL: Record<AnalyzedSku["itemClass"], string> = {
  MEDICINE: "Medicine",
  NOT_MEDICINE: "Not a medicine",
  UNSURE: "Unsure",
};

/** What INVIMA's record said about the CUM Claude picked. Nothing picked, nothing checked. */
export function invimaLabel(sku: AnalyzedSku): { text: string; tone: "ok" | "stop" | "none" } {
  if (sku.outcome === "VERIFIED") return { text: "INVIMA confirms", tone: "ok" };
  if (sku.outcome === "REJECTED") return { text: "INVIMA doesn’t match", tone: "stop" };
  return { text: sku.itemClass === "MEDICINE" ? "No CUM picked" : "Nothing to check", tone: "none" };
}

export const JUDGMENT_TITLE: Record<StandingFlag["judgment"], string> = {
  CATALOG_OFF_PURPOSE: "Too much of the catalog isn’t medicine",
  LOOKALIKE_SIGNALS: "Looks like it imitates another pharmacy",
};

/** Plain English for a run that didn't complete. The backend gives an error's name only. */
export function runFailureText(code: string): string {
  switch (code) {
    case "ANALYST_JOBS_DISABLED":
      return "Analyst runs are turned off on this backend (COMPAS_ANALYST_JOBS).";
    case "BACKEND_UNAVAILABLE":
    case "TIMEOUT":
      return "The COMPAS backend isn’t answering.";
    case "NotImplementedError":
      return "Elastic or the analyst’s model isn’t configured on the backend.";
    case "AnalystOutputError":
      return "Claude’s answer didn’t pass the parser, so the run failed closed and wrote nothing.";
    default:
      return `The run failed (${code}).`;
  }
}
