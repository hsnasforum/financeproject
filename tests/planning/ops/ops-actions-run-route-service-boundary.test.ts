import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/actions/run/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/actions/actionRunRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/ops/actions/actionLog",
  "lib/ops/actions/previewToken",
  "lib/ops/actions/registry",
  "lib/ops/actions/resultStatus",
  "lib/ops/actions/types",
  "lib/ops/metricsLog",
  "lib/ops/securityAuditLog",
  "lib/planning/privacy/redact",
  "lib/planning/storage/journal",
  "appendActionAudit(",
  "appendAuditLog(",
  "appendOpsActionLog(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
  "appendStorageTransactionStep(",
  "beginStorageTransaction(",
  "consumeOpsActionPreviewToken(",
  "endStorageTransaction(",
  "getOpsActionDefinition(",
  "opsActionAuditEventType(",
  "opsActionAuditResult(",
  "redactText(",
  "resolveOpsActionRunStatus(",
  "runOpsAction(",
  "validateOpsActionParams(",
] as const;

describe("ops actions run route service boundary", () => {
  it("keeps action execution, preview validation, journal, audit, and metric access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
