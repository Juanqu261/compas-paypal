"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type DemoScenario,
  type DemoScenarioId,
} from "@/demo/scenarios";

type DemoSessionValue = {
  scenarios: readonly DemoScenario[];
  scenarioId: DemoScenarioId;
  scenario: DemoScenario;
  setScenarioId: (id: DemoScenarioId) => void;
};

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

export function DemoSessionProvider({
  scenarios,
  children,
}: {
  scenarios: readonly DemoScenario[];
  children: ReactNode;
}) {
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>(scenarios[0].id);
  const scenario =
    scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const value = useMemo(
    () => ({ scenarios, scenarioId, scenario, setScenarioId }),
    [scenarios, scenarioId, scenario],
  );

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
    </DemoSessionContext.Provider>
  );
}

export function useDemoSession(): DemoSessionValue {
  const value = useContext(DemoSessionContext);
  if (!value) {
    throw new Error("useDemoSession must be used within DemoSessionProvider");
  }
  return value;
}
