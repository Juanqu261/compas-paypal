import type { TrustLogEntry } from "../domain/merchant-category.ts";

export type TrustLogAppendResult = {
  entry: TrustLogEntry;
  /** True when (sourceId, submissionId) was already recorded. Nothing was appended. */
  duplicate: boolean;
};

/**
 * Append-only record of merchant category evidence.
 * There is no update and no delete. Corrections are REVOCATION entries.
 */
export interface MerchantTrustLog {
  /**
   * Appends unless (sourceId, submissionId) exists. The check and the append
   * are atomic, so a concurrent duplicate cannot slip in.
   */
  append(entry: TrustLogEntry): Promise<TrustLogAppendResult>;
  getById(id: string): Promise<TrustLogEntry | undefined>;
  findBySubmission(sourceId: string, submissionId: string): Promise<TrustLogEntry | undefined>;
  /** Claims about the wallet, bindings to it and flags on it. */
  listByWalletAddress(walletAddressUrl: string): Promise<readonly TrustLogEntry[]>;
  /** Claims about a TAX_ID subject. */
  listBySubjectRef(subjectRef: string): Promise<readonly TrustLogEntry[]>;
  /** Bindings of a TAX_ID subject to any wallet. Shows a NIT claimed by more than one wallet. */
  listBindingsBySubjectRef(subjectRef: string): Promise<readonly TrustLogEntry[]>;
  /** REVOCATION entries that target any of the given entry ids. */
  listRevocationsFor(entryIds: readonly string[]): Promise<readonly TrustLogEntry[]>;
}
