export type PlanningFeatureFlags = {
  debugEnabled: boolean;
  ecosEnabled: boolean;
  monteCarloEnabled: boolean;
  includeProductsEnabled: boolean;
  optimizerEnabled: boolean;
  pdfEnabled: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function getPlanningFeatureFlags(env: NodeJS.ProcessEnv = process.env): PlanningFeatureFlags {
  return {
    debugEnabled: parseBoolean(env.PLANNING_DEBUG_ENABLED, false),
    ecosEnabled: parseBoolean(env.ECOS_ENABLED, true),
    monteCarloEnabled: parseBoolean(env.PLANNING_MONTE_CARLO_ENABLED, true),
    includeProductsEnabled: parseBoolean(env.PLANNING_INCLUDE_PRODUCTS_ENABLED, false),
    optimizerEnabled: parseBoolean(env.PLANNING_OPTIMIZER_ENABLED, false),
    pdfEnabled: parseBoolean(env.PLANNING_PDF_ENABLED, false),
  };
}
