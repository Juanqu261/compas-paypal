import type { DemoAgentErrorCode, DemoAgentFailure, DemoAgentRuns } from "../application/demo-agent-run.ts";
import type { Actor } from "../application/mandates.ts";
import type { ApiResponse } from "./oauth.ts";

export const DEMO_AGENT_RUNS_PATH = "/demo/agent-runs";
export const DEMO_AGENT_ERRAND_PATH = "/demo/agent-errand";
export const MAX_DEMO_AGENT_BODY_BYTES = 2 * 1024;

const RUN_ROUTE = /^\/demo\/agent-runs\/(agentrun-[0-9a-f-]{36})(?:\/(consent))?$/;

const STATUS_BY_ERROR: Record<DemoAgentErrorCode, number> = {
  INVALID_RUN: 400,
  INVALID_CONSENT: 400,
  INVALID_MANDATE: 400,
  UNKNOWN_ERRAND: 404,
  UNKNOWN_RUN: 404,
  NOT_FOUND: 404,
  NOT_THE_DELEGATE: 403,
  RUN_ACTIVE: 409,
  NOT_AWAITING_CONSENT: 409,
  INVALID_STATE: 409,
};

export function isDemoAgentPath(pathname: string): boolean {
  return pathname === DEMO_AGENT_RUNS_PATH || pathname === DEMO_AGENT_ERRAND_PATH || RUN_ROUTE.test(pathname);
}

function fail(result: DemoAgentFailure): ApiResponse {
  return { status: STATUS_BY_ERROR[result.code], body: { error: result.code, message: result.message } };
}

/**
 * The demo's scripted agent. Needs a demo session: the delegate who starts a
 * run is the one who answers its consent request. The run is a client of this
 * same server's MCP endpoint; none of these routes can pay or approve anything.
 */
export async function handleDemoAgentRequest(
  request: { method: string; url: URL; body?: unknown },
  actor: Actor,
  deps: { runs: DemoAgentRuns },
): Promise<ApiResponse> {
  const { pathname } = request.url;

  if (pathname === DEMO_AGENT_ERRAND_PATH) {
    if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await deps.runs.suggestErrand(actor, request.url.searchParams.get("mandateId"));
    if (!result.ok) return fail(result);
    return {
      status: 200,
      body: result.available
        ? { available: true, errand: result.errand, dataLabel: "demo/test data" }
        : { available: false, reason: result.reason },
    };
  }

  if (pathname === DEMO_AGENT_RUNS_PATH) {
    if (request.method === "GET") return { status: 200, headers: { "cache-control": "no-store" }, body: { run: deps.runs.latest(actor) ?? null } };
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const result = await deps.runs.start(actor, request.body);
    return result.ok ? { status: 202, body: { run: result.run } } : fail(result);
  }

  const route = RUN_ROUTE.exec(pathname);
  if (route) {
    const [, runId, action] = route;
    if (!action) {
      if (request.method !== "GET") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
      const result = deps.runs.get(actor, runId);
      return result.ok ? { status: 200, headers: { "cache-control": "no-store" }, body: { run: result.run } } : fail(result);
    }
    if (request.method !== "POST") return { status: 405, body: { error: "METHOD_NOT_ALLOWED" } };
    const redirectTo = typeof request.body === "object" && request.body !== null ? (request.body as { redirectTo?: unknown }).redirectTo : undefined;
    const result = deps.runs.consent(actor, runId, redirectTo);
    return result.ok ? { status: 200, body: { run: result.run } } : fail(result);
  }

  return { status: 404, body: { error: "not_found" } };
}
