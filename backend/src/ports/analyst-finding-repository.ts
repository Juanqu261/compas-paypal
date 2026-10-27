import type { AnalystFinding, Judgment } from "../domain/analyst.ts";

/** Every finding the analyst recorded, with its standing and, for judgments, the appeal. */
export interface AnalystFindingRepository {
  append(findings: readonly AnalystFinding[]): Promise<void>;
  get(id: string): Promise<AnalystFinding | undefined>;
  listByMerchant(paypalMerchantId: string): Promise<readonly AnalystFinding[]>;
  /** The OPEN or RESPONDED judgment that holds this flag, if any. */
  findJudgmentByFlag(flagEntryId: string): Promise<Judgment | undefined>;
  /** Conditional: applies only when the judgment is still in `from`. Returns the updated judgment. */
  updateJudgment(id: string, from: readonly Judgment["status"][], change: Partial<Judgment>): Promise<Judgment | undefined>;
}
