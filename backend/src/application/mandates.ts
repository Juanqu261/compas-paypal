import { randomUUID } from "node:crypto";
import type {
  Mandate,
  MandateStatus,
  MerchantConfidencePolicy,
  PurposeEnforcement,
} from "../domain/mandate.ts";
import { COMPAS_CATEGORIES, type CompasCategory, isCompasCategory } from "../domain/merchant-category.ts";
import type { MoneyAmount } from "../domain/money.ts";
import { ACCEPTABLE_CONFIDENCE_LEVELS, type AcceptableConfidence } from "../domain/trust-matrix.ts";
import type { AuditRepository } from "../ports/audit-repository.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { DirectoryParty, PartyDirectory } from "../ports/party-directory.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import { buildMandateActivity, type MandateActivity } from "./mandate-activity.ts";
import { formatAmount, logger } from "../lib/log.ts";

const log = logger("mandates");

// ---------------------------------------------------------------------------
// Limits and request shape
// ---------------------------------------------------------------------------

/** A demo budget never authorizes more than this many whole units of its asset. */
export const MAX_BUDGET_WHOLE_UNITS = 10_000n;
/** Asset scales above this are refused as malformed. */
export const MAX_ASSET_SCALE = 9;
/** A budget's validity window is at most a year. Recurring budgets are not supported. */
export const MAX_VALIDITY_MS = 366 * 24 * 60 * 60 * 1000;
/** A start date may be a little in the past, to absorb clock skew and "today". */
const START_GRACE_MS = 24 * 60 * 60 * 1000;

const ASSET_CODE = /^[A-Z0-9]{1,12}$/;
const MINOR_UNITS = /^[1-9][0-9]{0,30}$/;

export type Actor = { partyId: string };
export type ViewerRole = "PAYER" | "DELEGATE";

export type FieldError = { field: string; code: string; message: string };

export type CreateMandateInput = {
  delegateId: string;
  beneficiaryId: string;
  categories: readonly CompasCategory[];
  budget: MoneyAmount;
  validFrom: string;
  expiresAt: string;
  enforcement: PurposeEnforcement;
  merchantConfidence: MerchantConfidencePolicy;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A `{ value, assetCode, assetScale }` from a request body, or undefined with the problem pushed to `errors`. */
export function parseMoney(value: unknown, field: string, errors: FieldError[]): MoneyAmount | undefined {
  if (!isRecord(value)) {
    errors.push({ field, code: "REQUIRED", message: `${field} must be { value, assetCode, assetScale }` });
    return undefined;
  }
  const { value: minor, assetCode, assetScale } = value;
  if (typeof minor !== "string" || !MINOR_UNITS.test(minor)) {
    errors.push({ field: `${field}.value`, code: "INVALID_AMOUNT", message: "a positive integer in minor units, as a string" });
    return undefined;
  }
  if (typeof assetCode !== "string" || !ASSET_CODE.test(assetCode)) {
    errors.push({ field: `${field}.assetCode`, code: "INVALID_ASSET", message: "an upper-case asset code" });
    return undefined;
  }
  if (typeof assetScale !== "number" || !Number.isInteger(assetScale) || assetScale < 0 || assetScale > MAX_ASSET_SCALE) {
    errors.push({ field: `${field}.assetScale`, code: "INVALID_ASSET", message: `an integer from 0 to ${MAX_ASSET_SCALE}` });
    return undefined;
  }
  return { value: minor, assetCode, assetScale };
}

function parseInstant(value: unknown, field: string, errors: FieldError[]): Date | undefined {
  if (typeof value !== "string" || value.length > 40) {
    errors.push({ field, code: "INVALID_DATE", message: "an ISO 8601 date-time" });
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    errors.push({ field, code: "INVALID_DATE", message: "an ISO 8601 date-time" });
    return undefined;
  }
  return date;
}

/**
 * Validates the browser's request. The payer is never in it: it is the
 * authenticated actor. Party ids are checked against the directory later.
 */
export function parseCreateMandateRequest(
  body: unknown,
  now: Date,
): { ok: true; value: CreateMandateInput } | { ok: false; errors: readonly FieldError[] } {
  const errors: FieldError[] = [];
  if (!isRecord(body)) {
    return { ok: false, errors: [{ field: "", code: "INVALID_BODY", message: "a JSON object is required" }] };
  }

  const delegateId = typeof body.delegateId === "string" ? body.delegateId.trim() : "";
  if (!delegateId) errors.push({ field: "delegateId", code: "REQUIRED", message: "who may spend" });
  const beneficiaryId = typeof body.beneficiaryId === "string" ? body.beneficiaryId.trim() : "";
  if (!beneficiaryId) errors.push({ field: "beneficiaryId", code: "REQUIRED", message: "who the budget is for" });

  const categories: CompasCategory[] = [];
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    errors.push({ field: "categories", code: "REQUIRED", message: "at least one COMPAS category" });
  } else {
    for (const category of body.categories) {
      if (!isCompasCategory(category)) {
        errors.push({
          field: "categories",
          code: "UNKNOWN_CATEGORY",
          message: `one of ${COMPAS_CATEGORIES.join(", ")}`,
        });
        break;
      }
      if (!categories.includes(category)) categories.push(category);
    }
  }

  const budget = parseMoney(body.budget, "budget", errors);
  if (budget) {
    const max = MAX_BUDGET_WHOLE_UNITS * 10n ** BigInt(budget.assetScale);
    if (BigInt(budget.value) > max) {
      errors.push({
        field: "budget.value",
        code: "AMOUNT_TOO_LARGE",
        message: `at most ${MAX_BUDGET_WHOLE_UNITS} ${budget.assetCode}`,
      });
    }
  }

  const validFrom = parseInstant(body.validFrom, "validFrom", errors);
  const expiresAt = parseInstant(body.expiresAt, "expiresAt", errors);
  if (validFrom && expiresAt) {
    if (expiresAt.getTime() <= validFrom.getTime()) {
      errors.push({ field: "expiresAt", code: "ENDS_BEFORE_START", message: "must be after validFrom" });
    } else if (expiresAt.getTime() - validFrom.getTime() > MAX_VALIDITY_MS) {
      errors.push({ field: "expiresAt", code: "WINDOW_TOO_LONG", message: "at most one year after validFrom" });
    }
    if (expiresAt.getTime() <= now.getTime()) {
      errors.push({ field: "expiresAt", code: "IN_THE_PAST", message: "must be in the future" });
    }
    if (validFrom.getTime() < now.getTime() - START_GRACE_MS) {
      errors.push({ field: "validFrom", code: "IN_THE_PAST", message: "cannot start before yesterday" });
    }
  }

  // ENFORCED is the default. MONITORED needs the payer's explicit acknowledgement.
  let enforcement: PurposeEnforcement = "ENFORCED";
  if (body.enforcement !== undefined && body.enforcement !== "ENFORCED") {
    if (body.enforcement !== "MONITORED") {
      errors.push({ field: "enforcement", code: "INVALID_ENFORCEMENT", message: "ENFORCED or MONITORED" });
    } else if (body.monitoredAcknowledged !== true) {
      errors.push({
        field: "monitoredAcknowledged",
        code: "MONITORED_NOT_ACKNOWLEDGED",
        message: "MONITORED lets purchases outside the purpose through and must be acknowledged",
      });
    } else {
      enforcement = "MONITORED";
    }
  }

  let merchantConfidence: MerchantConfidencePolicy = { minimum: "HIGH" };
  if (body.merchantConfidence !== undefined) {
    if (!isRecord(body.merchantConfidence)) {
      errors.push({ field: "merchantConfidence", code: "INVALID_CONFIDENCE", message: "{ minimum, maxDebitBelowHigh? }" });
    } else {
      const minimum = body.merchantConfidence.minimum ?? "HIGH";
      if (!(ACCEPTABLE_CONFIDENCE_LEVELS as readonly unknown[]).includes(minimum)) {
        errors.push({
          field: "merchantConfidence.minimum",
          code: "INVALID_CONFIDENCE",
          message: `one of ${ACCEPTABLE_CONFIDENCE_LEVELS.join(", ")}. CONTESTED never passes.`,
        });
      } else {
        merchantConfidence = { minimum: minimum as AcceptableConfidence };
        const rawCap = body.merchantConfidence.maxDebitBelowHigh;
        if (rawCap !== undefined && rawCap !== null) {
          if (minimum === "HIGH") {
            errors.push({
              field: "merchantConfidence.maxDebitBelowHigh",
              code: "CAP_NEEDS_LOWER_MINIMUM",
              message: "a cap below HIGH only applies when the minimum is MEDIUM or LOW",
            });
          } else {
            const cap = parseMoney(rawCap, "merchantConfidence.maxDebitBelowHigh", errors);
            if (cap && budget) {
              if (cap.assetCode !== budget.assetCode || cap.assetScale !== budget.assetScale) {
                errors.push({
                  field: "merchantConfidence.maxDebitBelowHigh",
                  code: "ASSET_MISMATCH",
                  message: "must use the budget's asset",
                });
              } else if (BigInt(cap.value) > BigInt(budget.value)) {
                errors.push({
                  field: "merchantConfidence.maxDebitBelowHigh",
                  code: "CAP_ABOVE_BUDGET",
                  message: "cannot exceed the budget",
                });
              }
            }
            if (cap) merchantConfidence = { minimum: minimum as AcceptableConfidence, maxDebitBelowHigh: cap };
          }
        }
      }
    }
  }

  if (errors.length > 0 || !budget || !validFrom || !expiresAt) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      delegateId,
      beneficiaryId,
      categories,
      budget,
      validFrom: validFrom.toISOString(),
      expiresAt: expiresAt.toISOString(),
      enforcement,
      merchantConfidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Authorization state: read from the audit log
// ---------------------------------------------------------------------------

/**
 * Whether the payer confirmed the budget. On PayPal, confirming asks nothing
 * of PayPal: the payer approves each purchase's order at PayPal instead, so
 * no standing permission to charge the payer's account exists anywhere.
 */
export type ConsentState =
  /** The payer has not confirmed the budget. It authorizes nothing yet. */
  | "NOT_STARTED"
  /** The payer confirmed the budget. Each purchase still needs their PayPal approval. */
  | "GRANTED";

/** Mandate lifecycle events in the audit log. Payloads hold codes only. */
export const MANDATE_EVENTS = {
  created: "MANDATE_CREATED",
  activated: "MANDATE_ACTIVATED",
  revoked: "MANDATE_REVOKED",
  expired: "MANDATE_EXPIRED",
} as const;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type PartyView = { id: string; displayName: string };

export type MandateAuthorizationView = {
  consent: ConsentState;
  canAuthorize: boolean;
  canRevoke: boolean;
};

/**
 * One mandate for the person looking at it. No PayPal account id, order id
 * or token is in here. `authorization` is for the payer only.
 */
export type MandateView = {
  id: string;
  /** The stored status, except EXHAUSTED, which is shown when an ACTIVE mandate has no capacity left. */
  status: MandateStatus;
  viewerRole: ViewerRole;
  payer: PartyView;
  delegate: PartyView;
  beneficiary: PartyView;
  budget: MoneyAmount;
  /** Authorization capacity. Not money COMPAS holds and not a balance of the delegate. */
  remainingAuthorizedAmount: MoneyAmount;
  purposePolicy: {
    eligibleCategories: readonly CompasCategory[];
    enforcement: PurposeEnforcement;
    merchantConfidence: MerchantConfidencePolicy;
  };
  validFrom: string;
  expiresAt: string;
  createdAt: string;
  /** True when COMPAS would evaluate a purchase under it right now. */
  usable: boolean;
  authorization?: MandateAuthorizationView;
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type MandateErrorCode =
  | "INVALID_MANDATE"
  | "NOT_FOUND"
  | "NOT_THE_PAYER"
  | "NOT_THE_DELEGATE"
  | "INVALID_STATE";

export type MandateFailure = {
  ok: false;
  code: MandateErrorCode;
  message: string;
  fieldErrors?: readonly FieldError[];
};

export type MandateResult<T> = ({ ok: true } & T) | MandateFailure;

function failure(code: MandateErrorCode, message: string, extra: Partial<MandateFailure> = {}): MandateFailure {
  return { ok: false, code, message, ...extra };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type MandateServiceDeps = {
  /** PostgresMandateRepository with DATABASE_URL, InMemoryMandateRepository without. */
  mandates: MandateRepository;
  parties: PartyDirectory;
  /** The mandate's lifecycle events. PostgresAuditRepository with DATABASE_URL. */
  audit: AuditRepository;
  spending: Pick<SpendingLog, "listByMandate">;
  /**
   * Whether the payment rail takes a budget's asset. A budget in an asset
   * PayPal can't charge, such as COP, could never pay anything. Without it,
   * any well-formed asset is accepted.
   */
  acceptsAsset?: (asset: Pick<MoneyAmount, "assetCode" | "assetScale">) => boolean;
  /** Reconciles the mandate's open PayPal orders before its activity is read. */
  settlement?: { refresh(mandateId: string): Promise<void> };
  now?: () => Date;
  newId?: () => string;
  logWarning?: (message: string) => void;
};

/** Statuses a delegate sees. Before the payer confirms there is no permission to show. */
const DELEGATE_VISIBLE: readonly MandateStatus[] = ["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"];
/** Every status a mandate can be revoked from. */
const REVOCABLE: readonly MandateStatus[] = ["DRAFT", "ACTIVE", "EXHAUSTED", "EXPIRED"];

/**
 * Creating, authorizing, reading and revoking mandates. Access depends on the
 * actor's relation in each mandate, never on which app they use. It decides
 * no purchase: purchases go through `purchaseUnderMandate`.
 *
 * Status changes go through `MandateRepository.transitionStatus`, never
 * `save`, so they can't overwrite capacity a purchase reserved meanwhile.
 */
export class MandateService {
  readonly #deps: MandateServiceDeps;

  constructor(deps: MandateServiceDeps) {
    this.#deps = deps;
  }

  #now(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  async #record(mandateId: string, type: string, actorId?: string, payload: Record<string, string> = {}): Promise<void> {
    log.info(type, { mandateId, actor: actorId });
    await this.#deps.audit.append({
      id: `mandate-event-${this.#deps.newId?.() ?? randomUUID()}`,
      type,
      occurredAt: this.#now().toISOString(),
      mandateId,
      ...(actorId ? { actorId } : {}),
      payload,
    });
  }

  async self(actor: Actor): Promise<PartyView | undefined> {
    const party = await this.#deps.parties.getById(actor.partyId);
    return party ? { id: party.id, displayName: party.displayName } : undefined;
  }

  /** Parties the actor can name as delegate or beneficiary. demo/test data until there are contacts. */
  async participants(actor: Actor): Promise<readonly PartyView[]> {
    const parties = await this.#deps.parties.list();
    return parties
      .filter((party) => party.id !== actor.partyId)
      .map(({ id, displayName }) => ({ id, displayName }));
  }

  async create(actor: Actor, body: unknown): Promise<MandateResult<{ mandate: MandateView }>> {
    const now = this.#now();
    const parsed = parseCreateMandateRequest(body, now);
    if (!parsed.ok) {
      return failure("INVALID_MANDATE", "The budget is not valid.", { fieldErrors: parsed.errors });
    }
    const input = parsed.value;

    const payer = await this.#deps.parties.getById(actor.partyId);
    const delegate = await this.#deps.parties.getById(input.delegateId);
    const beneficiary = await this.#deps.parties.getById(input.beneficiaryId);
    const fieldErrors: FieldError[] = [];
    if (!payer) {
      return failure("NOT_FOUND", "The signed-in party is unknown.");
    }
    if (!delegate) fieldErrors.push({ field: "delegateId", code: "UNKNOWN_PARTY", message: "not a known party" });
    else if (delegate.id === payer.id) {
      fieldErrors.push({ field: "delegateId", code: "SELF_DELEGATION", message: "the payer cannot be the delegate" });
    }
    if (!beneficiary) fieldErrors.push({ field: "beneficiaryId", code: "UNKNOWN_PARTY", message: "not a known party" });
    if (this.#deps.acceptsAsset && !this.#deps.acceptsAsset(input.budget)) {
      fieldErrors.push({
        field: "budget.assetCode",
        code: "ASSET_NOT_SUPPORTED",
        message: `PayPal does not take ${input.budget.assetCode} with scale ${input.budget.assetScale}`,
      });
    }
    if (fieldErrors.length > 0 || !delegate || !beneficiary) {
      return failure("INVALID_MANDATE", "The budget is not valid.", { fieldErrors });
    }

    const id = `mandate-${this.#deps.newId?.() ?? randomUUID()}`;
    const mandate: Mandate = {
      id,
      payer: { id: payer.id, displayName: payer.displayName, role: "PAYER" },
      delegate: { id: delegate.id, displayName: delegate.displayName, role: "DELEGATE" },
      beneficiary: { id: beneficiary.id, displayName: beneficiary.displayName, role: "BENEFICIARY" },
      budget: input.budget,
      remainingAuthorizedAmount: { ...input.budget },
      purposePolicy: {
        id: `policy-${id}`,
        allowedPurposes: input.categories,
        eligibleCategories: input.categories,
        merchantConfidence: input.merchantConfidence,
        enforcement: input.enforcement,
      },
      status: "DRAFT",
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      createdAt: now.toISOString(),
    };
    // The only full write of a mandate: it is new, so no reservation exists yet.
    await this.#deps.mandates.save(mandate);
    log.info("budget drafted", {
      mandateId: id,
      delegate: delegate.id,
      budget: formatAmount(input.budget),
      categories: input.categories.join(","),
      enforcement: input.enforcement,
      minimumConfidence: input.merchantConfidence.minimum,
    });
    await this.#record(id, MANDATE_EVENTS.created, actor.partyId);
    return { ok: true, mandate: this.#view(mandate, "PAYER", "NOT_STARTED") };
  }

  async list(actor: Actor, role: ViewerRole): Promise<readonly MandateView[]> {
    const mandates =
      role === "PAYER"
        ? await this.#deps.mandates.listByPayer(actor.partyId)
        : await this.#deps.mandates.listByDelegate(actor.partyId);
    const views: MandateView[] = [];
    for (const stored of mandates) {
      const mandate = await this.#refresh(stored);
      if (role === "DELEGATE" && !DELEGATE_VISIBLE.includes(displayStatus(mandate))) continue;
      views.push(this.#view(mandate, role, await this.#consent(mandate)));
    }
    return views;
  }

  async get(actor: Actor, id: string): Promise<MandateResult<{ mandate: MandateView }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    return { ok: true, mandate: this.#view(access.mandate, access.role, await this.#consent(access.mandate)) };
  }

  /**
   * The payer confirms the budget, and it becomes ACTIVE. Nothing is asked of
   * PayPal and no money moves: each allowed purchase creates a PayPal order
   * for that exact cart, which the payer approves at PayPal.
   */
  async authorize(actor: Actor, id: string): Promise<MandateResult<{ mandate: MandateView }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    if (access.role !== "PAYER") return failure("NOT_THE_PAYER", "Only the payer can authorize this budget.");
    if (access.mandate.status !== "DRAFT") {
      return failure("INVALID_STATE", `A ${access.mandate.status} budget cannot be authorized.`);
    }
    const activated = await this.#deps.mandates.transitionStatus(id, ["DRAFT"], "ACTIVE");
    if (!activated) return failure("INVALID_STATE", "The budget changed while it was being authorized.");
    await this.#record(id, MANDATE_EVENTS.activated, actor.partyId);
    return { ok: true, mandate: this.#view(activated, "PAYER", "GRANTED") };
  }

  /**
   * Blocks the mandate. An order still waiting for the payer can't be paid
   * afterwards: the settlement checks the mandate again before every capture.
   */
  async revoke(
    actor: Actor,
    id: string,
  ): Promise<MandateResult<{ mandate: MandateView; alreadyRevoked: boolean }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    if (access.role !== "PAYER") return failure("NOT_THE_PAYER", "Only the payer can revoke this budget.");

    let mandate = access.mandate;
    const alreadyRevoked = mandate.status === "REVOKED";
    if (!alreadyRevoked) {
      mandate = (await this.#deps.mandates.transitionStatus(id, REVOCABLE, "REVOKED")) ?? (await this.#deps.mandates.getById(id)) ?? mandate;
      await this.#record(id, MANDATE_EVENTS.revoked, actor.partyId);
    }
    return { ok: true, mandate: this.#view(mandate, "PAYER", await this.#consent(mandate)), alreadyRevoked };
  }

  /**
   * The mandate a delegate wants to spend under, for the purchase flow. Same
   * visibility as a read: a stranger gets NOT_FOUND and a delegate sees nothing
   * before the payer confirms. The payer may read the mandate but never spend under it.
   * The purchase policy still checks status, validity and delegate itself.
   */
  async forDelegatePurchase(actor: Actor, id: string): Promise<MandateResult<{ mandate: Mandate }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    if (access.role !== "DELEGATE") {
      return failure("NOT_THE_DELEGATE", "Only the authorized delegate can pay under this budget.");
    }
    return { ok: true, mandate: access.mandate };
  }

  /** The mandate and the actor's role in it, for flows built on a mandate such as errands. Same visibility as a read. */
  async forParticipant(actor: Actor, id: string): Promise<MandateResult<{ mandate: Mandate; role: ViewerRole }>> {
    return this.#access(actor, id);
  }

  /**
   * The mandate's attempts. Open PayPal orders are reconciled first, so an
   * order the payer approved, cancelled or let expire shows as such. Only the
   * payer's view carries the links that approve an order at PayPal.
   */
  async activity(actor: Actor, id: string): Promise<MandateResult<{ activity: MandateActivity }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    if (this.#deps.settlement) {
      try {
        await this.#deps.settlement.refresh(id);
      } catch (error) {
        this.#deps.logWarning?.(`PayPal orders of ${id} not reconciled: ${error instanceof Error ? error.name : "error"}`);
      }
    }
    // Reconciling can give capacity back, so the mandate is read again.
    const mandate = await this.#refresh((await this.#deps.mandates.getById(id)) ?? access.mandate);
    const records = await this.#deps.spending.listByMandate(id);
    const view = this.#view(mandate, access.role, "GRANTED");
    return {
      ok: true,
      activity: buildMandateActivity(mandate, records, {
        approvalLinks: access.role === "PAYER",
        mandateUsable: view.usable,
      }),
    };
  }

  // -------------------------------------------------------------------------

  /** Read from the audit log. COMPAS keeps no other copy of the payer's confirmation. */
  async #consent(mandate: Mandate): Promise<ConsentState> {
    const events = await this.#deps.audit.listByMandate(mandate.id);
    return events.some((event) => event.type === MANDATE_EVENTS.activated) ? "GRANTED" : "NOT_STARTED";
  }

  /**
   * Who may see this mandate, and as what. A stranger gets NOT_FOUND, so the
   * mandate's existence is not revealed. A delegate sees nothing before the payer confirms.
   */
  async #access(
    actor: Actor,
    id: string,
  ): Promise<{ ok: true; mandate: Mandate; role: ViewerRole } | MandateFailure> {
    const stored = await this.#deps.mandates.getById(id);
    if (!stored) return failure("NOT_FOUND", "No such budget.");
    const mandate = await this.#refresh(stored);
    if (mandate.payer.id === actor.partyId) return { ok: true, mandate, role: "PAYER" };
    if (mandate.delegate.id === actor.partyId && DELEGATE_VISIBLE.includes(displayStatus(mandate))) {
      return { ok: true, mandate, role: "DELEGATE" };
    }
    return failure("NOT_FOUND", "No such budget.");
  }

  /** Applies what time says, as a conditional status change: EXPIRED after `expiresAt`. */
  async #refresh(mandate: Mandate): Promise<Mandate> {
    const now = this.#now().getTime();
    if (mandate.status !== "REVOKED" && mandate.status !== "EXPIRED" && now >= new Date(mandate.expiresAt).getTime()) {
      const expired = await this.#deps.mandates.transitionStatus(mandate.id, [mandate.status], "EXPIRED");
      if (expired) await this.#record(mandate.id, MANDATE_EVENTS.expired);
      return expired ?? (await this.#deps.mandates.getById(mandate.id)) ?? mandate;
    }
    return mandate;
  }

  #view(mandate: Mandate, role: ViewerRole, consent: ConsentState): MandateView {
    const now = this.#now().getTime();
    const status = displayStatus(mandate);
    const party = (p: DirectoryParty | Mandate["payer"]): PartyView => ({ id: p.id, displayName: p.displayName });
    const view: MandateView = {
      id: mandate.id,
      status,
      viewerRole: role,
      payer: party(mandate.payer),
      delegate: party(mandate.delegate),
      beneficiary: party(mandate.beneficiary),
      budget: mandate.budget,
      remainingAuthorizedAmount: mandate.remainingAuthorizedAmount,
      purposePolicy: {
        eligibleCategories: mandate.purposePolicy.eligibleCategories,
        enforcement: mandate.purposePolicy.enforcement,
        merchantConfidence: mandate.purposePolicy.merchantConfidence,
      },
      validFrom: mandate.validFrom,
      expiresAt: mandate.expiresAt,
      createdAt: mandate.createdAt,
      usable:
        status === "ACTIVE" &&
        now >= new Date(mandate.validFrom).getTime() &&
        now < new Date(mandate.expiresAt).getTime(),
    };
    if (role === "PAYER") {
      view.authorization = {
        consent,
        canAuthorize: mandate.status === "DRAFT",
        canRevoke: mandate.status !== "REVOKED",
      };
    }
    return view;
  }
}

/**
 * EXHAUSTED is shown, not stored: an ACTIVE mandate with no capacity left.
 * Keeping ACTIVE in storage means a reservation released after an unpaid
 * order is usable again, and a purchase still can't reserve from zero.
 */
export function displayStatus(mandate: Mandate): MandateStatus {
  return mandate.status === "ACTIVE" && /^0+$/.test(mandate.remainingAuthorizedAmount.value) ? "EXHAUSTED" : mandate.status;
}
