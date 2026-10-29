/**
 * `COMPAS_DEMO_LIMITS=off` lifts every demo limit: the per-demo caps
 * (api/demo-limits.ts), the analyst's rerun cooldown and its retry wait. For a
 * local server only; a deploy leaves it unset and keeps them.
 */
export function demoLimitsOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COMPAS_DEMO_LIMITS?.trim().toLowerCase() === "off";
}
