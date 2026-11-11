import type { Actor } from "../application/mandates.ts";
import type { CapabilitiesService } from "../application/capabilities.ts";
import type { AuthoritativeRefund } from "../application/capabilities.ts";
import { readRefund, type PayPalRefundPorts } from "../integrations/paypal/paypal-refunds.ts";
import type { JsonResponse } from "./merchant-categories.ts";

export const CAPABILITIES_PATH = "/capabilities";
export const PAYPAL_WEBHOOK_PATH = "/paypal/webhooks";
export const MAX_CAPABILITY_BODY_BYTES = 16 * 1024;

const PLAN_ROUTE = /^\/capabilities\/care-plans\/(care-[A-Za-z0-9-]{1,80})(?:\/(pause|resume|revoke|cycles))?$/;
const CONFIRM_ROUTE = /^\/capabilities\/care-plans\/(care-[A-Za-z0-9-]{1,80})\/cycles\/(\d{4}-\d{2})\/confirm$/;

export function isCapabilitiesPath(pathname: string): boolean {
  return pathname === CAPABILITIES_PATH || pathname.startsWith(`${CAPABILITIES_PATH}/`);
}

type Request = { method: string; url: URL; body: unknown };

function ok(body: unknown, status = 200): JsonResponse {
  return { status, body: body as JsonResponse["body"] };
}

function fromResult(result: { ok: true; value: unknown } | { ok: false; status: number; error: string; message: string }): JsonResponse {
  if (!result.ok) {
    if (result.error === "PENDING_CAPTURE") return ok({ held: true, error: result.error, message: result.message }, 200);
    return { status: result.status, body: { error: result.error, message: result.message } };
  }
  return ok(result.value);
}

export async function handleCapabilitiesRequest(request: Request, actor: Actor, capabilities: CapabilitiesService): Promise<JsonResponse> {
  const path = request.url.pathname;
  if (request.method === "POST" && path === "/capabilities/story") return fromResult(await capabilities.openStory(actor));
  if (request.method === "POST" && path === "/capabilities/capture") return fromResult(await capabilities.recordSimulatedCapture(actor));
  if (request.method === "GET" && path === "/capabilities/story") return fromResult(await capabilities.storyFor(actor));
  if (request.method === "POST" && path === "/capabilities/preview") {
    const fixture = isRecord(request.body) ? request.body.fixture : undefined;
    if (fixture !== "medication" && fixture !== "alcohol") {
      return { status: 400, body: { error: "INVALID_INPUT", message: "fixture must be medication or alcohol." } };
    }
    return fromResult(await capabilities.previewFixture(actor, fixture));
  }
  if (request.method === "POST" && path === "/capabilities/preview-covered") return fromResult(await capabilities.previewCovered(actor));
  if (request.method === "GET" && path === "/capabilities/compare") return ok({ comparison: capabilities.compareFixture() });
  if (request.method === "GET" && path === "/capabilities/partition") return ok({ partition: capabilities.partitionFixture() });
  if (request.method === "POST" && path === "/capabilities/evidence") return fromResult(await capabilities.submitEvidence(actor, request.body));
  if (request.method === "GET" && path === "/capabilities/evidence") {
    const purchaseId = request.url.searchParams.get("purchaseId") ?? "";
    return fromResult(await capabilities.listEvidence(actor, purchaseId));
  }
  if (request.method === "POST" && path === "/capabilities/refunds/simulate") return fromResult(await capabilities.simulateRefund(actor, request.body));
  if (request.method === "GET" && path === "/capabilities/refunds") {
    const purchaseId = request.url.searchParams.get("purchaseId") ?? "";
    return fromResult(await capabilities.listRefunds(actor, purchaseId));
  }
  if (request.method === "GET" && path === "/capabilities/care-plans") return fromResult(await capabilities.listPlans(actor));
  const confirm = CONFIRM_ROUTE.exec(path);
  if (request.method === "POST" && confirm) return fromResult(await capabilities.confirmCycle(actor, confirm[1], confirm[2]));
  const plan = PLAN_ROUTE.exec(path);
  if (plan && request.method === "GET" && !plan[2]) return fromResult(await capabilities.getPlan(actor, plan[1]));
  if (plan && request.method === "POST" && plan[2] === "cycles") return fromResult(await capabilities.generateCycle(actor, plan[1]));
  if (plan && request.method === "POST" && plan[2] === "pause") return fromResult(await capabilities.setPlanStatus(actor, plan[1], "PAUSED"));
  if (plan && request.method === "POST" && plan[2] === "resume") return fromResult(await capabilities.setPlanStatus(actor, plan[1], "ACTIVE"));
  if (plan && request.method === "POST" && plan[2] === "revoke") return fromResult(await capabilities.setPlanStatus(actor, plan[1], "REVOKED"));
  return { status: 404, body: { error: "not_found" } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * PayPal webhook. The body amount is not applied. After the signature
 * verifies, the refund is read from PayPal and that read is what credits capacity.
 */
export async function handlePayPalWebhook(input: {
  headers: Record<string, string | undefined>;
  event: unknown;
  ports: PayPalRefundPorts;
  serviceForCapture: (captureId: string) => Pick<CapabilitiesService, "rememberEvent" | "applyAuthoritativeRefund"> | undefined;
  /** Used when the verified refund's capture is not indexed yet. No credit. */
}): Promise<JsonResponse> {
  const event = isRecord(input.event) ? input.event : undefined;
  const eventId = typeof event?.id === "string" ? event.id : undefined;
  const verdict = await input.ports.verifyWebhook({ headers: input.headers, event: input.event });
  if (!verdict.ok) {
    return { status: 401, body: { error: "INVALID_SIGNATURE", message: "The notification was not verified. Capacity is unchanged." } };
  }
  const eventType = typeof event?.event_type === "string" ? event.event_type : "";
  if (!eventType.includes("REFUND")) return ok({ ignored: true });
  const hinted = readRefund(event?.resource);
  if (!hinted) return { status: 400, body: { error: "UNREADABLE_EVENT", message: "The refund event has no id. Capacity is unchanged." } };
  let authoritative: AuthoritativeRefund;
  try {
    authoritative = await input.ports.getRefund(hinted.paypalRefundId);
  } catch {
    return { status: 502, body: { error: "REFUND_NOT_CONFIRMED", message: "PayPal did not confirm the refund. Capacity is unchanged." } };
  }
  const service = input.serviceForCapture(authoritative.paypalCaptureId);
  if (!service) {
    return { status: 500, body: { error: "UNKNOWN_CAPTURE", message: "The capture is not on file. Capacity is unchanged. A later delivery can retry." } };
  }
  if (eventId && service.rememberEvent(eventId)) return ok({ duplicate: true });
  const applied = await service.applyAuthoritativeRefund(authoritative, "PAYPAL_WEBHOOK", `wh-${authoritative.paypalRefundId}`);
  return fromResult(applied);
}
