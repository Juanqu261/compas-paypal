import type { JsonResponse } from "./merchant-categories.ts";

/**
 * How much one visitor's demo may create. Everything a demo creates lives in
 * the server's memory, and every PayPal order uses this app's sandbox
 * credentials, so a script looping on one demo could crash the server or get
 * the app throttled for everyone. The analyst has its own cooldown, and the
 * number of live demos is capped in DemoWorkspaces.
 */
export type DemoLimits = {
  /** PayPal orders one demo may create. */
  ordersPerDemo: number;
  budgetsPerDemo: number;
  errandsPerDemo: number;
};

export const DEFAULT_DEMO_LIMITS: DemoLimits = {
  ordersPerDemo: 10,
  budgetsPerDemo: 20,
  errandsPerDemo: 20,
};

const ENV: Record<keyof DemoLimits, string> = {
  ordersPerDemo: "COMPAS_LIMIT_ORDERS_PER_DEMO",
  budgetsPerDemo: "COMPAS_LIMIT_BUDGETS_PER_DEMO",
  errandsPerDemo: "COMPAS_LIMIT_ERRANDS_PER_DEMO",
};

/** Each limit from its COMPAS_LIMIT_* variable when that is a whole number, else the default. */
export function readDemoLimits(env: NodeJS.ProcessEnv = process.env): DemoLimits {
  const limits = { ...DEFAULT_DEMO_LIMITS };
  for (const key of Object.keys(ENV) as (keyof DemoLimits)[]) {
    const raw = env[ENV[key]]?.trim();
    if (raw && /^\d{1,7}$/.test(raw)) limits[key] = Number(raw);
  }
  return limits;
}

export function limitReached(what: string, limit: number): JsonResponse {
  return {
    status: 429,
    body: { error: "DEMO_LIMIT_REACHED", message: `This demo reached its limit of ${limit} ${what}. Reset it to start over.` },
  };
}
