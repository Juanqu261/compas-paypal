"use client";

import { startTransition, ViewTransition, type ReactNode } from "react";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import type { DemoScenario } from "@/demo/scenarios";
import { DemoSessionProvider, useDemoSession } from "@/features/demo/DemoSession";
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

export function DemoStage({
  scenarios,
}: {
  scenarios: readonly DemoScenario[];
}) {
  return (
    <DemoSessionProvider scenarios={scenarios}>
      <div className="border-b border-ink/15 bg-shoal/45 pt-8">
        <DemoPhones />
      </div>
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-8">
        <ScenarioPicker />
        <DemoGuide />
      </div>
    </DemoSessionProvider>
  );
}
