import type { Judgment } from "../domain/analyst.ts";
import type { AnalystFindingRepository } from "../ports/analyst-finding-repository.ts";
import { cleanNote } from "./analyst-output.ts";
import type { IngestCategoryClaimInput, IngestionResult } from "./ingest-category-claim.ts";
import { ANALYST_SOURCE_ID } from "./run-merchant-analysis.ts";

const MAX_RESPONSE_LENGTH = 1_000;

export type AppealResult =
  | { ok: true; judgment: Judgment }
  | { ok: false; code: "NOT_FOUND" | "NOT_YOUR_FINDING" | "INVALID_STATE" | "INVALID_TEXT"; message: string };

/**
 * The merchant answers a flag, for example after fixing its catalog. The
 * answer is stored for a reviewer. It changes nothing in the trust log: an
 * answer, like a judgment, can't raise confidence.
 */
export async function respondToJudgment(
  input: { findingId: string; paypalMerchantId: string; text: unknown },
  deps: { findings: AnalystFindingRepository; now?: () => Date },
): Promise<AppealResult> {
  const finding = await deps.findings.get(input.findingId);
  if (!finding || finding.kind !== "JUDGMENT") return { ok: false, code: "NOT_FOUND", message: "No such flag." };
  if (finding.paypalMerchantId !== input.paypalMerchantId) {
    return { ok: false, code: "NOT_YOUR_FINDING", message: "This flag is about another merchant." };
  }
  if (typeof input.text !== "string" || input.text.trim() === "" || input.text.length > MAX_RESPONSE_LENGTH) {
    return { ok: false, code: "INVALID_TEXT", message: `1 to ${MAX_RESPONSE_LENGTH} characters.` };
  }
  const judgment = await deps.findings.updateJudgment(finding.id, ["OPEN", "RESPONDED"], {
    status: "RESPONDED",
    merchantResponse: { text: input.text.trim(), respondedAt: (deps.now?.() ?? new Date()).toISOString() },
  });
  return judgment
    ? { ok: true, judgment }
    : { ok: false, code: "INVALID_STATE", message: "The flag was already withdrawn." };
}

/**
 * A human reviewer withdraws a flag: a REVOCATION from the analyst's source
 * through the one ingestion path. Only a person runs this (an operator
 * script), never the analyst, so a fooled model can't clear a flag.
 */
export async function withdrawJudgment(
  input: { findingId: string; reason: unknown },
  deps: {
    findings: AnalystFindingRepository;
    ingest: (input: IngestCategoryClaimInput) => Promise<IngestionResult>;
    now?: () => Date;
  },
): Promise<AppealResult> {
  const finding = await deps.findings.get(input.findingId);
  if (!finding || finding.kind !== "JUDGMENT") return { ok: false, code: "NOT_FOUND", message: "No such flag." };
  if (finding.status === "WITHDRAWN") return { ok: false, code: "INVALID_STATE", message: "Already withdrawn." };
  const reason = cleanNote(input.reason);
  if (!reason) return { ok: false, code: "INVALID_TEXT", message: "A reason is required." };

  const submission = {
    schemaVersion: "1",
    sourceId: ANALYST_SOURCE_ID,
    submissionId: `withdraw-${finding.flagSubmissionId}`.slice(0, 128),
    type: "REVOCATION",
    revokesSubmissionId: finding.flagSubmissionId,
    reason,
  };
  const result = await deps.ingest({ body: new TextEncoder().encode(JSON.stringify(submission)), transport: "PULL" });
  if (!result.ok) throw new Error(`The trust log refused the withdrawal: ${result.code} ${result.message}`);

  const judgment = await deps.findings.updateJudgment(finding.id, ["OPEN", "RESPONDED"], {
    status: "WITHDRAWN",
    withdrawal: { reason, withdrawnAt: (deps.now?.() ?? new Date()).toISOString(), revocationEntryId: result.entryId },
  });
  return judgment
    ? { ok: true, judgment }
    : { ok: false, code: "INVALID_STATE", message: "The flag changed while it was withdrawn." };
}
