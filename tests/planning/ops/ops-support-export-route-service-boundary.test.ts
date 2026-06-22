import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/support/export.zip/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/support/supportExportRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/ops/securityAuditLog",
  "lib/ops/metricsLog",
  "lib/ops/supportBundle",
  "lib/planning/server/runtime/appInfo",
  "../../doctor/route",
  "appendAuditLog(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
  "buildSupportBundle(",
  "getAppInfo(",
  "doctorGET(",
] as const;

describe("ops support export route service boundary", () => {
  it("keeps doctor payload loading, support bundle building, audit, and metric access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
