import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILES = [
  "src/app/api/ops/assumptions/history/route.ts",
  "src/app/api/ops/assumptions/history/[id]/route.ts",
] as const;
const ROUTE_SERVICE_IMPORT = "lib/ops/assumptions/assumptionsHistoryRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/planning/assumptions/storage",
  "lib/planning/assumptions/types",
  "lib/planning/privacy/redact",
  "listAssumptionsHistory(",
  "loadAssumptionsSnapshotById(",
  "redactText(",
  "toSummary(",
] as const;

describe("ops assumptions history route service boundary", () => {
  it("keeps snapshot history storage lookup, summary building, and redaction behind the route service", () => {
    const sources = ROUTE_FILES.map((file) => ({
      file,
      source: fs.readFileSync(file, "utf8"),
    }));
    const violations = sources.flatMap(({ file, source }) =>
      FORBIDDEN_ROUTE_PATTERNS
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${file}:${pattern}`),
    );

    for (const { source } of sources) {
      expect(source).toContain(ROUTE_SERVICE_IMPORT);
    }
    expect(violations).toEqual([]);
  });
});
