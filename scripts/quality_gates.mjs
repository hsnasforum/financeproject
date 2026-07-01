export const PLANNING_AUTH_CHECK_TEST_FILES = [
  "tests/planning/auth/*.test.ts",
  "tests/middleware-security.test.ts",
  "tests/planner-compute-route-auth.test.ts",
  "tests/recommend-api.test.ts",
  "tests/planning-v2-api/products-candidates-route.test.ts",
  "tests/planning-v2-api/profiles-route.test.ts",
  "tests/planning-v2-api/assumptions-overrides-route.test.ts",
  "tests/planning/ops/planning-cache-route-user-scope.test.ts",
  "tests/planning/ops/ops-runs-route-service-boundary.test.ts",
  "tests/planning/ops/ops-doctor-route-service-boundary.test.ts",
  "tests/planning/ops/ops-doctor-route-action-response.test.ts",
  "tests/planning/ops/ops-doctor-action-result.test.ts",
  "tests/planning/ops/actions-preview-route.test.ts",
  "tests/planning/ops/actions-run-route.test.ts",
];

const gate = (definition) => ({
  prerequisites: [],
  args: [],
  ...definition,
});

export const QUALITY_GATES = [
  gate({
    id: "cleanup:next-artifacts",
    tier: "required",
    scope: ["release"],
    script: "cleanup:next-artifacts",
    args: ["--", "--build-preflight"],
  }),
  gate({ id: "deps:audit", tier: "required", scope: ["release"], script: "deps:audit" }),
  gate({ id: "multi-agent:guard", tier: "required", scope: ["devex"], script: "multi-agent:guard" }),
  gate({ id: "test", tier: "required", scope: ["unit"], script: "test" }),
  gate({ id: "planning:ssot:check", tier: "advisory", scope: ["routes", "docs"], script: "planning:ssot:check" }),
  gate({ id: "planning:postgres:readiness", tier: "optional", scope: ["ops"], script: "planning:postgres:readiness" }),
  gate({
    id: "planning:auth:check",
    tier: "required",
    scope: ["auth", "routes"],
    command: ["vitest", "run", ...PLANNING_AUTH_CHECK_TEST_FILES],
  }),
  gate({
    id: "planning:user-scope:check",
    tier: "required",
    scope: ["auth", "storage"],
    script: "planning:user-scope:check",
  }),
  gate({ id: "planning:v2:guard", tier: "required", scope: ["planning-v2"], script: "planning:v2:guard" }),
  gate({ id: "sec:check", tier: "required", scope: ["security"], script: "sec:check" }),
  gate({
    id: "planning:v2:freeze:guard",
    tier: "required",
    scope: ["planning-v2", "release"],
    script: "planning:v2:freeze:guard",
  }),
  gate({
    id: "planning:v2:scan:guards",
    tier: "required",
    scope: ["planning-v2", "routes"],
    script: "planning:v2:scan:guards",
  }),
  gate({
    id: "planning:v2:report:test",
    tier: "required",
    scope: ["planning-v2", "reports"],
    script: "planning:v2:report:test",
  }),
  gate({
    id: "planning:v2:guide:test",
    tier: "required",
    scope: ["planning-v2", "reports"],
    script: "planning:v2:guide:test",
  }),
  gate({ id: "planning:v2:smoke", tier: "required", scope: ["planning-v2"], script: "planning:v2:smoke" }),
  gate({
    id: "planning:v2:e2e:fast",
    tier: "required",
    scope: ["planning-v2", "e2e"],
    script: "planning:v2:e2e:fast",
  }),
  gate({
    id: "planning:v2:complete",
    tier: "required",
    scope: ["planning-v2", "release"],
    script: "planning:v2:complete",
  }),
  gate({
    id: "planning:v2:compat",
    tier: "optional",
    scope: ["planning-v2", "compat"],
    script: "planning:v2:compat",
  }),
  gate({
    id: "planning:v2:regress",
    tier: "optional",
    scope: ["planning-v2", "regression"],
    script: "planning:v2:regress",
  }),
];

export const QUALITY_GATE_SUITES = {
  "planning:v2:complete": {
    required: [
      "planning:v2:guard",
      "sec:check",
      "planning:v2:freeze:guard",
      "planning:v2:scan:guards",
      "planning:v2:report:test",
      "planning:v2:guide:test",
      "planning:v2:smoke",
      "planning:v2:e2e:fast",
    ],
    optional: [],
    advisory: [],
  },
  "release:verify": {
    preflightRequired: [
      "cleanup:next-artifacts",
      "deps:audit",
    ],
    earlyRequired: [
      "planning:v2:complete",
      "multi-agent:guard",
    ],
    optional: [
      "planning:v2:compat",
      "planning:v2:regress",
      "planning:postgres:readiness",
    ],
    lateRequired: [
      "test",
    ],
    advisory: [
      "planning:ssot:check",
    ],
  },
};

const QUALITY_GATE_BY_ID = new Map(QUALITY_GATES.map((item) => [item.id, item]));

export function getQualityGate(id) {
  return QUALITY_GATE_BY_ID.get(typeof id === "string" ? id : id?.id);
}

export function requireQualityGate(id) {
  const found = getQualityGate(id);
  if (!found) throw new Error(`Unknown quality gate: ${id}`);
  return found;
}

export function renderQualityGateCommand(gateOrId) {
  const resolved = requireQualityGate(gateOrId);
  if (Array.isArray(resolved.command)) return resolved.command.join(" ");
  if (resolved.script) {
    return ["pnpm", resolved.script, ...(resolved.args ?? [])].join(" ");
  }
  return resolved.id;
}
