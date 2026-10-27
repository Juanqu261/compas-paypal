import type { Errand, ErrandUsage } from "../../domain/errand.ts";
import type { ErrandRepository, ErrandReservation } from "../../ports/errand-repository.ts";

/**
 * In memory. A restart loses errands and their reservations.
 * data/migrations/ has the Postgres tables; there is no Postgres adapter yet.
 */
export class InMemoryErrandRepository implements ErrandRepository {
  readonly #errands = new Map<string, Errand>();
  readonly #reservations = new Map<string, ErrandReservation & { released: boolean }>();

  async create(errand: Errand): Promise<void> {
    if (this.#errands.has(errand.id)) throw new Error(`Errand ${errand.id} already exists`);
    this.#errands.set(errand.id, structuredClone(errand));
  }

  async get(id: string): Promise<Errand | undefined> {
    const errand = this.#errands.get(id);
    return errand ? structuredClone(errand) : undefined;
  }

  async listByMandate(mandateId: string): Promise<readonly Errand[]> {
    return [...this.#errands.values()]
      .filter((errand) => errand.mandateId === mandateId)
      .map((errand) => structuredClone(errand));
  }

  async cancel(id: string): Promise<Errand | undefined> {
    const errand = this.#errands.get(id);
    if (errand?.status !== "ACTIVE") return undefined;
    const cancelled: Errand = { ...errand, status: "CANCELLED" };
    this.#errands.set(id, cancelled);
    return structuredClone(cancelled);
  }

  #usage(errand: Errand, since: Date): ErrandUsage {
    const units = errand.items.map(() => 0);
    let amount = 0n;
    for (const reservation of this.#reservations.values()) {
      if (reservation.errandId !== errand.id || reservation.released) continue;
      if (Date.parse(reservation.reservedAt) < since.getTime()) continue;
      reservation.usage.units.forEach((count, index) => {
        units[index] += count;
      });
      amount += BigInt(reservation.usage.amount.value);
    }
    return { units, amount: { ...errand.maxAmount, value: amount.toString() } };
  }

  async usage(errandId: string, since: Date): Promise<ErrandUsage | undefined> {
    const errand = this.#errands.get(errandId);
    return errand ? this.#usage(errand, since) : undefined;
  }

  // No await between the check and the write: one reservation at a time.
  async reserve(reservation: ErrandReservation, since: Date): Promise<boolean> {
    const errand = this.#errands.get(reservation.errandId);
    if (!errand || errand.status !== "ACTIVE" || this.#reservations.has(reservation.decisionId)) return false;
    const { amount } = reservation.usage;
    if (amount.assetCode !== errand.maxAmount.assetCode || amount.assetScale !== errand.maxAmount.assetScale) return false;
    if (reservation.usage.units.length !== errand.items.length) return false;
    const used = this.#usage(errand, since);
    const fits =
      errand.items.every((item, index) => used.units[index] + reservation.usage.units[index] <= item.maxUnits) &&
      BigInt(used.amount.value) + BigInt(amount.value) <= BigInt(errand.maxAmount.value);
    if (!fits) return false;
    this.#reservations.set(reservation.decisionId, { ...structuredClone(reservation), released: false });
    return true;
  }

  async release(decisionId: string): Promise<void> {
    const reservation = this.#reservations.get(decisionId);
    if (reservation) reservation.released = true;
  }
}
