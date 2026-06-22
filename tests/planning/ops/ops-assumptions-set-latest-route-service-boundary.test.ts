import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/assumptions/set-latest/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/assumptions/assumptionsSetLatestRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/planning/assumptions/storage",
  "lib/planning/assumptions/types",
  "lib/planning/privacy/redact",
  "appendAuditLog(",
  "loadLatestAssumptionsSnapshot(",
  "findAssumptionsSnapshotId(",
  "loadAssumptionsSnapshotById(",
  "setLatestSnapshotFromHistory(",
  "redactText(",
  "appendSetLatestAudit(",
] as const;

describe("ops assumptions set-latest route service boundary", () => {
  it("keeps pointer mutation, audit, snapshot lookup, and redaction behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
