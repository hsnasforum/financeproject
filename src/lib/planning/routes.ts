export type PlanningRouteVisibility =
  | "public-stable"
  | "public-beta"
  | "legacy-redirect"
  | "deprecated-api"
  | "dev-debug"
  | "ops";

export const PLANNING_CANONICAL_ROUTES = {
  user: {
    home: "/planning",
    runs: "/planning/runs",
    runDetail: "/planning/runs/[id]",
    reports: "/planning/reports",
    reportDetail: "/planning/reports/[id]",
  },
  api: {
    createRun: "/api/planning/v2/runs",
    listRuns: "/api/planning/v2/runs",
  },
  betaEntry: [
    "/planning/v3/transactions",
    "/planning/v3/transactions/batches",
    "/planning/v3/balances",
    "/planning/v3/profile/drafts",
  ],
  betaDeepLink: [
    "/planning/v3/transactions/batches/[id]",
    "/planning/v3/profile/drafts/[id]",
    "/planning/v3/profile/drafts/[id]/preflight",
  ],
} as const;

export type PlanningDeprecatedApiPolicy = {
  id: string;
  route: string;
  status: "deprecated-alias" | "deprecated-compatibility";
  owner: string;
  canonicalRoute: string;
  replacement: string;
  sunset: "TBD-after-telemetry-inventory";
  telemetryEvent: string;
};

export const PLANNING_LEGACY_REDIRECT_ROUTES = {
  planner: {
    route: "/planner",
    canonicalRoute: PLANNING_CANONICAL_ROUTES.user.home,
    visibility: "legacy-redirect" satisfies PlanningRouteVisibility,
  },
  plannerCatchAll: {
    route: "/planner/[...slug]",
    canonicalRoute: `${PLANNING_CANONICAL_ROUTES.user.home}/:slug*`,
    visibility: "legacy-redirect" satisfies PlanningRouteVisibility,
  },
  report: {
    route: "/report",
    canonicalRoute: PLANNING_CANONICAL_ROUTES.user.reports,
    visibility: "legacy-redirect" satisfies PlanningRouteVisibility,
  },
} as const;

export const PLANNING_DEPRECATED_API_ROUTES = {
  planningRun: {
    id: "planning-run-alias",
    route: "/api/planning/run",
    status: "deprecated-alias",
    owner: "Planning v2 Runs API",
    canonicalRoute: PLANNING_CANONICAL_ROUTES.api.createRun,
    replacement: PLANNING_CANONICAL_ROUTES.api.createRun,
    sunset: "TBD-after-telemetry-inventory",
    telemetryEvent: "planning_run_alias_called",
  },
  planningV2Run: {
    id: "planning-v2-run-alias",
    route: "/api/planning/v2/run",
    status: "deprecated-alias",
    owner: "Planning v2 Runs API",
    canonicalRoute: PLANNING_CANONICAL_ROUTES.api.createRun,
    replacement: PLANNING_CANONICAL_ROUTES.api.createRun,
    sunset: "TBD-after-telemetry-inventory",
    telemetryEvent: "planning_v2_run_alias_called",
  },
  plannerCompute: {
    id: "planner-compute",
    route: "/api/planner/compute",
    status: "deprecated-compatibility",
    owner: "Planning Reports / Architecture",
    canonicalRoute: PLANNING_CANONICAL_ROUTES.api.createRun,
    replacement: "planning-v2 run/report APIs",
    sunset: "TBD-after-telemetry-inventory",
    telemetryEvent: "legacy_planner_compute_called",
  },
} as const satisfies Record<string, PlanningDeprecatedApiPolicy>;

export function planningDeprecatedApiMeta(policy: PlanningDeprecatedApiPolicy) {
  return {
    id: policy.id,
    status: policy.status,
    owner: policy.owner,
    canonicalRoute: policy.canonicalRoute,
    replacement: policy.replacement,
    sunset: policy.sunset,
    telemetryEvent: policy.telemetryEvent,
  };
}

export function planningDeprecationHeaders(policy: PlanningDeprecatedApiPolicy): Record<string, string> {
  return {
    Deprecation: "true",
    Link: `<${policy.canonicalRoute}>; rel="successor-version"`,
    "X-Planning-Canonical-Route": policy.canonicalRoute,
    "X-Planning-Route-Status": policy.status,
    "X-Planning-Sunset": policy.sunset,
  };
}

export function withPlanningDeprecationHeaders<T extends Response>(
  response: T,
  policy: PlanningDeprecatedApiPolicy | null | undefined,
): T {
  if (!policy) return response;
  for (const [key, value] of Object.entries(planningDeprecationHeaders(policy))) {
    response.headers.set(key, value);
  }
  return response;
}
