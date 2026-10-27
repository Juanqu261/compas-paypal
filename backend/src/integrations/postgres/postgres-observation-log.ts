import type { PurposeEnforcement } from "../../domain/mandate.ts";
import type { CompasCategory } from "../../domain/merchant-category.ts";
import type {
  MerchantObservation,
  PaidObservation,
  PurchaseVerdict,
  VerdictObservation,
} from "../../domain/merchant-history.ts";
import type { MerchantObservationLog } from "../../ports/merchant-observation-log.ts";
import { type Database, iso } from "./database.ts";

type ObservationRow = {
  id: string;
  type: MerchantObservation["type"];
  spending_record_id: string;
  paypal_merchant_id: string;
  payer_ref: string;
  observed_at: Date;
  delegate_ref: string | null;
  mandate_categories: string[] | null;
  line_categories: string[] | null;
  has_uncategorized_lines: boolean | null;
  enforcement: string | null;
  payment_state: string | null;
  verdict: string | null;
};

/** Domain arrays come back as text[], so the driver parses them. */
const COLUMNS = (sql: Database) => sql`
  id, type, spending_record_id, paypal_merchant_id, payer_ref, observed_at, delegate_ref,
  mandate_categories::text[] as mandate_categories, line_categories::text[] as line_categories,
  has_uncategorized_lines, enforcement::text as enforcement, payment_state, verdict`;

/** compas.merchant_observations. The table refuses UPDATE and DELETE. */
export class PostgresObservationLog implements MerchantObservationLog {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async append(observation: MerchantObservation): Promise<void> {
    const sql = this.#sql;
    if (observation.type === "PAID") {
      await sql`
        insert into compas.merchant_observations
          (id, type, spending_record_id, paypal_merchant_id, payer_ref, observed_at, delegate_ref,
           mandate_categories, line_categories, has_uncategorized_lines, enforcement, payment_state)
        values
          (${observation.id}, 'PAID', ${observation.spendingRecordId}, ${observation.paypalMerchantId},
           ${observation.payerRef}, ${observation.observedAt}, ${observation.delegateRef},
           ${sql.array([...observation.mandateCategories])}::text[]::compas.category[],
           ${sql.array([...observation.lineCategories])}::text[]::compas.category[],
           ${observation.hasUncategorizedLines}, ${observation.enforcement}, ${observation.paymentState})`;
      return;
    }
    await sql`
      insert into compas.merchant_observations
        (id, type, spending_record_id, paypal_merchant_id, payer_ref, observed_at, verdict)
      values
        (${observation.id}, 'PAYER_VERDICT', ${observation.spendingRecordId},
         ${observation.paypalMerchantId}, ${observation.payerRef}, ${observation.observedAt},
         ${observation.verdict})`;
  }

  async findPaid(spendingRecordId: string): Promise<PaidObservation | undefined> {
    const [row] = await this.#sql<ObservationRow[]>`
      select ${COLUMNS(this.#sql)} from compas.merchant_observations
      where spending_record_id = ${spendingRecordId} and type = 'PAID'`;
    return row && (fromRow(row) as PaidObservation);
  }

  async findVerdict(spendingRecordId: string): Promise<VerdictObservation | undefined> {
    const [row] = await this.#sql<ObservationRow[]>`
      select ${COLUMNS(this.#sql)} from compas.merchant_observations
      where spending_record_id = ${spendingRecordId} and type = 'PAYER_VERDICT'`;
    return row && (fromRow(row) as VerdictObservation);
  }

  async listByMerchant(paypalMerchantId: string, since: Date): Promise<readonly MerchantObservation[]> {
    const rows = await this.#sql<ObservationRow[]>`
      select ${COLUMNS(this.#sql)} from compas.merchant_observations
      where paypal_merchant_id = ${paypalMerchantId} and observed_at > ${since}
      order by observed_at, id`;
    return rows.map(fromRow);
  }
}

function fromRow(row: ObservationRow): MerchantObservation {
  const base = {
    id: row.id,
    spendingRecordId: row.spending_record_id,
    paypalMerchantId: row.paypal_merchant_id,
    payerRef: row.payer_ref,
    observedAt: iso(row.observed_at),
  };
  if (row.type === "PAID") {
    return {
      ...base,
      type: "PAID",
      delegateRef: row.delegate_ref!,
      mandateCategories: row.mandate_categories as CompasCategory[],
      lineCategories: row.line_categories as CompasCategory[],
      hasUncategorizedLines: row.has_uncategorized_lines!,
      enforcement: row.enforcement as PurposeEnforcement,
      paymentState: row.payment_state as PaidObservation["paymentState"],
    };
  }
  return { ...base, type: "PAYER_VERDICT", verdict: row.verdict as PurchaseVerdict };
}
