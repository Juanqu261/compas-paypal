import type {
  MerchantObservation,
  PaidObservation,
  VerdictObservation,
} from "../../domain/merchant-history.ts";
import type { MerchantObservationLog } from "../../ports/merchant-observation-log.ts";

/** MVP observation log. A restart loses it, like the trust log and the spending log. */
export class InMemoryObservationLog implements MerchantObservationLog {
  readonly #observations: MerchantObservation[] = [];
  readonly #ids = new Set<string>();

  async append(observation: MerchantObservation): Promise<void> {
    if (this.#ids.has(observation.id)) {
      throw new Error(`Observation already recorded: ${observation.id}`);
    }
    this.#ids.add(observation.id);
    this.#observations.push(Object.freeze(structuredClone(observation)));
  }

  async findPaid(spendingRecordId: string): Promise<PaidObservation | undefined> {
    return this.#observations.find(
      (observation): observation is PaidObservation =>
        observation.type === "PAID" && observation.spendingRecordId === spendingRecordId,
    );
  }

  async findVerdict(spendingRecordId: string): Promise<VerdictObservation | undefined> {
    return this.#observations.find(
      (observation): observation is VerdictObservation =>
        observation.type === "PAYER_VERDICT" && observation.spendingRecordId === spendingRecordId,
    );
  }

  async listByMerchant(walletAddressUrl: string, since: Date): Promise<readonly MerchantObservation[]> {
    const after = since.getTime();
    return this.#observations.filter(
      (observation) =>
        observation.merchantWalletAddressUrl === walletAddressUrl && Date.parse(observation.observedAt) > after,
    );
  }
}
