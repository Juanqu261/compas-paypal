"use client";

import { Activity, startTransition, useState, ViewTransition, type ReactNode } from "react";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import type { DemoScenario } from "@/demo/scenarios";
import { compasApi } from "@/features/compas/api/client";
import { useResource } from "@/features/compas/api/hooks";
import { AnalystAct } from "@/features/demo/AnalystAct";
import { analystRecord } from "@/features/demo/analyst-view";
import { DemoSessionProvider, useDemoSession, type DemoCharge } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";
import { NequiExperience } from "@/features/nequi/NequiExperience";
import { PayPalExperience } from "@/features/paypal/PayPalExperience";
import { surfaces, type SurfaceId } from "@/features/site/story";

const experiences: Record<SurfaceId, ReactNode> = {
  paypal: <PayPalExperience />,
  nequi: <NequiExperience />,
  "nequi-negocios": <NequiBusinessExperience />,
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

const GUIDE = [
  { app: "PayPal", text: "Pedro creates a budget for a contact" },
  { app: "PayPal", text: "He authorizes it. Nothing is charged yet" },
  { app: "Nequi", text: "The contact sees what they can spend" },
  { app: "Nequi Negocios", text: "The pharmacy charges with COMPAS" },
  { app: "Nequi", text: "The contact reviews the purchase" },
  { app: "COMPAS", text: "The backend checks the rules. ALLOW creates a PayPal order" },
  { app: "PayPal", text: "Pedro approves that exact order at PayPal" },
  { app: "All three", text: "PayPal pays the pharmacy, or this environment's limit" },
] as const;

/**
 * The live walk-through. Steps 4 to 8 follow the shared charge; steps 1 to 3
 * happen on the backend and are not tracked here, so they are never ticked.
 */
function DemoGuide() {
  const { charge } = useDemoSession();
  const result = charge?.result;
  const finished =
    (result?.kind === "PURCHASE" && !(result.purchase.payment.status === "CREATED" && result.purchase.payment.state === "AWAITING_PAYER_APPROVAL")) ||
    (result?.kind === "PREVIEW" && result.preview.next !== "ORDER") ||
    result?.kind === "ERROR";
  const ordered = result?.kind === "PURCHASE" && result.purchase.payment.status === "CREATED";
  const done = (index: number) =>
    (index === 3 && charge !== null) ||
    ((index === 4 || index === 5) && result !== undefined) ||
    (index === 6 && ordered && finished) ||
    (index === 7 && finished);

  return (
    <details className="group mt-6 rounded-lg border border-ink/15 bg-paper/70 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">Presenter guide</summary>
      <ol className="grid gap-x-6 gap-y-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUIDE.map((step, index) => (
          <li key={step.text} className="flex gap-2.5 text-sm leading-snug">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                done(index) ? "bg-route text-paper" : "border border-ink/25 text-ink-soft"
              }`}
            >
              {done(index) ? "✓" : index + 1}
            </span>
            <span>
              <span className="text-ink">{step.text}</span>
              <span className="block text-ink-soft">{step.app}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t border-ink/10 px-4 py-2.5 text-sm text-ink-soft">
        The charge passes between the phones inside this browser. It is not NFC, not a sync between devices and
        not stored in the database.
      </p>
    </details>
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

type Act = 1 | 2;

const ACTS = [
  { act: 1, title: "Before anyone buys", detail: "The analyst reads the catalog" },
  { act: 2, title: "The purchase", detail: "Three phones, one payment" },
] as const;

function ActSwitcher({ act, onChange }: { act: Act; onChange: (act: Act) => void }) {
  return (
    <div role="tablist" aria-label="Demo acts" className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 pt-6 sm:px-8">
      {ACTS.map((item) => {
        const selected = item.act === act;
        return (
          <button
            key={item.act}
            type="button"
            role="tab"
            id={`act-tab-${item.act}`}
            aria-selected={selected}
            aria-controls={`act-panel-${item.act}`}
            onClick={() => onChange(item.act)}
            className={`flex items-baseline gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors duration-200 motion-reduce:transition-none ${
              selected ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper text-ink-soft hover:text-ink"
            }`}
          >
            <span className={`font-display text-2xl ${selected ? "text-paper" : "text-route"}`}>{item.act}</span>
            <span className="leading-tight">
              <span className="block font-semibold">{item.title}</span>
              <span className={`block text-sm ${selected ? "text-paper/75" : "text-ink-soft"}`}>{item.detail}</span>
            </span>
          </button>
        );
      })}
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
      <ActSwitcher act={act} onChange={show} />
      {/* Activity keeps a hidden act's state: the phones keep their screens while Act 1 shows. */}
      <Activity mode={act === 1 ? "visible" : "hidden"}>
        <div role="tabpanel" id="act-panel-1" aria-labelledby="act-tab-1">
          <AnalystAct onNext={() => show(2)} />
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
            <DemoGuide />
          </div>
        </div>
      </Activity>
    </DemoSessionProvider>
  );
}
