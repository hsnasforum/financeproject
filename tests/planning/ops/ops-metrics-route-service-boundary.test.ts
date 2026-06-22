import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILES = [
  "src/app/api/ops/metrics/route.ts",
  "src/app/api/ops/metrics/events/route.ts",
  "src/app/api/ops/metrics/summary/route.ts",
] as const;

const ROUTE_SERVICE_IMPORT = "lib/ops/metrics/metricsRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/ops/metrics/metricsStore",
  "lib/ops/metricsLog",
  "lib/ops/opsPolicy",
  "lib/planning/engine",
  "lib/planning/store/runStore",
  "readRecent(",
  "summarize(",
  "listOpsMetricEvents(",
  "summarizeOpsMetricEvents(",
  "loadOpsPolicy(",
  "getPlanningFallbackUsageSnapshot(",
  "summarizeLegacyRunBackfill(",
] as const;

describe("ops metrics route service boundary", () => {
  it("keeps metrics stores, policy thresholds, and planning fallback summaries behind the route service", () => {
    const violations = ROUTE_FILES.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      expect(source).toContain(ROUTE_SERVICE_IMPORT);
      return FORBIDDEN_ROUTE_PATTERNS
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${file}:${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
