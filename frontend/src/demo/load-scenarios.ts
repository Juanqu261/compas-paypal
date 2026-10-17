import { readFileSync } from "node:fs";
import path from "node:path";
import { asDemoScenario, type DemoScenario } from "@/demo/scenarios";

const fixtureNames = [
  "medication-pharmacy.json",
  "alcohol-rejection.json",
] as const;

/** Server-side read of repository fixtures. Do not import this from a client component. */
export function loadDemoScenarios(): DemoScenario[] {
  const directory = path.join(process.cwd(), "..", "data", "fixtures", "demo");

  return fixtureNames.map((name) => {
    const fixture = JSON.parse(
      readFileSync(path.join(directory, name), "utf8"),
    ) as {
      dataLabel: string;
      id: string;
      title: string;
      merchantSurface: string;
      mandate: DemoScenario["mandate"];
      purchaseIntent: DemoScenario["purchaseIntent"];
      expectedPolicyResult: DemoScenario["expectedPolicyResult"];
    };

    return asDemoScenario(fixture);
  });
}
