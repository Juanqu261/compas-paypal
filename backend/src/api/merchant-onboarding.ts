import { timingSafeEqual } from "node:crypto";
import type { AnalystJobQueue } from "../application/analyst-jobs.ts";
import type { AppealResult } from "../application/analyst-appeals.ts";
import type { CertificateBindingResult } from "../application/bind-merchant-certificate.ts";
import type { MerchantActor, MerchantIdentityService } from "../application/merchant-identity.ts";
import { PAYPAL_IDENTITY_RETURN_PATH } from "../integrations/paypal/paypal-identity-gateway.ts";
import type { AnalystFindingRepository } from "../ports/analyst-finding-repository.ts";
import type { MerchantDirectory } from "../ports/merchant-directory.ts";
import type { JsonResponse } from "./merchant-categories.ts";

export const PAYPAL_IDENTITY_START_PATH = "/paypal/identity/start";
export { PAYPAL_IDENTITY_RETURN_PATH };
export const DEMO_MERCHANT_SESSIONS_PATH = "/demo/merchant-sessions";
export const DEMO_CAMARA_CERTIFICATE_PATH = "/demo/camara-certificate";
export const CERTIFICATE_PATH = "/merchant-onboarding/certificate";
export const ANALYST_JOBS_PATH = "/analyst/jobs";
export const ANALYST_FINDINGS_PATH = "/analyst/findings";
const JOB_PATH = /^\/analyst\/jobs\/(analyst-job-[A-Za-z0-9-]{1,80})$/;
const RESPONSE_PATH = /^\/analyst\/findings\/(finding-[A-Za-z0-9-]{1,80})\/response$/;
const WITHDRAW_PATH = /^\/operator\/findings\/(finding-[A-Za-z0-9-]{1,80})\/withdraw$/;
const MERCHANT_ID = /^[a-z0-9-]{1,64}$/;
/** A certificate is at most 32 KB of text, in a JSON string. */
export const MAX_ONBOARDING_BODY_BYTES = 48 * 1024;

export type ApiResponse = JsonResponse | { status: 302; location: string } | { status: 200; text: string };

export type FeatureMode = { enabled: true } | { enabled: false; reason: string };

/**
 * Whether `POST /analyst/jobs` may start the analyst. On for the local demo,
 * like the demo identity. Each run makes model calls, so
 * `COMPAS_ANALYST_JOBS=disabled` turns it off, and it is never on in
 * production until there is operator authentication.
 */
export function readAnalystJobsMode(env: NodeJS.ProcessEnv = process.env): FeatureMode {
  if (env.NODE_ENV?.trim() === "production") return { enabled: false, reason: "Analyst jobs have no operator authentication yet." };
  if (env.COMPAS_ANALYST_JOBS?.trim().toLowerCase() === "disabled") {
    return { enabled: false, reason: "COMPAS_ANALYST_JOBS is disabled." };
  }
  return { enabled: true };
}

export type MerchantOnboardingDeps = {
  identity: MerchantIdentityService;
  /** False without PayPal credentials: login routes answer 503, never a pretend login. */
  identityConfigured: boolean;
  /** demo/test data: merchant sessions without PayPal. They prove nothing and can't bind a certificate. */
  demoSessions: boolean;
  merchants: MerchantDirectory;
  findings: AnalystFindingRepository;
  bindCertificate: (paypalMerchantId: string, certificateText: unknown) => Promise<CertificateBindingResult>;
  respond: (findingId: string, paypalMerchantId: string, text: unknown) => Promise<AppealResult>;
  withdraw: (findingId: string, reason: unknown) => Promise<AppealResult>;
  jobs: { mode: FeatureMode; queue: AnalystJobQueue };
  /** A bearer token for operator routes. Absent: they answer 503. */
  operatorToken?: string;
  demoCertificateText?: (merchantId: string) => string | undefined;
  /** Where the merchant's browser lands after Log in with PayPal. */
  frontendReturnUrl: string;
};

function bearerMatches(authorization: string | undefined, expected: string): boolean {
  const presented = /^Bearer (.+)$/.exec(authorization?.trim() ?? "")?.[1] ?? "";
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/** Model and gateway failures become HTTP answers that say nothing of the model's output or the merchant's text. */
function analystFailure(error: unknown): JsonResponse {
  switch (errorName(error)) {
    case "NotImplementedError":
      return { status: 503, body: { error: "ANALYST_NOT_CONFIGURED", message: "The analyst's model is not configured here." } };
    case "AnalystOutputError":
    case "AnalystModelError":
      return { status: 422, body: { error: "CERTIFICATE_UNREADABLE", message: "The analyst could not read a verification code and NIT. Nothing was recorded." } };
    default:
      throw error;
  }
}

export function isMerchantOnboardingPath(pathname: string): boolean {
  return (
    pathname === PAYPAL_IDENTITY_START_PATH ||
    pathname === PAYPAL_IDENTITY_RETURN_PATH ||
    pathname === DEMO_MERCHANT_SESSIONS_PATH ||
    pathname === DEMO_CAMARA_CERTIFICATE_PATH ||
    pathname === CERTIFICATE_PATH ||
    pathname === ANALYST_JOBS_PATH ||
    pathname === ANALYST_FINDINGS_PATH ||
    JOB_PATH.test(pathname) ||
    RESPONSE_PATH.test(pathname) ||
    WITHDRAW_PATH.test(pathname)
  );
}

/**
 * Merchant onboarding and the analyst. A merchant session comes from Log in
 * with PayPal (or, in the demo, from a session that proves nothing). The
 * analyst's findings are about merchants only: no payer, delegate or errand.
 */
export async function handleMerchantOnboardingRequest(
  request: { method: string; url: URL; authorization?: string; body?: unknown },
  deps: MerchantOnboardingDeps,
): Promise<ApiResponse> {
  const { pathname, searchParams } = request.url;
  const method = request.method;
  const merchant = (): MerchantActor | undefined => deps.identity.authenticate(request.authorization);
  const body = (request.body ?? {}) as Record<string, unknown>;

  if (pathname === PAYPAL_IDENTITY_START_PATH && method === "GET") {
    if (!deps.identityConfigured) {
      return { status: 503, body: { error: "PAYPAL_NOT_CONFIGURED", message: "Log in with PayPal is not configured here." } };
    }
    const location = await deps.identity.startLogin(searchParams.get("merchantId") ?? "");
    return location ? { status: 302, location } : { status: 404, body: { error: "UNKNOWN_MERCHANT" } };
  }

  if (pathname === PAYPAL_IDENTITY_RETURN_PATH && method === "GET") {
    const back = new URL(deps.frontendReturnUrl);
    const state = searchParams.get("state") ?? "";
    const code = searchParams.get("code") ?? "";
    // The session token goes in the fragment: browsers never send it to a server or put it in a Referer.
    if (!state || !code || !deps.identityConfigured) {
      back.hash = new URLSearchParams({ merchantLoginError: "LOGIN_CANCELLED" }).toString();
      return { status: 302, location: back.toString() };
    }
    const result = await deps.identity.completeLogin(state, code);
    back.hash = new URLSearchParams(
      result.ok ? { merchantSession: result.token, merchantId: result.actor.merchantId } : { merchantLoginError: result.code },
    ).toString();
    return { status: 302, location: back.toString() };
  }

  if (pathname === DEMO_MERCHANT_SESSIONS_PATH && method === "POST") {
    if (!deps.demoSessions) return { status: 503, body: { error: "IDENTITY_NOT_CONFIGURED" } };
    const session = typeof body.merchantId === "string" ? await deps.identity.startDemoSession(body.merchantId) : undefined;
    return session
      ? { status: 201, body: { token: session.token, merchant: session.actor, identity: "DEMO" } }
      : { status: 404, body: { error: "UNKNOWN_MERCHANT" } };
  }

  if (pathname === DEMO_CAMARA_CERTIFICATE_PATH && method === "GET") {
    const text = deps.demoCertificateText?.(searchParams.get("merchantId") ?? "");
    return text ? { status: 200, text } : { status: 404, body: { error: "NO_DEMO_CERTIFICATE" } };
  }

  if (pathname === CERTIFICATE_PATH && method === "POST") {
    const actor = merchant();
    if (!actor) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A merchant session is required." } };
    try {
      const result = await deps.bindCertificate(actor.paypalMerchantId, body.certificateText);
      return result.ok
        ? { status: 201, body: { finding: result.finding } }
        : { status: 400, body: { error: result.code, message: result.message } };
    } catch (error) {
      return analystFailure(error);
    }
  }

  if (pathname === ANALYST_JOBS_PATH && method === "POST") {
    if (!deps.jobs.mode.enabled) return { status: 403, body: { error: "ANALYST_JOBS_DISABLED", message: deps.jobs.mode.reason } };
    const merchantId = typeof body.merchantId === "string" && MERCHANT_ID.test(body.merchantId) ? body.merchantId : "";
    if (!merchantId || !(await deps.merchants.getById(merchantId))) return { status: 404, body: { error: "UNKNOWN_MERCHANT" } };
    return { status: 202, body: { job: deps.jobs.queue.enqueue(merchantId) } };
  }

  const job = JOB_PATH.exec(pathname);
  if (job && method === "GET") {
    const found = deps.jobs.queue.get(job[1]);
    return found ? { status: 200, body: { job: found } } : { status: 404, body: { error: "not_found" } };
  }

  if (pathname === ANALYST_FINDINGS_PATH && method === "GET") {
    const directory = await deps.merchants.getById(searchParams.get("merchantId") ?? "");
    if (!directory) return { status: 404, body: { error: "UNKNOWN_MERCHANT" } };
    // Merchant data only. Visible to the merchant itself, and to anyone in a demo.
    const actor = merchant();
    if (!deps.demoSessions && actor?.paypalMerchantId !== directory.paypalMerchantId) {
      return { status: 401, body: { error: "UNAUTHENTICATED", message: "The merchant's session is required." } };
    }
    return { status: 200, body: { merchantId: directory.id, findings: await deps.findings.listByMerchant(directory.paypalMerchantId) } };
  }

  const response = RESPONSE_PATH.exec(pathname);
  if (response && method === "POST") {
    const actor = merchant();
    if (!actor) return { status: 401, body: { error: "UNAUTHENTICATED", message: "A merchant session is required." } };
    return appealResponse(await deps.respond(response[1], actor.paypalMerchantId, body.text));
  }

  const withdraw = WITHDRAW_PATH.exec(pathname);
  if (withdraw && method === "POST") {
    if (!deps.operatorToken) return { status: 503, body: { error: "OPERATOR_NOT_CONFIGURED" } };
    if (!bearerMatches(request.authorization, deps.operatorToken)) return { status: 401, body: { error: "UNAUTHENTICATED" } };
    return appealResponse(await deps.withdraw(withdraw[1], body.reason));
  }

  return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
}

function appealResponse(result: AppealResult): JsonResponse {
  if (result.ok) return { status: 200, body: { finding: result.judgment } };
  const status = { NOT_FOUND: 404, NOT_YOUR_FINDING: 403, INVALID_STATE: 409, INVALID_TEXT: 400 }[result.code];
  return { status, body: { error: result.code, message: result.message } };
}
