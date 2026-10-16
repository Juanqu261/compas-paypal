export type MoneyView = {
  value: string;
  assetCode: string;
  assetScale: number;
};

export type DemoScenarioId = "medication-pharmacy" | "alcohol-rejection";

/** Display shape for labeled demo fixtures. Not a policy decision. */
export type DemoScenario = {
  dataLabel: string;
  id: DemoScenarioId;
  title: string;
  merchantSurface: string;
  mandate: {
    purposePolicy: {
      allowedPurposes: string[];
    };
    budget: MoneyView;
  };
  purchaseIntent: {
    merchant: {
      displayName: string;
    };
  };
};

export function asDemoScenario(fixture: {
  dataLabel: string;
  id: string;
  title: string;
  merchantSurface: string;
  mandate: DemoScenario["mandate"];
  purchaseIntent: DemoScenario["purchaseIntent"];
}): DemoScenario {
  if (
    fixture.id === "medication-pharmacy" ||
    fixture.id === "alcohol-rejection"
  ) {
    return {
      dataLabel: fixture.dataLabel,
      id: fixture.id,
      title: fixture.title,
      merchantSurface: fixture.merchantSurface,
      mandate: fixture.mandate,
      purchaseIntent: fixture.purchaseIntent,
    };
  }

  throw new Error(`Unknown demo fixture: ${fixture.id}`);
}
