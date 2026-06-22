import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/doctor/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/planning/server/ops/doctorRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/ops/doctorChecks",
  "lib/ops/doctorIssues",
  "lib/ops/doctorMigrationCheck",
  "lib/ops/doctorPolicyChecks",
  "lib/ops/metrics/metricsStore",
  "lib/ops/metricsLog",
  "lib/ops/opsPolicy",
  "lib/ops/scheduler/policy",
  "lib/ops/dataQuality",
  "lib/planning/server/assumptions/storage",
  "lib/planning/server/store/",
  "lib/planning/migrations/manager",
  "lib/planning/storage/consistency",
  "lib/planning/store/namespace",
  "lib/planning/v2/loadCanonicalProfile",
  "appendOpsMetricEvent(",
  "cleanupOrphanRunBlobs(",
  "createRun(",
  "hardDeleteRun(",
  "isPlanningNamespaceEnabled(",
  "listProfiles(",
  "listRuns(",
  "repairRunIndexConsistency(",
  "runPlanningMigrations(",
  "runPlanningMigrationsOnStartup(",
] as const;

describe("ops doctor route service boundary", () => {
  it("keeps doctor checks, storage repair, migrations, metrics, and namespace access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
