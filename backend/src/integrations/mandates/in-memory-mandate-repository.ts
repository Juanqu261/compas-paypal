import type { Mandate, MandateStatus } from "../../domain/mandate.ts";
import type { MoneyAmount } from "../../domain/money.ts";
import type { MandateRepository } from "../../ports/mandate-repository.ts";

/**
 * MVP mandate store. A restart loses it, like the other in-memory logs.
 * With DATABASE_URL the server uses PostgresMandateRepository instead.
 */
export class InMemoryMandateRepository implements MandateRepository {
  readonly #mandates = new Map<string, Mandate>();

  async getById(id: string): Promise<Mandate | undefined> {
    const mandate = this.#mandates.get(id);
    return mandate && structuredClone(mandate);
  }

  async save(mandate: Mandate): Promise<void> {
    this.#mandates.set(mandate.id, structuredClone(mandate));
  }

  async reserveCapacity(mandateId: string, amount: MoneyAmount): Promise<boolean> {
    const mandate = this.#mandates.get(mandateId);
    if (!mandate || mandate.status !== "ACTIVE" || !sameAsset(mandate.remainingAuthorizedAmount, amount)) return false;
    const remaining = BigInt(mandate.remainingAuthorizedAmount.value) - BigInt(amount.value);
    if (remaining < 0n) return false;
    mandate.remainingAuthorizedAmount = { ...mandate.remainingAuthorizedAmount, value: remaining.toString() };
    return true;
  }

  async releaseCapacity(mandateId: string, amount: MoneyAmount): Promise<void> {
    const mandate = this.#mandates.get(mandateId);
    if (!mandate || !sameAsset(mandate.remainingAuthorizedAmount, amount)) return;
    const restored = BigInt(mandate.remainingAuthorizedAmount.value) + BigInt(amount.value);
    const budget = BigInt(mandate.budget.value);
    mandate.remainingAuthorizedAmount = {
      ...mandate.remainingAuthorizedAmount,
      value: (restored > budget ? budget : restored).toString(),
    };
  }

  /** Changes only the status, so a reservation made since the caller read the mandate stays. */
  async transitionStatus(
    mandateId: string,
    from: readonly MandateStatus[],
    to: MandateStatus,
  ): Promise<Mandate | undefined> {
    const mandate = this.#mandates.get(mandateId);
    if (!mandate || !from.includes(mandate.status)) return undefined;
    mandate.status = to;
    return structuredClone(mandate);
  }

  async listByPayer(payerId: string): Promise<readonly Mandate[]> {
    return this.#list((mandate) => mandate.payer.id === payerId);
  }

  async listByDelegate(delegateId: string): Promise<readonly Mandate[]> {
    return this.#list((mandate) => mandate.delegate.id === delegateId);
  }

  #list(keep: (mandate: Mandate) => boolean): readonly Mandate[] {
    return [...this.#mandates.values()]
      .filter(keep)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((mandate) => structuredClone(mandate));
  }
}

function sameAsset(a: MoneyAmount, b: MoneyAmount): boolean {
  return a.assetCode === b.assetCode && a.assetScale === b.assetScale;
}
