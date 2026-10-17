"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type DemoScenario,
  type DemoScenarioId,
} from "@/demo/scenarios";
import { chargeFromScenario, type DemoCharge } from "./demo-charge";

export type { DemoCharge } from "./demo-charge";

type DemoSessionValue = {
  scenarios: readonly DemoScenario[];
  scenarioId: DemoScenarioId;
  scenario: DemoScenario;
  setScenarioId: (id: DemoScenarioId) => void;
  /** The open simulated charge, if any. A new scenario clears it. */
  charge: DemoCharge | null;
  createCharge: () => void;
  clearCharge: () => void;
  recordChargeResult: (chargeId: string, result: NonNullable<DemoCharge["result"]>) => void;
};

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

export function DemoSessionProvider({
  scenarios,
  children,
}: {
  scenarios: readonly DemoScenario[];
  children: ReactNode;
}) {
  const [scenarioId, setScenario] = useState<DemoScenarioId>(scenarios[0].id);
  const [charge, setCharge] = useState<DemoCharge | null>(null);
  const scenario =
    scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];

  const setScenarioId = useCallback((id: DemoScenarioId) => {
    // A charge belongs to its scenario. Keeping it would show the wrong purchase.
    setCharge(null);
    setScenario(id);
  }, []);
  const createCharge = useCallback(() => setCharge(chargeFromScenario(scenario)), [scenario]);
  const clearCharge = useCallback(() => setCharge(null), []);
  const recordChargeResult = useCallback(
    (chargeId: string, result: NonNullable<DemoCharge["result"]>) =>
      setCharge((current) => (current?.id === chargeId ? { ...current, result } : current)),
    [],
  );

  const value = useMemo(
    () => ({ scenarios, scenarioId, scenario, setScenarioId, charge, createCharge, clearCharge, recordChargeResult }),
    [scenarios, scenarioId, scenario, setScenarioId, charge, createCharge, clearCharge, recordChargeResult],
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
