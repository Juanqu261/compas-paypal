import { presenterKeyMatches, type PresenterAccounts } from "../integrations/demo-workspaces/demo-accounts.ts";

/**
 * Who may start Act 3's Live Claude mode (Anthropic spend). Scripted mode is
 * always available. Default: presenter-gated when COMPAS_PRESENTER_KEY is set,
 * otherwise open for local demos. Override with COMPAS_LIVE_AGENT_ACCESS=
 * off | presenter | open.
 */
export type LiveAgentAccess = "off" | "presenter" | "open";

export type LiveAgentHealth = "unavailable" | "presenter_only" | "open";

export function readLiveAgentAccess(env: NodeJS.ProcessEnv = process.env): LiveAgentAccess {
  const raw = env.COMPAS_LIVE_AGENT_ACCESS?.trim().toLowerCase();
  if (raw === "off" || raw === "presenter" || raw === "open") return raw;
  return env.COMPAS_PRESENTER_KEY?.trim() ? "presenter" : "open";
}

export function liveAgentHealth(deps: {
  modelConfigured: boolean;
  access: LiveAgentAccess;
}): LiveAgentHealth {
  if (!deps.modelConfigured || deps.access === "off") return "unavailable";
  if (deps.access === "presenter") return "presenter_only";
  return "open";
}

export function authorizeLiveStart(deps: {
  access: LiveAgentAccess;
  modelConfigured: boolean;
  presenter: PresenterAccounts;
  body: unknown;
}): { ok: true } | { ok: false; code: "LIVE_UNAVAILABLE" | "LIVE_FORBIDDEN"; message: string } {
  if (!deps.modelConfigured || deps.access === "off") {
    return { ok: false, code: "LIVE_UNAVAILABLE", message: "Live Claude agent is not available on this server." };
  }
  if (deps.access === "open") return { ok: true };
  const key = typeof deps.body === "object" && deps.body !== null ? (deps.body as { presenterKey?: unknown }).presenterKey : undefined;
  if (!presenterKeyMatches(deps.presenter, key)) {
    return {
      ok: false,
      code: "LIVE_FORBIDDEN",
      message: "Live Claude agent is limited to the presenter link on this deploy.",
    };
  }
  return { ok: true };
}

/** Default public budget for live Anthropic spend per visitor workspace. */
export const DEFAULT_LIVE_RUNS_PER_DEMO = 3;

export function readLiveRunsPerDemo(env: NodeJS.ProcessEnv = process.env): number {
  if (env.COMPAS_DEMO_LIMITS?.trim().toLowerCase() === "off") return Infinity;
  const raw = env.COMPAS_LIMIT_LIVE_AGENT_RUNS_PER_DEMO?.trim();
  if (raw && /^\d{1,7}$/.test(raw)) return Number(raw);
  return DEFAULT_LIVE_RUNS_PER_DEMO;
}
