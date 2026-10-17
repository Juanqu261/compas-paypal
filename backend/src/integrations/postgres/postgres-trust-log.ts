import type {
  CompasCategory,
  ExternalCategoryCode,
  LicenseType,
  MerchantSubject,
  TrustLogEntry,
} from "../../domain/merchant-category.ts";
import type { MerchantTrustLog, TrustLogAppendResult } from "../../ports/merchant-trust-log.ts";
import { type Database, iso, isoOrUndefined } from "./database.ts";

type TrustLogRow = {
  id: string;
  type: TrustLogEntry["type"];
  source_id: string;
  submission_id: string;
  body_digest: string;
  recorded_at: Date;
  wallet_address_url: string | null;
  subject_ref: string | null;
  revokes_entry_id: string | null;
  observed_at: Date | null;
  valid_until: Date | null;
  details: Record<string, unknown>;
};

/** compas.trust_log_entries. The table refuses UPDATE and DELETE. */
export class PostgresTrustLog implements MerchantTrustLog {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async append(entry: TrustLogEntry): Promise<TrustLogAppendResult> {
    const row = toRow(entry);
    const inserted = await this.#sql<TrustLogRow[]>`
      insert into compas.trust_log_entries
        (id, type, source_id, submission_id, body_digest, recorded_at,
         wallet_address_url, subject_ref, revokes_entry_id, observed_at, valid_until, details)
      values
        (${row.id}, ${row.type}, ${row.source_id}, ${row.submission_id}, ${row.body_digest}, ${row.recorded_at},
         ${row.wallet_address_url}, ${row.subject_ref}, ${row.revokes_entry_id}, ${row.observed_at},
         ${row.valid_until}, ${this.#sql.json(row.details as never)})
      on conflict (source_id, submission_id) do nothing
      returning *`;
    if (inserted[0]) return { entry: fromRow(inserted[0]), duplicate: false };

    const existing = await this.findBySubmission(entry.sourceId, entry.submissionId);
    if (!existing) throw new Error(`Trust log append failed for ${entry.sourceId}/${entry.submissionId}`);
    return { entry: existing, duplicate: true };
  }

  async getById(id: string): Promise<TrustLogEntry | undefined> {
    const [row] = await this.#sql<TrustLogRow[]>`select * from compas.trust_log_entries where id = ${id}`;
    return row && fromRow(row);
  }

  async findBySubmission(sourceId: string, submissionId: string): Promise<TrustLogEntry | undefined> {
    const [row] = await this.#sql<TrustLogRow[]>`
      select * from compas.trust_log_entries
      where source_id = ${sourceId} and submission_id = ${submissionId}`;
    return row && fromRow(row);
  }

  async listByWalletAddress(walletAddressUrl: string): Promise<readonly TrustLogEntry[]> {
    const rows = await this.#sql<TrustLogRow[]>`
      select * from compas.trust_log_entries
      where wallet_address_url = ${walletAddressUrl}
      order by recorded_at, id`;
    return rows.map(fromRow);
  }

  async listBySubjectRef(subjectRef: string): Promise<readonly TrustLogEntry[]> {
    const rows = await this.#sql<TrustLogRow[]>`
      select * from compas.trust_log_entries
      where subject_ref = ${subjectRef} and type in ('CATEGORY_CLAIM', 'LICENSE_CLAIM')
      order by recorded_at, id`;
    return rows.map(fromRow);
  }

  async listBindingsBySubjectRef(subjectRef: string): Promise<readonly TrustLogEntry[]> {
    const rows = await this.#sql<TrustLogRow[]>`
      select * from compas.trust_log_entries
      where subject_ref = ${subjectRef} and type = 'IDENTITY_BINDING'
      order by recorded_at, id`;
    return rows.map(fromRow);
  }

  async listRevocationsFor(entryIds: readonly string[]): Promise<readonly TrustLogEntry[]> {
    if (entryIds.length === 0) return [];
    const rows = await this.#sql<TrustLogRow[]>`
      select * from compas.trust_log_entries
      where type = 'REVOCATION' and revokes_entry_id = any(${this.#sql.array([...entryIds])}::text[])
      order by recorded_at, id`;
    return rows.map(fromRow);
  }
}

function subjectColumns(subject: MerchantSubject) {
  return subject.kind === "WALLET_ADDRESS"
    ? { wallet_address_url: subject.walletAddressUrl, subject_ref: null }
    : { wallet_address_url: null, subject_ref: subject.subjectRef };
}

function toRow(entry: TrustLogEntry) {
  const base = {
    id: entry.id,
    type: entry.type,
    source_id: entry.sourceId,
    submission_id: entry.submissionId,
    body_digest: entry.bodyDigest,
    recorded_at: entry.recordedAt,
    wallet_address_url: null as string | null,
    subject_ref: null as string | null,
    revokes_entry_id: null as string | null,
    observed_at: null as string | null,
    valid_until: null as string | null,
    details: {} as Record<string, unknown>,
  };
  switch (entry.type) {
    case "CATEGORY_CLAIM":
      return {
        ...base,
        ...subjectColumns(entry.subject),
        observed_at: entry.observedAt,
        valid_until: entry.validUntil ?? null,
        details: {
          codes: entry.codes,
          declaredCategories: entry.declaredCategories,
          ...(entry.evidenceRef !== undefined ? { evidenceRef: entry.evidenceRef } : {}),
        },
      };
    case "LICENSE_CLAIM":
      return {
        ...base,
        ...subjectColumns(entry.subject),
        observed_at: entry.observedAt,
        valid_until: entry.validUntil ?? null,
        details: { licenseType: entry.licenseType, licenseRef: entry.licenseRef },
      };
    case "IDENTITY_BINDING":
      return {
        ...base,
        wallet_address_url: entry.walletAddressUrl,
        subject_ref: entry.subject.subjectRef,
        observed_at: entry.observedAt,
        valid_until: entry.validUntil ?? null,
      };
    case "REVOCATION":
      return { ...base, revokes_entry_id: entry.revokesEntryId, details: { reason: entry.reason } };
    case "FLAG":
      return {
        ...base,
        wallet_address_url: entry.walletAddressUrl,
        details: { category: entry.category, note: entry.note },
      };
  }
}

function fromRow(row: TrustLogRow): TrustLogEntry {
  const base = {
    id: row.id,
    sourceId: row.source_id,
    submissionId: row.submission_id,
    bodyDigest: row.body_digest,
    recordedAt: iso(row.recorded_at),
  };
  const details = row.details;
  const validUntil = isoOrUndefined(row.valid_until);
  const subject: MerchantSubject = row.subject_ref !== null
    ? { kind: "TAX_ID", subjectRef: row.subject_ref }
    : { kind: "WALLET_ADDRESS", walletAddressUrl: row.wallet_address_url! };

  switch (row.type) {
    case "CATEGORY_CLAIM":
      return {
        ...base,
        type: "CATEGORY_CLAIM",
        subject,
        codes: details.codes as ExternalCategoryCode[],
        declaredCategories: details.declaredCategories as CompasCategory[],
        observedAt: iso(row.observed_at!),
        ...(validUntil ? { validUntil } : {}),
        ...(typeof details.evidenceRef === "string" ? { evidenceRef: details.evidenceRef } : {}),
      };
    case "LICENSE_CLAIM":
      return {
        ...base,
        type: "LICENSE_CLAIM",
        subject,
        licenseType: details.licenseType as LicenseType,
        licenseRef: details.licenseRef as string,
        observedAt: iso(row.observed_at!),
        ...(validUntil ? { validUntil } : {}),
      };
    case "IDENTITY_BINDING":
      return {
        ...base,
        type: "IDENTITY_BINDING",
        walletAddressUrl: row.wallet_address_url!,
        subject: { kind: "TAX_ID", subjectRef: row.subject_ref! },
        observedAt: iso(row.observed_at!),
        ...(validUntil ? { validUntil } : {}),
      };
    case "REVOCATION":
      return {
        ...base,
        type: "REVOCATION",
        revokesEntryId: row.revokes_entry_id!,
        reason: details.reason as string,
      };
    case "FLAG":
      return {
        ...base,
        type: "FLAG",
        walletAddressUrl: row.wallet_address_url!,
        category: details.category as CompasCategory,
        note: details.note as string,
      };
  }
}
