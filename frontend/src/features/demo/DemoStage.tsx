"use client";

import { PhoneFrame } from "@/components/phone/PhoneFrame";
import type { DemoScenario } from "@/demo/scenarios";
import { ArqExperience } from "@/features/arq/ArqExperience";
import { DemoSessionProvider, useDemoSession } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";
import { NequiExperience } from "@/features/nequi/NequiExperience";

function DemoPhones() {
  const { scenarios, scenarioId, setScenarioId } = useDemoSession();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => setScenarioId(scenario.id)}
            className={`rounded border px-3 py-1 text-sm ${
              scenario.id === scenarioId
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            {scenario.title}
          </button>
        ))}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        <PhoneFrame title="Phone 1 · ARQ" edgeToEdge>
          <ArqExperience />
        </PhoneFrame>
        <PhoneFrame title="Phone 2 · Nequi">
          <NequiExperience />
        </PhoneFrame>
        <PhoneFrame title="Phone 3 · Nequi Negocios">
          <NequiBusinessExperience />
        </PhoneFrame>
      </div>
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
      <DemoPhones />
    </DemoSessionProvider>
  );
}
