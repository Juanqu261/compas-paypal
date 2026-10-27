import type { Actor, MandateErrorCode, MandateFailure, MandateService } from "../application/mandates.ts";
import type { JsonResponse } from "./merchant-categories.ts";

export const MANDATES_PATH = "/mandates";
export const ME_PATH = "/me";
export const PARTICIPANTS_PATH = "/demo/participants";
/** A mandate request is small. Anything larger is refused before it is parsed. */
export const MAX_MANDATE_BODY_BYTES = 8 * 1024;

const MANDATE_ROUTE = /^\/mandates\/(mandate-[A-Za-z0-9-]{1,80})(?:\/(authorize|revoke|spending))?$/;

const STATUS_BY_ERROR: Record<MandateErrorCode, number> = {
  INVALID_MANDATE: 400,
  NOT_FOUND: 404,
  NOT_THE_PAYER: 403,
  NOT_THE_DELEGATE: 403,
  INVALID_STATE: 409,
};

/** Facts about this runtime that every screen should be able to show. */
export type RuntimeFacts = {
  identity: "DEMO";
  /** IN_MEMORY_DEMO: a restart loses every mandate. POSTGRES: DATABASE_URL, the compas schema. */
  persistence: "IN_MEMORY_DEMO" | "POSTGRES";
  /** Whether the PayPal app is configured. COMPAS only ever talks to the sandbox. */
  paypal: "sandbox" | "not_configured";
  /**
   * PINNED: only the payer's own PayPal account (DEMO_PAYER_PAYPAL_ID) can
   * approve an order COMPAS captures. ANY_ACCOUNT: whoever approves it pays.
   */
  payerApproval: "PINNED" | "ANY_ACCOUNT";
  /** Whether a demo session may create PayPal orders through POST /purchases. */
  purchases: "enabled" | "disabled_for_demo" | "not_configured";
};

export function isMandateApiPath(pathname: string): boolean {
  return (
    pathname === MANDATES_PATH ||
    pathname === ME_PATH ||
    pathname === PARTICIPANTS_PATH ||
    MANDATE_ROUTE.test(pathname)
  );
}

function fail(result: MandateFailure): JsonResponse {
  return {
    status: STATUS_BY_ERROR[result.code],
    body: {
      error: result.code,
      message: result.message,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    },
  };
}

/**
 * Mandate routes for an authenticated actor. The actor comes from the
 * session, never from the body or the query. Bodies are parsed JSON or
 * undefined. The response never carries a PayPal account id or token. Only
 * the payer's spending view carries the links that approve an order at PayPal.
 */
export async function handleMandateRequest(
  request: { method: string; url: URL; body?: unknown },
  actor: Actor,
  deps: { service: MandateService; facts: RuntimeFacts },
): Promise<JsonResponse> {
  const { method, url } = request;
  const { service, facts } = deps;

  if (url.pathname === ME_PATH && method === "GET") {
    const party = await service.self(actor);
    if (!party) return { status: 401, body: { error: "UNAUTHENTICATED" } };
    return { status: 200, body: { party, ...facts } };
  }

  if (url.pathname === PARTICIPANTS_PATH && method === "GET") {
    return {
      status: 200,
      body: { dataLabel: "demo/test data", participants: await service.participants(actor) },
    };
  }

  if (url.pathname === MANDATES_PATH) {
    if (method === "GET") {
      const role = url.searchParams.get("role");
      if (role !== "payer" && role !== "delegate") {
        return { status: 400, body: { error: "INVALID_ROLE", message: "role must be payer or delegate" } };
      }
      const mandates = await service.list(actor, role === "payer" ? "PAYER" : "DELEGATE");
      return { status: 200, body: { role, mandates, persistence: facts.persistence } };
    }
    if (method === "POST") {
      const result = await service.create(actor, request.body);
      return result.ok
        ? { status: 201, body: { mandate: result.mandate, persistence: facts.persistence } }
        : fail(result);
    }
    return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
  }

  const match = MANDATE_ROUTE.exec(url.pathname);
  if (!match) return { status: 404, body: { error: "not_found" } };
  const [, id, action] = match;

  if (!action && method === "GET") {
    const result = await service.get(actor, id);
    return result.ok ? { status: 200, body: { mandate: result.mandate } } : fail(result);
  }
  if (action === "authorize" && method === "POST") {
    const result = await service.authorize(actor, id);
    return result.ok ? { status: 200, body: { mandateId: id, mandate: result.mandate } } : fail(result);
  }
  if (action === "revoke" && method === "POST") {
    const result = await service.revoke(actor, id);
    return result.ok
      ? { status: 200, body: { mandate: result.mandate, alreadyRevoked: result.alreadyRevoked } }
      : fail(result);
  }
  if (action === "spending" && method === "GET") {
    const result = await service.activity(actor, id);
    return result.ok ? { status: 200, body: { activity: result.activity } } : fail(result);
  }
  return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
}
