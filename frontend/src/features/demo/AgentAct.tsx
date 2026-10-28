"use client";

import { useEffect, useRef, useState } from "react";
import { compasApi, errorCode } from "@/features/compas/api/client";
import {
  AGENT_SCENARIOS,
  type AgentEvent,
  type AgentRun,
  type AgentRunStep,
  type AgentScenario,
  type CreateMandateBody,
  type MandateView,
  type PolicyOutcome,
} from "@/features/compas/api/contracts";
import { useMandateList, useResource } from "@/features/compas/api/hooks";
import { DEMO_PARTY_IDS } from "@/features/compas/demo-identities";
import { AgentConsentCard } from "./AgentConsentCard";
import {
  formatMoney,
  isActive,
  type Moment,
  openErrand,
  orderWaiting,
  readTool,
  reasonShort,
  SCENARIO_INFO,
  storyOf,
  tallies,
  toolCallSummary,
  toolLabel,
  type RpcStep,
} from "./agent-view";
import { Connector, FlowDiagram, type Step } from "./flow-diagram";
import { BoxIcon, CheckBadgeIcon, ExternalIcon, PersonIcon, PillIcon, StoreIcon } from "./flow-icons";

const ANDREA = DEMO_PARTY_IDS.andrea;
const PEDRO = DEMO_PARTY_IDS.pedro;
const POLL_MS = 700;
const DAY_MS = 24 * 60 * 60 * 1000;

const BUTTON =
  "rounded-lg bg-ink px-4 py-2 font-semibold text-paper transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";

/** Act 2's manual steps: the work an AI agent replaces. */
const REPLACED: readonly Step[] = [
  { icon: StoreIcon, title: "Find a pharmacy", caption: "Looks for one", tone: "model", state: "done" },
  { icon: PillIcon, title: "Choose the medicine", caption: "Picks it", tone: "model", state: "done" },
  { icon: BoxIcon, title: "Build the order", caption: "Fills the cart", tone: "model", state: "done" },
  { icon: ExternalIcon, title: "Send it", caption: "Sends it to Compas", tone: "model", state: "done" },
];

/** The steps that never change, agent or not. */
const KEPT: readonly Step[] = [
  { icon: CheckBadgeIcon, title: "Compas checks", caption: "Pharmacy, medicine, budget", tone: "ok", state: "done" },
  { icon: PersonIcon, title: "Pedro approves", caption: "At PayPal", tone: "ok", state: "done" },
];

const OUTCOME_CHIP: Record<PolicyOutcome, string> = {
  ALLOW: "bg-route text-paper",
  REVIEW: "bg-buff text-ink",
  DENY: "bg-paper text-ink ring-1 ring-ink/25",
};

function OutcomeChip({ outcome }: { outcome: PolicyOutcome }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_CHIP[outcome]}`}>{outcome}</span>;
}

const MOMENT_EDGE: Record<NonNullable<Moment["result"]>["tone"] | "none", string> = {
  ok: "border-route",
  stopped: "border-buff",
  info: "border-ink/25",
  waiting: "border-ink/40",
  none: "border-ink/15",
};

const RESULT_CHIP: Record<NonNullable<Moment["result"]>["tone"], { chip: string; mark: string }> = {
  ok: { chip: "bg-route/10 text-route-deep", mark: "✓" },
  stopped: { chip: "bg-buff text-ink", mark: "✕" },
  info: { chip: "bg-ink/[0.06] text-ink", mark: "i" },
  waiting: { chip: "bg-paper text-ink ring-1 ring-ink/25 motion-safe:animate-pulse", mark: "…" },
};

const ACTOR_NAME: Record<Moment["actor"], string> = { Andrea: "Andrea", Agent: "The agent", Compas: "Compas", "Web page": "A web page" };

/** The run in plain words: who did what, and what Compas answered. */
function Story({ moments, active, starting }: { moments: readonly Moment[]; active: boolean; starting: boolean }) {
  const last = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) last.current?.scrollIntoView({ block: "nearest" });
  }, [moments.length, active]);

  if (moments.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-ink/25 p-6 text-ink-soft">
        {starting ? "Starting…" : "What happens appears here, one step at a time."}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2.5" aria-live="polite">
      {moments.map((moment, index) => {
        const result = moment.result;
        return (
          <li
            key={moment.n}
            ref={index === moments.length - 1 ? last : undefined}
            className={`rounded-r-xl border-l-4 bg-paper py-2.5 pr-3 pl-4 ${MOMENT_EDGE[result?.tone ?? "none"]}`}
          >
            <p className="text-ink">
              <span className="font-semibold">{ACTOR_NAME[moment.actor]}</span> {moment.text}
            </p>
            {moment.quote ? (
              <blockquote
                className={`mt-1.5 rounded-lg px-3 py-2 text-sm ${moment.actor === "Web page" ? "bg-buff/50 text-ink" : "bg-ink/[0.05] text-ink"}`}
              >
                {moment.actor === "Web page" ? (
                  <span className="mb-0.5 block text-xs font-semibold tracking-wide text-ink-soft uppercase">A planted trap, for the demo</span>
                ) : null}
                “{moment.quote}”
              </blockquote>
            ) : null}
            {result ? (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${RESULT_CHIP[result.tone].chip}`}>
                  <span aria-hidden>{RESULT_CHIP[result.tone].mark}</span>
                  {result.text}
                </span>
                {result.sub ? <span className="text-sm text-ink-soft">{result.sub}</span> : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-black/30 p-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-paper/85">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** One tool call: the line an agent's log would show, with the exact JSON-RPC on the wire one click away. */
function RpcLine({ step }: { step: RpcStep }) {
  const reading = step.tool ? readTool(step) : undefined;
  const summary = step.tool ? toolCallSummary(step) : "";
  return (
    <li className="rounded-lg border border-paper/15 bg-paper/5 px-3 py-2">
      <details className="[&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm text-paper">
            <span className="text-paper/55">MCP </span>
            {step.tool ?? step.method}
          </span>
          {summary ? <span className="font-mono text-xs text-paper/55">{summary}</span> : null}
          <span className="ml-auto flex items-center gap-2">
            {reading?.outcome ? <OutcomeChip outcome={reading.outcome} /> : null}
            {reading?.error ? <span className="text-xs font-semibold text-buff">{reading.error}</span> : null}
            <span className="font-mono text-xs text-paper/50">
              {step.status} · {step.ms} ms
            </span>
          </span>
        </summary>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <div>
            <p className="mb-1 font-mono text-xs text-paper/50">request · POST /mcp</p>
            <Json value={step.request} />
          </div>
          <div>
            <p className="mb-1 font-mono text-xs text-paper/50">response</p>
            <Json value={step.response} />
          </div>
        </div>
      </details>
    </li>
  );
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function StepLine({ step }: { step: AgentRunStep }) {
  switch (step.kind) {
    case "task":
      return (
        <li className="font-mono text-sm text-paper">
          <span className="text-buff">andrea ›</span> {step.text}
        </li>
      );
    case "say":
      return <li className="text-sm leading-relaxed text-paper/90">{step.text}</li>;
    case "page":
      return (
        <li className="rounded-lg border border-buff/60 bg-buff/10 px-3 py-2 text-sm text-paper/90">
          <span className="block text-xs font-semibold tracking-wide text-buff uppercase">Planted injection · {step.source}</span>“{step.text}”
        </li>
      );
    case "http":
      return (
        <li className="font-mono text-xs text-paper/60">
          <span className="text-paper/85">
            {step.method} {safePath(step.url)}
          </span>{" "}
          → {step.status} <span className="text-paper/45">· {step.note}</span>
        </li>
      );
    case "consent":
      return (
        <li className="font-mono text-sm text-paper">
          {step.state === "WAITING" ? "⏸ waiting for Andrea…" : step.state === "APPROVED" ? "✔ Andrea allowed it" : "✖ Andrea said no"}
        </li>
      );
    case "rpc":
      return <RpcLine step={step} />;
  }
}

/** The agent's own log: every request it sent to the MCP server, with the exact JSON. The words are scripted, the calls are real. */
function AgentTerminal({ run }: { run?: AgentRun }) {
  const box = useRef<HTMLDivElement>(null);
  const count = run?.steps.length ?? 0;
  useEffect(() => {
    const element = box.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [count]);
  return (
    <div className="overflow-hidden rounded-xl bg-bezel text-paper">
      <p className="border-b border-paper/15 px-4 py-2 text-xs text-paper/65">The agent’s words are scripted. Every call below is real. Open one to see the exact JSON.</p>
      <div ref={box} className="max-h-[28rem] overflow-y-auto px-4 py-4">
        {run ? (
          <ol className="flex flex-col gap-2.5">
            {run.steps.map((step) => (
              <StepLine key={step.n} step={step} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-paper/70">Run the agent to see its calls.</p>
        )}
      </div>
    </div>
  );
}

/** Compas's own log of each call, whoever the agent is. */
function ServerLog({ events, loading }: { events: readonly AgentEvent[]; loading: boolean }) {
  const counts = tallies(events);
  return (
    <section aria-labelledby="server-log-title" className="rounded-xl border border-ink/15 bg-paper p-4">
      <h4 id="server-log-title" className="font-semibold text-ink">
        What Compas recorded
      </h4>
      <p className="text-sm text-ink-soft">Compas keeps its own log of every call. It doesn’t rely on the agent’s account.</p>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{loading ? "Reading the log…" : "Nothing yet."}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{toolLabel(event.tool)}</span>
                {event.outcome ? <OutcomeChip outcome={event.outcome} /> : null}
              </div>
              {event.reasonCodes.length > 0 ? <p className="mt-0.5 text-xs text-ink-soft">{event.reasonCodes.map(reasonShort).join(" · ")}</p> : null}
              {event.error ? <p className="mt-0.5 text-xs text-ink-soft">{event.error}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 border-t border-ink/10 pt-2 text-xs text-ink-soft">
        {counts.calls} {counts.calls === 1 ? "call" : "calls"} · {counts.held} stopped · {counts.orders} {counts.orders === 1 ? "order" : "orders"}
      </p>
    </section>
  );
}

function budgetBody(): CreateMandateBody {
  const now = Date.now();
  return {
    delegateId: ANDREA,
    beneficiaryId: DEMO_PARTY_IDS.gladys,
    categories: ["MEDICATION"],
    budget: { value: "4000", assetCode: "USD", assetScale: 2 },
    validFrom: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * DAY_MS).toISOString(),
    enforcement: "ENFORCED",
    merchantConfidence: { minimum: "HIGH" },
  };
}

/** A run that can't start because of what is missing, not because something broke. */
class Blocked extends Error {}

/**
 * Act 3 of /demo: an AI agent does Andrea's part of Act 2. One button runs the
 * whole thing: it sets up Pedro's budget and Andrea's errand if they aren't
 * there, then starts the agent. The agent is a script, and the screen says so;
 * everything it sends to the MCP server is real. The story is the run in
 * plain words. The technical view has the exact calls and Compas's own log.
 */
export function AgentAct({ onApproval, onAnalyst }: { onApproval: () => void; onAnalyst: () => void }) {
  const [setupVersion, setSetupVersion] = useState(0);
  const [scenario, setScenario] = useState<AgentScenario>("arc");
  const [run, setRun] = useState<AgentRun | undefined>();
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [consentProblem, setConsentProblem] = useState<string | undefined>();

  const health = useResource("health", () => compasApi.health());
  const facts = health.resource.status === "ready" ? health.resource.data : undefined;

  const mandates = useMandateList(ANDREA, "delegate", true, setupVersion);
  const mandate: MandateView | undefined =
    mandates.resource.status === "ready"
      ? [...mandates.resource.data].filter((item) => item.status === "ACTIVE" && item.usable).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      : undefined;

  const errands = useResource(mandate ? `act3-errands:${mandate.id}` : null, () => compasApi.listErrands(ANDREA, mandate?.id ?? ""), {
    pollMs: 4000,
    refresh: setupVersion,
  });
  const errand = errands.resource.status === "ready" ? openErrand(errands.resource.data) : undefined;

  // What the errand will be, before Andrea confirms it.
  const suggestion = useResource(
    mandate && errands.resource.status === "ready" && !errand ? `act3-suggestion:${mandate.id}:${setupVersion}` : null,
    () => compasApi.suggestAgentErrand(ANDREA, mandate?.id ?? ""),
  );
  const suggested = suggestion.resource.status === "ready" ? suggestion.resource.data : undefined;
  const needsAnalyst = suggested !== undefined && !suggested.available;

  const active = isActive(run);
  const events = useResource(run?.grantId ? `act3-events:${run.grantId}` : null, () => compasApi.agentEvents(ANDREA, run?.grantId ?? ""), {
    pollMs: active ? POLL_MS : 4000,
  });
  const eventList = events.resource.status === "ready" ? events.resource.data : [];

  const consent = useResource(
    run?.status === "AWAITING_CONSENT" && run.consentRequestId ? `act3-consent:${run.consentRequestId}` : null,
    () => compasApi.agentConsentRequest(ANDREA, run?.consentRequestId ?? ""),
  );

  // Follows the run until it ends. Each answer is a new object, so the next poll follows it.
  useEffect(() => {
    if (!run || !isActive(run)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await compasApi.agentRun(ANDREA, run.id);
        if (!cancelled) setRun(next);
      } catch {
        // A missed poll is retried; the run is the server's.
        if (!cancelled) setRun({ ...run });
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run]);

  /** Sets up what is missing, then starts the agent. Everything here is what Act 2 does by hand. */
  const runAgent = async () => {
    setBusy("run");
    setProblem(null);
    setBlocked(null);
    setStarting(true);
    setRun(undefined);
    setConsentProblem(undefined);
    try {
      let mandateId = mandate?.id;
      if (!mandateId) {
        const created = await compasApi.createMandate(PEDRO, budgetBody());
        await compasApi.authorize(PEDRO, created.id);
        mandateId = created.id;
      }
      let errandId = errand?.id;
      if (!errandId) {
        const card = await compasApi.suggestAgentErrand(ANDREA, mandateId);
        if (!card.available) throw new Blocked(card.reason);
        errandId = (await compasApi.confirmErrand(ANDREA, card.errand)).id;
      }
      setSetupVersion((n) => n + 1);
      setRun(await compasApi.startAgentRun(ANDREA, { errandId, scenario }));
    } catch (error) {
      if (error instanceof Blocked) setBlocked(error.message);
      else setProblem(errorCode(error));
    } finally {
      setStarting(false);
      setBusy(null);
    }
  };

  const answer = async (decision: { approve: true; errandIds: readonly string[] } | { approve: false }) => {
    if (!run?.consentRequestId) return;
    const { id, consentRequestId } = run;
    setBusy("consent");
    setConsentProblem(undefined);
    try {
      const redirectTo = await compasApi.answerAgentConsent(ANDREA, consentRequestId, decision);
      // The browser would follow this redirect to the agent. Here the screen hands it over.
      setRun(await compasApi.deliverAgentConsent(ANDREA, id, redirectTo));
    } catch (error) {
      setConsentProblem(errorCode(error));
    } finally {
      setBusy(null);
    }
  };

  const moments = run ? storyOf(run) : [];
  const ordered = orderWaiting(run);
  const finished = run !== undefined && !active;
  const blockedReason = blocked ?? (needsAnalyst && suggested && !suggested.available ? suggested.reason : null);

  const budgetLine = mandate ? `${formatMoney(mandate.budget)} for ${mandate.beneficiary.displayName}’s medicine` : "USD 40 for Gladys’s medicine";
  const errandLine = errand
    ? `${errand.items.map((item) => `${item.maxUnits} × ${item.label}`).join(", ")}, up to ${formatMoney(errand.maxAmount)}`
    : suggested?.available
      ? `1 × Losartán 50 mg, up to ${formatMoney(suggested.errand.maxAmount)}`
      : "1 × Losartán 50 mg";

  return (
    <section aria-labelledby="act-3-title" className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <p className="text-sm font-semibold tracking-wide text-route uppercase">Same errand, no legwork</p>
      <h2 id="act-3-title" className="mt-1 font-display text-3xl text-ink sm:text-4xl">
        An AI agent can do Andrea’s part
      </h2>

      <div className="mt-6 flex flex-col items-stretch gap-2 lg:flex-row">
        <div className="rounded-2xl border-2 border-dashed border-route/50 p-3 lg:flex-[4]">
          <p className="mb-3 text-center text-sm font-semibold text-route-deep">The work the agent replaces</p>
          <FlowDiagram steps={REPLACED} state="done" />
        </div>
        <ol aria-hidden className="flex items-center justify-center self-center lg:pt-10">
          <Connector />
        </ol>
        <div className="border-2 border-transparent p-3 lg:flex-[2]">
          <p className="mb-3 text-center text-sm font-semibold text-ink-soft">Never changes</p>
          <FlowDiagram steps={KEPT} state="done" startAt={REPLACED.length + 1} />
        </div>
      </div>

      <h3 className="mt-10 font-display text-2xl text-ink">See it work</h3>
      <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-ink">Pedro’s budget</dt>
        <dd className="text-ink-soft">{budgetLine}</dd>
        <dt className="font-semibold text-ink">Andrea’s errand</dt>
        <dd className="text-ink-soft">{errandLine}. This is all the agent may buy.</dd>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={runAgent} disabled={active || busy !== null || Boolean(blockedReason)} className={`${BUTTON} px-6 py-3 text-lg whitespace-nowrap`}>
          {active ? "Running…" : run ? "Run it again" : "Watch an agent do the errand"}
        </button>
        {blockedReason ? (
          <p className="text-sm text-ink">
            {blockedReason}{" "}
            <button type="button" onClick={onAnalyst} className="font-semibold text-route-deep underline-offset-2 hover:underline">
              Go to Act 1
            </button>
          </p>
        ) : null}
        {facts && facts.purchases !== undefined && facts.purchases !== "enabled" ? (
          <p className="text-sm text-ink-soft">PayPal orders are off on this server, so the last step stops before PayPal.</p>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="mt-3 text-sm font-medium text-route-deep">
          {problem === "RUN_ACTIVE" ? "A run is already in progress." : `Something went wrong (${problem}).`}
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <Story moments={moments} active={active} starting={starting} />
          {run?.status === "AWAITING_CONSENT" && consent.resource.status === "ready" ? (
            <AgentConsentCard
              key={consent.resource.data.requestId}
              request={consent.resource.data}
              busy={busy === "consent"}
              {...(consentProblem ? { error: `Couldn’t answer (${consentProblem}).` } : {})}
              onAllow={(errandIds) => void answer({ approve: true, errandIds })}
              onRefuse={() => void answer({ approve: false })}
            />
          ) : null}
          {run?.status === "FAILED" ? (
            <p role="alert" className="text-sm text-ink">
              The demo agent couldn’t finish ({run.error ?? "error"}).
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          {ordered ? (
            <div className="rounded-2xl border border-route/40 bg-route/5 p-4">
              <p className="font-semibold text-ink">A PayPal order is waiting for Pedro</p>
              <p className="mt-1 text-sm text-ink-soft">The agent can’t approve it. Pedro approves it at PayPal, on the phone in Act 2.</p>
              <button type="button" onClick={onApproval} className={`${BUTTON} mt-3`}>
                Go to Pedro’s phone (Act 2)
              </button>
            </div>
          ) : finished && run?.status === "COMPLETED" ? (
            <p className="rounded-2xl border border-ink/15 bg-paper p-4 text-sm text-ink">No PayPal order was created. Nothing the agent tried got past Compas.</p>
          ) : null}
        </div>
      </div>

      <details className="mt-6 rounded-lg border border-ink/15 bg-paper/70 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Technical view: the real MCP calls</summary>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <AgentTerminal {...(run ? { run } : {})} />
          <ServerLog events={eventList} loading={events.resource.status === "loading" && Boolean(run?.grantId)} />
          <label className="text-sm text-ink">
            <span className="font-semibold">Case for the next run</span>
            <select
              value={scenario}
              disabled={active}
              onChange={(event) => setScenario(event.target.value as AgentScenario)}
              className="mt-1 block w-full max-w-md rounded-lg border border-ink/25 bg-white px-3 py-2"
            >
              {AGENT_SCENARIOS.map((item) => (
                <option key={item} value={item}>
                  {SCENARIO_INFO[item].title}: {SCENARIO_INFO[item].detail}
                </option>
              ))}
            </select>
          </label>
          {run?.mcpUrl ? (
            <p className="text-sm text-ink-soft">
              Any MCP client can use this server, not only this script:{" "}
              <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-xs text-ink">claude mcp add --transport http compas {run.mcpUrl}</code>
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
