import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/assumptions/sync/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/assumptions/assumptionsSyncRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/planning/assumptions/sync",
  "lib/planning/assumptions/types",
  "lib/planning/privacy/redact",
  "appendAuditLog(",
  "buildAssumptionsSnapshot(",
  "redactText(",
  "appendSyncAudit(",
  "toSummary(",
] as const;

describe("ops assumptions sync route service boundary", () => {
  it("keeps snapshot sync, summary building, audit, and redaction access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
