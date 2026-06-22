import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/assumptions/refresh/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/assumptions/assumptionsRefreshRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/ops/securityAuditLog",
  "lib/ops/metrics/metricsStore",
  "lib/planning/assumptions/sync",
  "lib/planning/privacy/redact",
  "appendAuditLog(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
  "buildAssumptionsSnapshot(",
  "redactText(",
  "appendRefreshAudit(",
] as const;

describe("ops assumptions refresh route service boundary", () => {
  it("keeps snapshot refresh, audit, metric, and redaction access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
