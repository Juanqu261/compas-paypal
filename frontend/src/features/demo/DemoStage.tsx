"use client";

import { Activity, startTransition, useState, ViewTransition, type ReactNode } from "react";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import type { DemoScenario } from "@/demo/scenarios";
import { compasApi } from "@/features/compas/api/client";
import { useResource } from "@/features/compas/api/hooks";
import { AgentAct } from "@/features/demo/AgentAct";
import { AnalystAct } from "@/features/demo/AnalystAct";
import { analystRecord } from "@/features/demo/analyst-view";
import type { Act } from "@/features/demo/chapters";
import { StoryRail } from "@/features/demo/StoryRail";
import { DemoSessionProvider, useDemoSession, type DemoCharge } from "@/features/demo/DemoSession";
import { PayPalBusinessExperience } from "@/features/paypal-business/PayPalBusinessExperience";
import { PayPalDelegateExperience } from "@/features/paypal-delegate/PayPalDelegateExperience";
import { PayPalExperience } from "@/features/paypal/PayPalExperience";
import { surfaces, type SurfaceId } from "@/features/site/story";

const experiences: Record<SurfaceId, ReactNode> = {
  paypal: <PayPalExperience />,
  "paypal-delegate": <PayPalDelegateExperience />,
  "paypal-business": <PayPalBusinessExperience />,
};

function expectedText(scenario: DemoScenario): string {
  const { outcome, reason } = scenario.expectedPolicyResult;
  if (outcome === "ALLOW") {
    return "Expected: Allow, then one PayPal order that Pedro approves.";
  }
  if (reason === "PURPOSE_MISMATCH") {
    return "Expected: Deny for purpose mismatch. No PayPal order.";
  }
  return `Expected: ${outcome.charAt(0)}${outcome.slice(1).toLowerCase()}.`;
}

function ScenarioPicker() {
  const { scenarios, scenario, setScenarioId } = useDemoSession();

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <fieldset>
        <legend className="sr-only">Purchase</legend>
        <div className="inline-flex flex-wrap rounded-lg border border-ink/20 bg-paper p-1">
          {scenarios.map((item) => {
            const checked = item.id === scenario.id;
            return (
              <label
                key={item.id}
                className={`cursor-pointer rounded-md px-4 py-2 transition-colors duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-route motion-reduce:transition-none ${
                  checked ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="scenario"
                  value={item.id}
                  checked={checked}
                  onChange={() => startTransition(() => setScenarioId(item.id))}
                  className="sr-only"
                />
                {item.title}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div aria-live="polite" className="min-h-6">
        <ViewTransition
          key={scenario.id}
          name="expected-outcome"
          share="readout"
          enter="readout"
          default="none"
        >
          <p
            className={`font-medium ${
              scenario.expectedPolicyResult.outcome === "ALLOW"
                ? "text-route-deep"
                : "text-ink"
            }`}
          >
            {expectedText(scenario)}{" "}
            <span className="font-normal text-ink-soft italic">
              From {scenario.dataLabel}.
            </span>
          </p>
        </ViewTransition>
      </div>
    </div>
  );
}

function DemoPhones() {
  return (
    <div className="flex snap-x snap-mandatory gap-8 overflow-x-auto px-4 pt-2 pb-10 sm:px-8 xl:justify-center xl:overflow-visible">
      {surfaces.map((surface) => (
        <div key={surface.id} className="shrink-0 snap-center space-y-4">
          <div className="flex items-baseline gap-3 px-2">
            <span className="font-display text-3xl text-route">
              {surface.step}
            </span>
            <p className="leading-snug">
              <span className="font-semibold text-ink">{surface.person}</span>
              <span className="block text-sm text-ink-soft">
                {surface.role} · {surface.app} app, simulated
              </span>
            </p>
          </div>
          <PhoneFrame
            label={`${surface.person}’s phone, ${surface.app} simulation`}
            edgeToEdge
          >
            {experiences[surface.id]}
          </PhoneFrame>
        </div>
      ))}
    </div>
  );
}

/** What the backend answered about the open charge, if it answered. */
function chargeDecision(charge: DemoCharge | null) {
  const result = charge?.result;
  if (result?.kind === "PREVIEW") {
    const outcome = result.preview.next === "ORDER" ? "ALLOW" : result.preview.next === "STOP_DENY" ? "DENY" : "REVIEW";
    return { outcome, purposeCheck: result.preview.purposeCheck } as const;
  }
  if (result?.kind === "PURCHASE") return { outcome: result.purchase.outcome, purposeCheck: result.purchase.purposeCheck } as const;
  return undefined;
}

const WHY = { ALLOW: "Why was this allowed?", DENY: "Why was this refused?", REVIEW: "Why is this held?" } as const;

/**
 * Links the charge back to Act 1: what COMPAS's rules read, and what the
 * analyst had settled about this merchant before the charge. The analyst never
 * sees the purchase. The backend decided; this only shows its record.
 */
function ChargeEvidence({ onShowAnalyst }: { onShowAnalyst: () => void }) {
  const { charge } = useDemoSession();
  const decision = chargeDecision(charge);
  const findings = useResource(decision && charge ? `charge-evidence:${charge.id}` : null, () =>
    compasApi.analystFindings(charge?.merchantId ?? ""),
  );
  if (!decision || !charge) return null;
  const record = findings.resource.status === "ready" ? analystRecord(findings.resource.data.findings) : undefined;
  const reviewed = record && (record.verified > 0 || record.rejected > 0 || record.flags.length > 0);

  return (
    <details className="mt-4 rounded-lg border border-ink/15 bg-paper/70 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">{WHY[decision.outcome]}</summary>
      <dl className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-soft">At checkout, COMPAS’s rules</dt>
          <dd className="mt-1 text-ink">
            {decision.outcome} at {charge.merchantDisplayName}
            {decision.purposeCheck?.merchantConfidence ? (
              <span className="block text-sm text-ink-soft">
                Merchant confidence: {decision.purposeCheck.merchantConfidence}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Ahead of time, the analyst</dt>
          <dd className="mt-1 text-ink">
            {findings.resource.status === "loading" ? (
              "Reading its record…"
            ) : findings.resource.status === "error" ? (
              "Its record isn’t available here."
            ) : reviewed ? (
              <>
                {record.verified} {record.verified === 1 ? "product" : "products"} confirmed against INVIMA.{" "}
                {record.flags.length > 0
                  ? `${record.flags.length} open ${record.flags.length === 1 ? "flag" : "flags"} on Medication.`
                  : "No open flags."}
              </>
            ) : (
              "No analyst review on file for this merchant."
            )}
            <button
              type="button"
              onClick={onShowAnalyst}
              className="mt-1 block text-sm font-semibold text-route-deep underline-offset-2 hover:underline"
            >
              See Act 1
            </button>
          </dd>
        </div>
      </dl>
      <p className="border-t border-ink/10 px-4 py-2.5 text-sm text-ink-soft">
        The analyst never sees this purchase, Pedro or Andrea. A flag can hold a merchant for review. It can never allow a
        payment.
      </p>
    </details>
  );
}

export function DemoStage({
  scenarios,
}: {
  scenarios: readonly DemoScenario[];
}) {
  const [act, setAct] = useState<Act>(1);
  const show = (next: Act) => {
    startTransition(() => setAct(next));
    window.scrollTo({ top: 0 });
  };

  return (
    <DemoSessionProvider scenarios={scenarios}>
      <StoryRail act={act} onChange={show} />
      {/* Activity keeps a hidden act's state: the phones keep their screens while Act 1 shows. */}
      <Activity mode={act === 1 ? "visible" : "hidden"}>
        <div role="tabpanel" id="act-panel-1" aria-labelledby="act-tab-1">
          <AnalystAct />
        </div>
      </Activity>
      <Activity mode={act === 2 ? "visible" : "hidden"}>
        <div role="tabpanel" id="act-panel-2" aria-labelledby="act-tab-2">
          <div className="mt-6 border-y border-ink/15 bg-shoal/45 pt-8">
            <DemoPhones />
          </div>
          <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-8">
            <ScenarioPicker />
            <ChargeEvidence onShowAnalyst={() => show(1)} />
          </div>
        </div>
      </Activity>
      <Activity mode={act === 3 ? "visible" : "hidden"}>
        <div role="tabpanel" id="act-panel-3" aria-labelledby="act-tab-3">
          <AgentAct onApproval={() => show(2)} onAnalyst={() => show(1)} />
        </div>
      </Activity>
    </DemoSessionProvider>
  );
}
