import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/assumptions/latest/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/assumptions/assumptionsLatestRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/assumptions/storage",
  "lib/planning/privacy/redact",
  "loadLatestAssumptionsSnapshot(",
  "findAssumptionsSnapshotId(",
  "redactText(",
] as const;

describe("ops assumptions latest route service boundary", () => {
  it("keeps latest snapshot storage lookup and error redaction behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
