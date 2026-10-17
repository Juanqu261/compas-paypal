import type { Mandate, MandateStatus, PurposeEnforcement } from "../../domain/mandate.ts";
import type { CompasCategory } from "../../domain/merchant-category.ts";
import type { MoneyAmount } from "../../domain/money.ts";
import type { AcceptableConfidence } from "../../domain/trust-matrix.ts";
import type { MandateRepository } from "../../ports/mandate-repository.ts";
import { type Database, iso } from "./database.ts";

type MandateRow = {
  id: string;
  payer_id: string;
  payer_name: string;
  delegate_id: string;
  delegate_name: string;
  beneficiary_id: string;
  beneficiary_name: string;
  asset_code: string;
  asset_scale: number;
  budget_value: string;
  remaining_value: string;
  policy_id: string;
  allowed_purposes: string[];
  eligible_categories: string[];
  confidence_minimum: AcceptableConfidence;
  max_debit_below_high_value: string | null;
  max_debit_below_high_asset_code: string | null;
  max_debit_below_high_asset_scale: number | null;
  enforcement: PurposeEnforcement;
  status: MandateStatus;
  valid_from: Date;
  expires_at: Date;
  created_at: Date;
};

/**
 * compas.mandates and the parties it names. Remaining capacity changes only
 * through reserveCapacity and releaseCapacity, each one conditional UPDATE,
 * so two purchases can't both spend the last of it.
 */
export class PostgresMandateRepository implements MandateRepository {
  readonly #sql: Database;

  constructor(sql: Database) {
    this.#sql = sql;
  }

  async getById(id: string): Promise<Mandate | undefined> {
    const [row] = await this.#sql<MandateRow[]>`
      select m.*, m.eligible_categories::text[] as eligible_categories, m.enforcement::text as enforcement,
             p.display_name as payer_name, d.display_name as delegate_name, b.display_name as beneficiary_name
      from compas.mandates m
      join compas.parties p on p.id = m.payer_id
      join compas.parties d on d.id = m.delegate_id
      join compas.parties b on b.id = m.beneficiary_id
      where m.id = ${id}`;
    return row && fromRow(row);
  }

  async save(mandate: Mandate): Promise<void> {
    if (!sameAsset(mandate.budget, mandate.remainingAuthorizedAmount)) {
      throw new Error(`Mandate ${mandate.id}: budget and remaining amount must share one asset`);
    }
    const cap = mandate.purposePolicy.merchantConfidence.maxDebitBelowHigh;
    await this.#sql.begin(async (sql) => {
      for (const party of [mandate.payer, mandate.delegate, mandate.beneficiary]) {
        await sql`
          insert into compas.parties (id, display_name) values (${party.id}, ${party.displayName})
          on conflict (id) do update set display_name = excluded.display_name`;
      }
      await sql`
        insert into compas.mandates
          (id, payer_id, delegate_id, beneficiary_id, asset_code, asset_scale, budget_value, remaining_value,
           policy_id, allowed_purposes, eligible_categories, confidence_minimum,
           max_debit_below_high_value, max_debit_below_high_asset_code, max_debit_below_high_asset_scale,
           enforcement, status, valid_from, expires_at, created_at)
        values
          (${mandate.id}, ${mandate.payer.id}, ${mandate.delegate.id}, ${mandate.beneficiary.id},
           ${mandate.budget.assetCode}, ${mandate.budget.assetScale}, ${mandate.budget.value},
           ${mandate.remainingAuthorizedAmount.value}, ${mandate.purposePolicy.id},
           ${sql.array([...mandate.purposePolicy.allowedPurposes])}::text[],
           ${sql.array([...mandate.purposePolicy.eligibleCategories])}::text[]::compas.category[],
           ${mandate.purposePolicy.merchantConfidence.minimum},
           ${cap?.value ?? null}, ${cap?.assetCode ?? null}, ${cap?.assetScale ?? null},
           ${mandate.purposePolicy.enforcement}, ${mandate.status}, ${mandate.validFrom}, ${mandate.expiresAt},
           ${mandate.createdAt})
        on conflict (id) do update set
          payer_id = excluded.payer_id,
          delegate_id = excluded.delegate_id,
          beneficiary_id = excluded.beneficiary_id,
          asset_code = excluded.asset_code,
          asset_scale = excluded.asset_scale,
          budget_value = excluded.budget_value,
          remaining_value = excluded.remaining_value,
          policy_id = excluded.policy_id,
          allowed_purposes = excluded.allowed_purposes,
          eligible_categories = excluded.eligible_categories,
          confidence_minimum = excluded.confidence_minimum,
          max_debit_below_high_value = excluded.max_debit_below_high_value,
          max_debit_below_high_asset_code = excluded.max_debit_below_high_asset_code,
          max_debit_below_high_asset_scale = excluded.max_debit_below_high_asset_scale,
          enforcement = excluded.enforcement,
          status = excluded.status,
          valid_from = excluded.valid_from,
          expires_at = excluded.expires_at`;
    });
  }

  async reserveCapacity(mandateId: string, amount: MoneyAmount): Promise<boolean> {
    const rows = await this.#sql`
      update compas.mandates set remaining_value = remaining_value - ${amount.value}::numeric
      where id = ${mandateId} and status = 'ACTIVE'
        and asset_code = ${amount.assetCode} and asset_scale = ${amount.assetScale}
        and remaining_value >= ${amount.value}::numeric
      returning id`;
    return rows.length === 1;
  }

  async releaseCapacity(mandateId: string, amount: MoneyAmount): Promise<void> {
    await this.#sql`
      update compas.mandates set remaining_value = least(budget_value, remaining_value + ${amount.value}::numeric)
      where id = ${mandateId} and asset_code = ${amount.assetCode} and asset_scale = ${amount.assetScale}`;
  }
}

function sameAsset(a: MoneyAmount, b: MoneyAmount): boolean {
  return a.assetCode === b.assetCode && a.assetScale === b.assetScale;
}

function fromRow(row: MandateRow): Mandate {
  const asset = { assetCode: row.asset_code, assetScale: row.asset_scale };
  const cap = row.max_debit_below_high_value !== null
    ? {
        maxDebitBelowHigh: {
          value: row.max_debit_below_high_value,
          assetCode: row.max_debit_below_high_asset_code!,
          assetScale: row.max_debit_below_high_asset_scale!,
        },
      }
    : {};
  return {
    id: row.id,
    payer: { id: row.payer_id, displayName: row.payer_name, role: "PAYER" },
    delegate: { id: row.delegate_id, displayName: row.delegate_name, role: "DELEGATE" },
    beneficiary: { id: row.beneficiary_id, displayName: row.beneficiary_name, role: "BENEFICIARY" },
    budget: { value: row.budget_value, ...asset },
    remainingAuthorizedAmount: { value: row.remaining_value, ...asset },
    purposePolicy: {
      id: row.policy_id,
      allowedPurposes: row.allowed_purposes,
      eligibleCategories: row.eligible_categories as CompasCategory[],
      merchantConfidence: { minimum: row.confidence_minimum, ...cap },
      enforcement: row.enforcement,
    },
    status: row.status,
    validFrom: iso(row.valid_from),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
  };
}
