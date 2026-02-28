export type PlanningPolicyMode = "private-local" | "shared-internal" | "public";

export type PlanningPolicy = {
  mode: PlanningPolicyMode;
  localOnlyRequired: boolean;
  disableProducts: boolean;
  disableMonteCarlo: boolean;
  requireDisclaimers: boolean;
};

function parseMode(value: string | undefined): PlanningPolicyMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "shared-internal") return "shared-internal";
  if (normalized === "public") return "public";
  return "private-local";
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function getPlanningPolicy(env: NodeJS.ProcessEnv = process.env): PlanningPolicy {
  const mode = parseMode(env.PLANNING_POLICY_MODE);

  return {
    mode,
    localOnlyRequired: parseBoolean(env.PLANNING_LOCAL_ONLY_REQUIRED, true),
    disableProducts: parseBoolean(env.PLANNING_DISABLE_PRODUCTS, false),
    disableMonteCarlo: parseBoolean(env.PLANNING_DISABLE_MONTE_CARLO, false),
    requireDisclaimers: parseBoolean(env.PLANNING_REQUIRE_DISCLAIMERS, true),
  };
}
