import type { MerchantTrustLevel } from "../../domain/merchant.ts";
import type { CompasCategory } from "../../domain/merchant-category.ts";
import type { MoneyAmount } from "../../domain/money.ts";
import type { PolicyOutcome, PolicyReason, PurposeCheck } from "../../domain/policy-decision.ts";
import type { SpendingRecord } from "../../domain/spending.ts";
import type { SpendingLog } from "../../ports/spending-log.ts";
import { type Database, iso } from "./database.ts";

type PaymentState = NonNullable<SpendingRecord["openPayments"]["state"]>;

type SpendingRow = {
  id: string;
  mandate_id: string;
  purchase_intent_id: string;
  merchant_wallet_address_url: string;
  merchant_display_name: string | null;
  requested_value: string;
  requested_asset_code: string;
  requested_asset_scale: number;
  debit_value: string | null;
  debit_asset_code: string | null;
  debit_asset_scale: number | null;
  outcome: PolicyOutcome;
  reasons: PolicyReason[];
  purpose_check: PurposeCheck | null;
  merchant_categories: { category: CompasCategory; trustLevel: MerchantTrustLevel }[];
  monitored_exception: boolean;
  incoming_payment_url: string | null;
  quote_id: string | null;
  outgoing_payment_url: string | null;
  payment_state: PaymentState | null;
  recorded_at: Date;
};

/**
 * compas.spending_records. A row is never deleted. Only the outgoing payment
 * reference (once) and its state change after the append; the table enforces it.
 */
export class PostgresSpendingLog implements SpendingLog {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async append(record: SpendingRecord): Promise<void> {
    const sql = this.#sql;
    const debit = record.debitAmount;
    await sql`
      insert into compas.spending_records
        (id, mandate_id, purchase_intent_id, merchant_wallet_address_url, merchant_display_name,
         requested_value, requested_asset_code, requested_asset_scale,
         debit_value, debit_asset_code, debit_asset_scale,
         outcome, reasons, purpose_check, merchant_categories, monitored_exception,
         incoming_payment_url, quote_id, outgoing_payment_url, payment_state, recorded_at)
      values
        (${record.id}, ${record.mandateId}, ${record.purchaseIntentId}, ${record.merchantWalletAddressUrl},
         ${record.merchantDisplayName ?? null},
         ${record.requestedAmount.value}, ${record.requestedAmount.assetCode}, ${record.requestedAmount.assetScale},
         ${debit?.value ?? null}, ${debit?.assetCode ?? null}, ${debit?.assetScale ?? null},
         ${record.decision.outcome}, ${sql.json(record.decision.reasons as never)},
         ${record.purposeCheck ? sql.json(record.purposeCheck as never) : null},
         ${sql.json(record.merchantCategories as never)}, ${record.monitoredException},
         ${record.openPayments.incomingPaymentUrl ?? null}, ${record.openPayments.quoteId ?? null},
         ${record.openPayments.outgoingPaymentUrl ?? null}, ${record.openPayments.state ?? null},
         ${record.recordedAt})`;
  }

  async recordPayment(
    recordId: string,
    payment: { outgoingPaymentUrl: string; state: PaymentState },
  ): Promise<SpendingRecord> {
    const [row] = await this.#sql<SpendingRow[]>`
      update compas.spending_records
      set outgoing_payment_url = ${payment.outgoingPaymentUrl}, payment_state = ${payment.state}
      where id = ${recordId}
        and (outgoing_payment_url is null or outgoing_payment_url = ${payment.outgoingPaymentUrl})
      returning *`;
    if (row) return fromRow(row);
    const [exists] = await this.#sql`select 1 from compas.spending_records where id = ${recordId}`;
    throw new Error(
      exists
        ? `Spending record ${recordId} already has a different outgoing payment`
        : `No spending record ${recordId}`,
    );
  }

  async listByMandate(mandateId: string): Promise<readonly SpendingRecord[]> {
    const rows = await this.#sql<SpendingRow[]>`
      select * from compas.spending_records where mandate_id = ${mandateId} order by recorded_at, id`;
    return rows.map(fromRow);
  }
}

function money(value: string, assetCode: string, assetScale: number): MoneyAmount {
  return { value, assetCode, assetScale };
}

function fromRow(row: SpendingRow): SpendingRecord {
  const openPayments: SpendingRecord["openPayments"] = {
    ...(row.incoming_payment_url ? { incomingPaymentUrl: row.incoming_payment_url } : {}),
    ...(row.quote_id ? { quoteId: row.quote_id } : {}),
    ...(row.outgoing_payment_url ? { outgoingPaymentUrl: row.outgoing_payment_url } : {}),
    ...(row.payment_state ? { state: row.payment_state } : {}),
  };
  return {
    id: row.id,
    mandateId: row.mandate_id,
    purchaseIntentId: row.purchase_intent_id,
    merchantWalletAddressUrl: row.merchant_wallet_address_url,
    ...(row.merchant_display_name !== null ? { merchantDisplayName: row.merchant_display_name } : {}),
    requestedAmount: money(row.requested_value, row.requested_asset_code, row.requested_asset_scale),
    ...(row.debit_value !== null
      ? { debitAmount: money(row.debit_value, row.debit_asset_code!, row.debit_asset_scale!) }
      : {}),
    decision: { outcome: row.outcome, reasons: row.reasons },
    ...(row.purpose_check ? { purposeCheck: row.purpose_check } : {}),
    merchantCategories: row.merchant_categories,
    monitoredException: row.monitored_exception,
    openPayments,
    recordedAt: iso(row.recorded_at),
  };
}
