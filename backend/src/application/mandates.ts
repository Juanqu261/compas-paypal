import { randomUUID } from "node:crypto";
import type { AuditEvent } from "../domain/audit.ts";
import type {
  Mandate,
  MandateStatus,
  MerchantConfidencePolicy,
  PurposeEnforcement,
} from "../domain/mandate.ts";
import { COMPAS_CATEGORIES, type CompasCategory, isCompasCategory } from "../domain/merchant-category.ts";
import type { MoneyAmount } from "../domain/money.ts";
import { ACCEPTABLE_CONFIDENCE_LEVELS, type AcceptableConfidence } from "../domain/trust-matrix.ts";
import { NotImplementedError } from "../lib/not-implemented.ts";
import type { AuditRepository } from "../ports/audit-repository.ts";
import type { MandateRepository } from "../ports/mandate-repository.ts";
import type { OpenPaymentsGateway } from "../ports/open-payments-gateway.ts";
import type { DirectoryParty, PartyDirectory } from "../ports/party-directory.ts";
import type { SpendingLog } from "../ports/spending-log.ts";
import { buildMandateActivity, type MandateActivity } from "./mandate-activity.ts";

// ---------------------------------------------------------------------------
// Limits and request shape
// ---------------------------------------------------------------------------

/** A demo budget never authorizes more than this many whole units of its asset. */
export const MAX_BUDGET_WHOLE_UNITS = 10_000n;
/** Wallet asset scales above this are refused as malformed. */
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

function parseMoney(value: unknown, field: string, errors: FieldError[]): MoneyAmount | undefined {
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
// Authorization state: read from the grant store and the audit log
// ---------------------------------------------------------------------------

/**
 * Where the payer's consent stands. COMPAS keeps no second copy of it: it is
 * read from the gateway's GrantStore (the grant itself, `compas.payer_grants`
 * with a database) and from the mandate's audit events.
 */
export type ConsentState =
  /** COMPAS never asked the payer's wallet for a grant. */
  | "NOT_STARTED"
  /** A grant was requested. The payer has not finished consent, or the request was lost. */
  | "WAITING_FOR_PAYER"
  /** The finish callback verified the consent and the grant is, or was, active. */
  | "GRANTED";

export type GrantCancellationState =
  /** No grant was ever requested, so nothing to cancel at the provider. */
  | "NOT_NEEDED"
  /** COMPAS already blocks the mandate. The grant still exists: the provider has not confirmed the cancellation. */
  | "PENDING"
  /** The grant is gone: cancelled at the provider, or it never finished. */
  | "DONE";

/** Mandate lifecycle events in the audit log. Payloads hold codes only, never a token. */
export const MANDATE_EVENTS = {
  created: "MANDATE_CREATED",
  authorizationStarted: "MANDATE_AUTHORIZATION_STARTED",
  authorizationFailed: "MANDATE_AUTHORIZATION_FAILED",
  activated: "MANDATE_ACTIVATED",
  revoked: "MANDATE_REVOKED",
  expired: "MANDATE_EXPIRED",
  grantCancelled: "PAYER_GRANT_CANCELLED",
  grantCancelFailed: "PAYER_GRANT_CANCEL_FAILED",
} as const;

/** The only thing the service reads from a stored grant. GrantStore satisfies it; tokens are never touched. */
export type PayerGrantStateReader = {
  get(grantKey: string): Promise<{ state: "PENDING" | "ACTIVE" } | undefined>;
};

type AuthorizationState = {
  consent: ConsentState;
  grantState?: "PENDING" | "ACTIVE";
  grantCancellation?: GrantCancellationState;
  lastError?: { operation: "AUTHORIZE" | "CANCEL"; code: string };
};

function lastOf(events: readonly AuditEvent[], types: readonly string[]): AuditEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (types.includes(events[index].type)) return events[index];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type PartyView = { id: string; displayName: string };

export type MandateAuthorizationView = {
  consent: ConsentState;
  grantCancellation?: GrantCancellationState;
  lastError?: { operation: "AUTHORIZE" | "CANCEL"; code: string };
  canAuthorize: boolean;
  canRevoke: boolean;
};

/**
 * One mandate for the person looking at it. No wallet address, grant, token
 * or Open Payments payload is in here. `authorization` is for the payer only.
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

export type PayerWalletView =
  | { status: "RESOLVED"; assetCode: string; assetScale: number }
  | { status: "NOT_CONFIGURED" | "OPEN_PAYMENTS_NOT_CONFIGURED" | "UNAVAILABLE" };

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type MandateErrorCode =
  | "INVALID_MANDATE"
  | "NOT_FOUND"
  | "NOT_THE_PAYER"
  | "INVALID_STATE"
  | "PAYER_WALLET_NOT_CONFIGURED"
  | "OPEN_PAYMENTS_NOT_CONFIGURED"
  | "PAYER_GRANTS_DISABLED_FOR_DEMO"
  | "ASSET_MISMATCH"
  | "AUTHORIZATION_FAILED";

export type MandateFailure = {
  ok: false;
  code: MandateErrorCode;
  message: string;
  fieldErrors?: readonly FieldError[];
  /** The gateway's error code, when the provider refused. Never a token or a payload. */
  providerCode?: string;
};

export type MandateResult<T> = ({ ok: true } & T) | MandateFailure;

function failure(code: MandateErrorCode, message: string, extra: Partial<MandateFailure> = {}): MandateFailure {
  return { ok: false, code, message, ...extra };
}

/**
 * Gateway errors carry a `code`. A gateway that is not configured throws
 * NotImplementedError. Nothing here reads a message for a token.
 */
function gatewayErrorCode(error: unknown): string {
  if (error instanceof NotImplementedError) return "NOT_CONFIGURED";
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z_]{2,40}$/.test(code) ? code : "UPSTREAM";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type MandateServiceDeps = {
  /** PostgresMandateRepository with DATABASE_URL, InMemoryMandateRepository without. */
  mandates: MandateRepository;
  parties: PartyDirectory;
  payments: Pick<
    OpenPaymentsGateway,
    "resolveWallet" | "startPayerGrant" | "cancelPayerGrant" | "readGrantSpentAmounts"
  >;
  /** The same GrantStore instance the gateway writes. Only `state` is read. */
  grants: PayerGrantStateReader;
  /** The mandate's lifecycle events. PostgresAuditRepository with DATABASE_URL. */
  audit: AuditRepository;
  spending: Pick<SpendingLog, "listByMandate">;
  /**
   * Whether this caller may ask a payer's wallet for a grant. The server sets
   * it to false for demo sessions against a configured Open Payments client,
   * unless the operator opted in on the test network.
   */
  payerGrants?: { allowed: true } | { allowed: false; reason: string };
  now?: () => Date;
  newId?: () => string;
  logWarning?: (message: string) => void;
};

/** Statuses a delegate sees. Before the payer consents there is no permission to show. */
const DELEGATE_VISIBLE: readonly MandateStatus[] = ["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"];
/** Every status a mandate can be revoked from. */
const REVOCABLE: readonly MandateStatus[] = ["DRAFT", "PENDING_AUTHORIZATION", "ACTIVE", "EXHAUSTED", "EXPIRED"];

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
    await this.#deps.audit.append({
      id: `mandate-event-${this.#deps.newId?.() ?? randomUUID()}`,
      type,
      occurredAt: this.#now().toISOString(),
      mandateId,
      ...(actorId ? { actorId } : {}),
      payload,
    });
  }

  async payerWallet(actor: Actor): Promise<PayerWalletView> {
    const party = await this.#deps.parties.getById(actor.partyId);
    if (!party?.walletAddressUrl) return { status: "NOT_CONFIGURED" };
    try {
      const wallet = await this.#deps.payments.resolveWallet(party.walletAddressUrl);
      return { status: "RESOLVED", assetCode: wallet.assetCode, assetScale: wallet.assetScale };
    } catch (error) {
      return gatewayErrorCode(error) === "NOT_CONFIGURED"
        ? { status: "OPEN_PAYMENTS_NOT_CONFIGURED" }
        : { status: "UNAVAILABLE" };
    }
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

    // When the payer's wallet can be read, the budget must use its asset.
    const wallet = await this.payerWallet(actor);
    if (
      wallet.status === "RESOLVED" &&
      (wallet.assetCode !== input.budget.assetCode || wallet.assetScale !== input.budget.assetScale)
    ) {
      fieldErrors.push({
        field: "budget.assetCode",
        code: "ASSET_MISMATCH",
        message: `the payer wallet uses ${wallet.assetCode} with scale ${wallet.assetScale}`,
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
    await this.#record(id, MANDATE_EVENTS.created, actor.partyId);
    return { ok: true, mandate: this.#view(mandate, "PAYER", { consent: "NOT_STARTED" }) };
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
      views.push(this.#view(mandate, role, await this.#authorization(mandate)));
    }
    return views;
  }

  async get(actor: Actor, id: string): Promise<MandateResult<{ mandate: MandateView }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    return { ok: true, mandate: this.#view(access.mandate, access.role, await this.#authorization(access.mandate)) };
  }

  /**
   * Asks the payer's wallet for an outgoing-payment grant capped at the budget.
   * The mandate becomes PENDING_AUTHORIZATION. It becomes ACTIVE only after
   * the finish callback verified the consent and the stored grant is ACTIVE.
   */
  async startAuthorization(
    actor: Actor,
    id: string,
  ): Promise<MandateResult<{ mandate: MandateView; redirectUrl: string }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    if (access.role !== "PAYER") return failure("NOT_THE_PAYER", "Only the payer can authorize this budget.");
    const { mandate } = access;
    if (mandate.status !== "DRAFT" && mandate.status !== "PENDING_AUTHORIZATION") {
      return failure("INVALID_STATE", `A ${mandate.status} budget cannot be authorized.`);
    }
    const policy = this.#deps.payerGrants ?? { allowed: true };
    if (!policy.allowed) {
      return failure("PAYER_GRANTS_DISABLED_FOR_DEMO", policy.reason);
    }

    const payer = await this.#deps.parties.getById(mandate.payer.id);
    if (!payer?.walletAddressUrl) {
      return failure("PAYER_WALLET_NOT_CONFIGURED", "The payer has no Open Payments wallet configured.");
    }

    let redirectUrl: string;
    try {
      ({ redirectUrl } = await this.#deps.payments.startPayerGrant({
        grantKey: mandate.id,
        payerWalletAddressUrl: payer.walletAddressUrl,
        debitLimit: mandate.budget,
      }));
    } catch (error) {
      const code = gatewayErrorCode(error);
      await this.#record(id, MANDATE_EVENTS.authorizationFailed, actor.partyId, { code });
      if (code === "NOT_CONFIGURED") {
        return failure("OPEN_PAYMENTS_NOT_CONFIGURED", "Open Payments is not configured in this environment.");
      }
      if (code === "ASSET_MISMATCH") {
        return failure("ASSET_MISMATCH", "The budget does not use the payer wallet's asset.", { providerCode: code });
      }
      return failure("AUTHORIZATION_FAILED", "The payer's wallet did not start the authorization.", { providerCode: code });
    }

    const pending =
      (await this.#deps.mandates.transitionStatus(id, ["DRAFT", "PENDING_AUTHORIZATION"], "PENDING_AUTHORIZATION")) ??
      (await this.#deps.mandates.getById(id)) ??
      mandate;
    await this.#record(id, MANDATE_EVENTS.authorizationStarted, actor.partyId);
    return { ok: true, mandate: this.#view(pending, "PAYER", await this.#authorization(pending)), redirectUrl };
  }

  /**
   * Called by the finish callback only after `finishPayerGrant` verified the
   * interaction hash and the auth server issued an access token. It checks
   * the stored grant again before activating. `payerAuthorization=granted` in
   * a URL never reaches here on its own.
   */
  async completeAuthorization(grantKey: string): Promise<"ACTIVATED" | "CANCELLED_AFTER_REVOKE" | "IGNORED"> {
    const stored = await this.#deps.mandates.getById(grantKey);
    if (!stored) {
      this.#deps.logWarning?.(`Grant finished for unknown mandate ${grantKey}.`);
      return "IGNORED";
    }
    const grant = await this.#deps.grants.get(grantKey);
    if (grant?.state !== "ACTIVE") {
      this.#deps.logWarning?.(`Grant for mandate ${grantKey} is not ACTIVE in the grant store. Status unchanged.`);
      return "IGNORED";
    }
    // With the stored grant ACTIVE, #refresh moves PENDING_AUTHORIZATION to ACTIVE
    // in one conditional update and records the activation once.
    const mandate = await this.#refresh(stored);

    if (mandate.status === "REVOKED") {
      // Revoked while the payer was consenting: the new grant must not stay usable.
      await this.#cancelGrant(mandate.id);
      return "CANCELLED_AFTER_REVOKE";
    }
    if (stored.status === "PENDING_AUTHORIZATION" && mandate.status === "ACTIVE") return "ACTIVATED";
    if (mandate.status !== "PENDING_AUTHORIZATION") {
      this.#deps.logWarning?.(`Grant finished for mandate ${grantKey} in status ${mandate.status}. Status unchanged.`);
      return "IGNORED";
    }
    const activated = await this.#deps.mandates.transitionStatus(grantKey, ["PENDING_AUTHORIZATION"], "ACTIVE");
    if (!activated) return "IGNORED";
    await this.#record(grantKey, MANDATE_EVENTS.activated);
    return "ACTIVATED";
  }

  /**
   * Blocks the mandate in COMPAS first, then cancels the grant at the payer's
   * wallet. If the provider can't be reached, the mandate stays REVOKED and
   * the grant stays stored: the cancellation is PENDING. Revoking again retries it.
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
    if (await this.#deps.grants.get(id)) await this.#cancelGrant(id);
    return { ok: true, mandate: this.#view(mandate, "PAYER", await this.#authorization(mandate)), alreadyRevoked };
  }

  async activity(
    actor: Actor,
    id: string,
  ): Promise<MandateResult<{ activity: MandateActivity; providerSpent?: MoneyAmount; providerSpentAvailable: boolean }>> {
    const access = await this.#access(actor, id);
    if (!access.ok) return access;
    const records = await this.#deps.spending.listByMandate(id);
    const activity = buildMandateActivity(access.mandate, records);

    // The provider's own figure for what the grant has debited, for the payer.
    let providerSpent: MoneyAmount | undefined;
    let providerSpentAvailable = false;
    if (access.role === "PAYER" && (await this.#deps.grants.get(id))?.state === "ACTIVE") {
      try {
        const spent = await this.#deps.payments.readGrantSpentAmounts(id);
        providerSpentAvailable = true;
        if (spent.spentDebitAmount) providerSpent = spent.spentDebitAmount;
      } catch (error) {
        this.#deps.logWarning?.(`Grant spent amounts unavailable for ${id}: ${gatewayErrorCode(error)}`);
      }
    }
    return { ok: true, activity, ...(providerSpent ? { providerSpent } : {}), providerSpentAvailable };
  }

  // -------------------------------------------------------------------------

  async #cancelGrant(id: string): Promise<void> {
    try {
      await this.#deps.payments.cancelPayerGrant(id);
      await this.#record(id, MANDATE_EVENTS.grantCancelled);
    } catch (error) {
      const code = gatewayErrorCode(error);
      this.#deps.logWarning?.(`Grant cancellation pending for ${id}: ${code}`);
      await this.#record(id, MANDATE_EVENTS.grantCancelFailed, undefined, { code });
    }
  }

  /** Reads consent from the stored grant, then the audit log. Nothing here is a second copy of the grant. */
  async #authorization(mandate: Mandate): Promise<AuthorizationState> {
    const grant = await this.#deps.grants.get(mandate.id);
    const events = await this.#deps.audit.listByMandate(mandate.id);
    const has = (type: string) => events.some((event) => event.type === type);

    let consent: ConsentState = "NOT_STARTED";
    if (grant?.state === "ACTIVE" || has(MANDATE_EVENTS.activated)) consent = "GRANTED";
    else if (grant?.state === "PENDING" || has(MANDATE_EVENTS.authorizationStarted)) consent = "WAITING_FOR_PAYER";

    const state: AuthorizationState = { consent, ...(grant ? { grantState: grant.state } : {}) };
    if (mandate.status === "REVOKED") {
      state.grantCancellation = grant ? "PENDING" : has(MANDATE_EVENTS.authorizationStarted) ? "DONE" : "NOT_NEEDED";
      const cancel = lastOf(events, [MANDATE_EVENTS.grantCancelled, MANDATE_EVENTS.grantCancelFailed]);
      if (grant && cancel?.type === MANDATE_EVENTS.grantCancelFailed) {
        state.lastError = { operation: "CANCEL", code: cancel.payload.code ?? "UPSTREAM" };
      }
    } else {
      const authorize = lastOf(events, [
        MANDATE_EVENTS.authorizationStarted,
        MANDATE_EVENTS.authorizationFailed,
        MANDATE_EVENTS.activated,
      ]);
      if (authorize?.type === MANDATE_EVENTS.authorizationFailed) {
        state.lastError = { operation: "AUTHORIZE", code: authorize.payload.code ?? "UPSTREAM" };
      }
    }
    return state;
  }

  /**
   * Who may see this mandate, and as what. A stranger gets NOT_FOUND, so the
   * mandate's existence is not revealed. A delegate sees nothing before consent.
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

  /**
   * Applies what time and the grant store say, each as a conditional status
   * change: EXPIRED after `expiresAt`, and ACTIVE when a mandate is still
   * waiting but its stored grant is ACTIVE (the finish callback succeeded at
   * the provider, but its activation did not run).
   */
  async #refresh(mandate: Mandate): Promise<Mandate> {
    const now = this.#now().getTime();
    if (mandate.status !== "REVOKED" && mandate.status !== "EXPIRED" && now >= new Date(mandate.expiresAt).getTime()) {
      const expired = await this.#deps.mandates.transitionStatus(mandate.id, [mandate.status], "EXPIRED");
      if (expired) await this.#record(mandate.id, MANDATE_EVENTS.expired);
      return expired ?? (await this.#deps.mandates.getById(mandate.id)) ?? mandate;
    }
    if (mandate.status === "PENDING_AUTHORIZATION" && (await this.#deps.grants.get(mandate.id))?.state === "ACTIVE") {
      const activated = await this.#deps.mandates.transitionStatus(mandate.id, ["PENDING_AUTHORIZATION"], "ACTIVE");
      if (activated) {
        await this.#record(mandate.id, MANDATE_EVENTS.activated);
        return activated;
      }
    }
    return mandate;
  }

  #view(mandate: Mandate, role: ViewerRole, state: AuthorizationState): MandateView {
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
        consent: state.consent,
        ...(state.grantCancellation ? { grantCancellation: state.grantCancellation } : {}),
        ...(state.lastError ? { lastError: state.lastError } : {}),
        canAuthorize: mandate.status === "DRAFT" || mandate.status === "PENDING_AUTHORIZATION",
        canRevoke: mandate.status !== "REVOKED" || state.grantCancellation === "PENDING",
      };
    }
    return view;
  }
}

/**
 * EXHAUSTED is shown, not stored: an ACTIVE mandate with no capacity left.
 * Keeping ACTIVE in storage means a reservation released after a failed
 * payment is usable again, and a purchase still can't reserve from zero.
 */
export function displayStatus(mandate: Mandate): MandateStatus {
  return mandate.status === "ACTIVE" && /^0+$/.test(mandate.remainingAuthorizedAmount.value) ? "EXHAUSTED" : mandate.status;
}
