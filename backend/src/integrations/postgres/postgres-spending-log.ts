import type { MerchantTrustLevel } from "../../domain/merchant.ts";
import type { CompasCategory } from "../../domain/merchant-category.ts";
import type { MoneyAmount } from "../../domain/money.ts";
import type { PolicyOutcome, PolicyReason, PurposeCheck } from "../../domain/policy-decision.ts";
import type { PaymentFailureCode, PaymentState, SpendingRecord } from "../../domain/spending.ts";
import type { SpendingLog } from "../../ports/spending-log.ts";
import { type Database, iso } from "./database.ts";

type SpendingRow = {
  id: string;
  mandate_id: string;
  purchase_intent_id: string;
  paypal_merchant_id: string;
  merchant_display_name: string | null;
  requested_value: string;
  requested_asset_code: string;
  requested_asset_scale: number;
  outcome: PolicyOutcome;
  reasons: PolicyReason[];
  purpose_check: PurposeCheck | null;
  merchant_categories: { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  line_categories: CompasCategory[];
  has_uncategorized_lines: boolean;
  monitored_exception: boolean;
  paypal_order_id: string | null;
  paypal_approval_url: string | null;
  paypal_capture_id: string | null;
  payment_state: PaymentState | null;
  payment_failure_code: PaymentFailureCode | null;
  recorded_at: Date;
};

/** The domain array comes back as text[], so the driver parses it. */
const COLUMNS = (sql: Database) => sql`
  id, mandate_id, purchase_intent_id, paypal_merchant_id, merchant_display_name,
  requested_value, requested_asset_code, requested_asset_scale,
  outcome, reasons, purpose_check, merchant_categories,
  line_categories::text[] as line_categories, has_uncategorized_lines, monitored_exception,
  paypal_order_id, paypal_approval_url, paypal_capture_id, payment_state, payment_failure_code, recorded_at`;

/**
 * compas.spending_records. A row is never deleted. After the append, only
 * the PayPal fields change: the order once, then its state, capture and
 * failure code. The table enforces it.
 */
export class PostgresSpendingLog implements SpendingLog {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async append(record: SpendingRecord): Promise<void> {
    const sql = this.#sql;
    const paypal = record.paypal;
    await sql`
      insert into compas.spending_records
        (id, mandate_id, purchase_intent_id, paypal_merchant_id, merchant_display_name,
         requested_value, requested_asset_code, requested_asset_scale,
         outcome, reasons, purpose_check, merchant_categories,
         line_categories, has_uncategorized_lines, monitored_exception,
         paypal_order_id, paypal_approval_url, paypal_capture_id, payment_state, payment_failure_code,
         recorded_at)
      values
        (${record.id}, ${record.mandateId}, ${record.purchaseIntentId}, ${record.paypalMerchantId},
         ${record.merchantDisplayName ?? null},
         ${record.requestedAmount.value}, ${record.requestedAmount.assetCode}, ${record.requestedAmount.assetScale},
         ${record.decision.outcome}, ${sql.json(record.decision.reasons as never)},
         ${record.purposeCheck ? sql.json(record.purposeCheck as never) : null},
         ${sql.json(record.merchantCategories as never)},
         ${sql.array([...record.lineCategories])}::text[]::compas.category[],
         ${record.hasUncategorizedLines}, ${record.monitoredException},
         ${paypal.orderId ?? null}, ${paypal.approvalUrl ?? null}, ${paypal.captureId ?? null},
         ${paypal.state ?? null}, ${paypal.failureCode ?? null},
         ${record.recordedAt})`;
  }

  async recordOrder(
    recordId: string,
    order: { orderId: string; approvalUrl?: string; state: PaymentState },
  ): Promise<SpendingRecord> {
    const sql = this.#sql;
    const [row] = await sql<SpendingRow[]>`
      update compas.spending_records
      set paypal_order_id = ${order.orderId}, paypal_approval_url = ${order.approvalUrl ?? null},
          payment_state = ${order.state}
      where id = ${recordId} and paypal_order_id is null
      returning ${COLUMNS(sql)}`;
    if (row) return fromRow(row);
    const [existing] = await sql<SpendingRow[]>`
      select ${COLUMNS(sql)} from compas.spending_records where id = ${recordId}`;
    if (existing?.paypal_order_id === order.orderId) return fromRow(existing);
    throw new Error(
      existing ? `Spending record ${recordId} already has a different PayPal order` : `No spending record ${recordId}`,
    );
  }

  async transitionPayment(
    recordId: string,
    from: readonly PaymentState[],
    to: { state: PaymentState; captureId?: string; failureCode?: PaymentFailureCode },
  ): Promise<SpendingRecord | undefined> {
    const sql = this.#sql;
    const [row] = await sql<SpendingRow[]>`
      update compas.spending_records
      set payment_state = ${to.state},
          paypal_capture_id = coalesce(${to.captureId ?? null}, paypal_capture_id),
          payment_failure_code = coalesce(${to.failureCode ?? null}, payment_failure_code)
      where id = ${recordId} and paypal_order_id is not null and payment_state in ${sql([...from])}
      returning ${COLUMNS(sql)}`;
    return row && fromRow(row);
  }

  async findByPayPalOrderId(orderId: string): Promise<SpendingRecord | undefined> {
    const [row] = await this.#sql<SpendingRow[]>`
      select ${COLUMNS(this.#sql)} from compas.spending_records where paypal_order_id = ${orderId}`;
    return row && fromRow(row);
  }

  async listByMandate(mandateId: string): Promise<readonly SpendingRecord[]> {
    const rows = await this.#sql<SpendingRow[]>`
      select ${COLUMNS(this.#sql)} from compas.spending_records
      where mandate_id = ${mandateId} order by recorded_at, id`;
    return rows.map(fromRow);
  }

  async listOrdersByMerchant(paypalMerchantId: string, limit: number): Promise<readonly SpendingRecord[]> {
    const rows = await this.#sql<SpendingRow[]>`
      select ${COLUMNS(this.#sql)} from compas.spending_records
      where paypal_merchant_id = ${paypalMerchantId} and paypal_order_id is not null
      order by recorded_at desc, id desc limit ${limit}`;
    return rows.map(fromRow);
  }
}

function money(value: string, assetCode: string, assetScale: number): MoneyAmount {
  return { value, assetCode, assetScale };
}

function fromRow(row: SpendingRow): SpendingRecord {
  const paypal: SpendingRecord["paypal"] = {
    ...(row.paypal_order_id ? { orderId: row.paypal_order_id } : {}),
    ...(row.paypal_approval_url ? { approvalUrl: row.paypal_approval_url } : {}),
    ...(row.paypal_capture_id ? { captureId: row.paypal_capture_id } : {}),
    ...(row.payment_state ? { state: row.payment_state } : {}),
    ...(row.payment_failure_code ? { failureCode: row.payment_failure_code } : {}),
  };
  return {
    id: row.id,
    mandateId: row.mandate_id,
    purchaseIntentId: row.purchase_intent_id,
    paypalMerchantId: row.paypal_merchant_id,
    ...(row.merchant_display_name !== null ? { merchantDisplayName: row.merchant_display_name } : {}),
    requestedAmount: money(row.requested_value, row.requested_asset_code, row.requested_asset_scale),
    decision: { outcome: row.outcome, reasons: row.reasons },
    ...(row.purpose_check ? { purposeCheck: row.purpose_check } : {}),
    merchantCategories: row.merchant_categories,
    lineCategories: row.line_categories,
    hasUncategorizedLines: row.has_uncategorized_lines,
    monitoredException: row.monitored_exception,
    paypal,
    recordedAt: iso(row.recorded_at),
  };
}
