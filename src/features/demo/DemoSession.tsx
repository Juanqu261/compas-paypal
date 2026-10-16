"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getDemoScenario,
  type DemoScenario,
  type DemoScenarioId,
} from "@/demo/scenarios";

type DemoSessionValue = {
  scenarioId: DemoScenarioId;
  scenario: DemoScenario;
  setScenarioId: (id: DemoScenarioId) => void;
};

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [scenarioId, setScenarioId] =
    useState<DemoScenarioId>("medication-pharmacy");
  const scenario = getDemoScenario(scenarioId);
  const value = useMemo(
    () => ({ scenarioId, scenario, setScenarioId }),
    [scenarioId, scenario],
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
