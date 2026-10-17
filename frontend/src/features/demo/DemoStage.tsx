"use client";

import { startTransition, ViewTransition, type ReactNode } from "react";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import type { DemoScenario } from "@/demo/scenarios";
import { ArqExperience } from "@/features/arq/ArqExperience";
import { DemoSessionProvider, useDemoSession } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";
import { NequiExperience } from "@/features/nequi/NequiExperience";
import { surfaces, type SurfaceId } from "@/features/site/story";

const experiences: Record<SurfaceId, ReactNode> = {
  arq: <ArqExperience />,
  nequi: <NequiExperience />,
  "nequi-negocios": <NequiBusinessExperience />,
};

function expectedText(scenario: DemoScenario): string {
  const { outcome, reason } = scenario.expectedPolicyResult;
  if (outcome === "ALLOW") {
    return "Expected: Allow, then a quote and one outgoing payment.";
  }
  if (reason === "PURPOSE_MISMATCH") {
    return "Expected: Deny for purpose mismatch. No outgoing payment.";
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
                {surface.role} on {surface.app}, simulated
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
      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-8">
        <ScenarioPicker />
      </div>
      <div className="border-y border-ink/15 bg-shoal/45 pt-8">
        <DemoPhones />
      </div>
    </DemoSessionProvider>
  );
}
