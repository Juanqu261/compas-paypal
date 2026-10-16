import { alcoholRejectionScenario } from "./alcohol-rejection";
import { medicationPharmacyScenario } from "./medication-pharmacy";
import type { DemoScenario, DemoScenarioId } from "./types";

export { alcoholRejectionScenario } from "./alcohol-rejection";
export { medicationPharmacyScenario } from "./medication-pharmacy";
export type { DemoScenario, DemoScenarioId } from "./types";
export { DEMO_DATA_LABEL } from "./types";

const scenarios = {
  "medication-pharmacy": medicationPharmacyScenario,
  "alcohol-rejection": alcoholRejectionScenario,
} as const;

export function getDemoScenario(id: DemoScenarioId): DemoScenario {
  return scenarios[id];
}

export const demoScenarios: readonly DemoScenario[] = [
  medicationPharmacyScenario,
  alcoholRejectionScenario,
];
