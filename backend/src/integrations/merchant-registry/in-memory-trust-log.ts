import type { TrustLogEntry } from "../../domain/merchant-category.ts";
import type {
  MerchantTrustLog,
  TrustLogAppendResult,
} from "../../ports/merchant-trust-log.ts";

function concernsWallet(entry: TrustLogEntry, walletAddressUrl: string): boolean {
  switch (entry.type) {
    case "CATEGORY_CLAIM":
    case "LICENSE_CLAIM":
      return (
        entry.subject.kind === "WALLET_ADDRESS" &&
        entry.subject.walletAddressUrl === walletAddressUrl
      );
    case "IDENTITY_BINDING":
    case "FLAG":
      return entry.walletAddressUrl === walletAddressUrl;
    case "REVOCATION":
      return false;
  }
}

function concernsSubject(entry: TrustLogEntry, subjectRef: string): boolean {
  return (
    (entry.type === "CATEGORY_CLAIM" || entry.type === "LICENSE_CLAIM") &&
    entry.subject.kind === "TAX_ID" &&
    entry.subject.subjectRef === subjectRef
  );
}

function frozenCopy(entry: TrustLogEntry): TrustLogEntry {
  return deepFreeze(structuredClone(entry));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * MVP trust log. A restart loses every entry; the demo seed repopulates it.
 * Entries are frozen copies, so a caller cannot edit history in place.
 */
export class InMemoryTrustLog implements MerchantTrustLog {
  readonly #entries: TrustLogEntry[] = [];
  readonly #bySubmission = new Map<string, TrustLogEntry>();
  readonly #byId = new Map<string, TrustLogEntry>();

  async append(entry: TrustLogEntry): Promise<TrustLogAppendResult> {
    const key = submissionKey(entry.sourceId, entry.submissionId);
    const existing = this.#bySubmission.get(key);
    if (existing) return { entry: existing, duplicate: true };
    if (this.#byId.has(entry.id)) {
      throw new Error(`Trust log entry id already used: ${entry.id}`);
    }

    const stored = frozenCopy(entry);
    this.#entries.push(stored);
    this.#bySubmission.set(key, stored);
    this.#byId.set(stored.id, stored);
    return { entry: stored, duplicate: false };
  }

  async getById(id: string): Promise<TrustLogEntry | undefined> {
    return this.#byId.get(id);
  }

  async findBySubmission(
    sourceId: string,
    submissionId: string,
  ): Promise<TrustLogEntry | undefined> {
    return this.#bySubmission.get(submissionKey(sourceId, submissionId));
  }

  async listByWalletAddress(walletAddressUrl: string): Promise<readonly TrustLogEntry[]> {
    return this.#entries.filter((entry) => concernsWallet(entry, walletAddressUrl));
  }

  async listBySubjectRef(subjectRef: string): Promise<readonly TrustLogEntry[]> {
    return this.#entries.filter((entry) => concernsSubject(entry, subjectRef));
  }

  async listRevocationsFor(entryIds: readonly string[]): Promise<readonly TrustLogEntry[]> {
    const targets = new Set(entryIds);
    return this.#entries.filter(
      (entry) => entry.type === "REVOCATION" && targets.has(entry.revokesEntryId),
    );
  }
}

function submissionKey(sourceId: string, submissionId: string): string {
  return JSON.stringify([sourceId, submissionId]);
}
