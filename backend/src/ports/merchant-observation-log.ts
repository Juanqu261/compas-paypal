import type {
  MerchantObservation,
  PaidObservation,
  VerdictObservation,
} from "../domain/merchant-history.ts";

/**
 * Append-only record of what happened at merchants: paid purchases and the
 * payer's verdict on them. There is no update and no delete.
 */
export interface MerchantObservationLog {
  /** Refuses an id that is already recorded. */
  append(observation: MerchantObservation): Promise<void>;
  findPaid(spendingRecordId: string): Promise<PaidObservation | undefined>;
  findVerdict(spendingRecordId: string): Promise<VerdictObservation | undefined>;
  /** Observations at the merchant recorded after `since`. */
  listByMerchant(walletAddressUrl: string, since: Date): Promise<readonly MerchantObservation[]>;
}
