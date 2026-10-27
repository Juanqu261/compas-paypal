import type { AnalystFinding, Judgment } from "../../domain/analyst.ts";
import type { AnalystFindingRepository } from "../../ports/analyst-finding-repository.ts";

/** In memory. A restart loses findings; the FLAGs they put in the trust log stay. */
export class InMemoryAnalystFindings implements AnalystFindingRepository {
  readonly #findings = new Map<string, AnalystFinding>();

  async append(findings: readonly AnalystFinding[]): Promise<void> {
    for (const finding of findings) {
      if (this.#findings.has(finding.id)) throw new Error(`Finding ${finding.id} is already recorded`);
    }
    for (const finding of findings) this.#findings.set(finding.id, structuredClone(finding));
  }

  async get(id: string): Promise<AnalystFinding | undefined> {
    const finding = this.#findings.get(id);
    return finding ? structuredClone(finding) : undefined;
  }

  async listByMerchant(paypalMerchantId: string): Promise<readonly AnalystFinding[]> {
    return [...this.#findings.values()]
      .filter((finding) => finding.paypalMerchantId === paypalMerchantId)
      .map((finding) => structuredClone(finding));
  }

  async findJudgmentByFlag(flagEntryId: string): Promise<Judgment | undefined> {
    const judgment = [...this.#findings.values()].find(
      (finding): finding is Judgment =>
        finding.kind === "JUDGMENT" && finding.flagEntryId === flagEntryId && finding.status !== "WITHDRAWN",
    );
    return judgment ? structuredClone(judgment) : undefined;
  }

  async updateJudgment(
    id: string,
    from: readonly Judgment["status"][],
    change: Partial<Judgment>,
  ): Promise<Judgment | undefined> {
    const current = this.#findings.get(id);
    if (current?.kind !== "JUDGMENT" || !from.includes(current.status)) return undefined;
    const next: Judgment = { ...current, ...change, id: current.id, kind: "JUDGMENT" };
    this.#findings.set(id, next);
    return structuredClone(next);
  }
}
