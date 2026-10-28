"use client";

import { useState } from "react";
import { compasApi, errorCode } from "@/features/compas/api/client";
import { useResource } from "@/features/compas/api/hooks";
import { DEMO_PARTY_IDS } from "@/features/compas/demo-identities";
import { AgentConsentCard } from "./AgentConsentCard";

const ANDREA = DEMO_PARTY_IDS.andrea;

/**
 * Where an MCP client's browser lands after `GET /oauth/authorize`. The demo
 * signs in as Andrea, the delegate. Whatever she answers goes back to the
 * client's own redirect URI, which COMPAS checked when the client registered.
 */
export function AuthorizeAgent({ requestId }: { requestId: string | null }) {
  const consent = useResource(requestId ? `authorize-agent:${requestId}` : null, () => compasApi.agentConsentRequest(ANDREA, requestId ?? ""));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  const answer = async (decision: { approve: true; errandIds: readonly string[] } | { approve: false }) => {
    if (!requestId) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const redirectTo = await compasApi.answerAgentConsent(ANDREA, requestId, decision);
      const target = new URL(redirectTo);
      // COMPAS only registers https and loopback http redirect URIs; refuse to navigate anywhere else.
      if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("BAD_REDIRECT");
      window.location.assign(target.toString());
    } catch (error) {
      setProblem(errorCode(error));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-8">
      <p className="text-sm font-semibold tracking-wide text-route-deep uppercase">Demo · you are signed in as Andrea</p>
      <h1 className="mt-1 font-display text-3xl text-ink">An AI agent is asking for access</h1>
      <div className="mt-6">
        {!requestId ? (
          <p className="text-ink-soft">This page opens from an AI agent’s sign-in. There is no request here.</p>
        ) : consent.resource.status === "loading" ? (
          <p className="text-ink-soft">Looking up the request…</p>
        ) : consent.resource.status === "error" ? (
          <p role="alert" className="text-ink">
            This request expired or was already answered. Start the sign-in again from the agent.
          </p>
        ) : (
          <AgentConsentCard
            key={consent.resource.data.requestId}
            request={consent.resource.data}
            busy={busy}
            {...(problem ? { error: `Couldn’t answer (${problem}).` } : {})}
            onAllow={(errandIds) => void answer({ approve: true, errandIds })}
            onRefuse={() => void answer({ approve: false })}
          />
        )}
      </div>
    </main>
  );
}
