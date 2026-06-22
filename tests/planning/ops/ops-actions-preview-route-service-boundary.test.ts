import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/actions/preview/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/actions/actionPreviewRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/ops/actions/previewToken",
  "lib/ops/actions/registry",
  "lib/ops/actions/types",
  "getOpsActionDefinition(",
  "issueOpsActionPreviewToken(",
  "previewOpsAction(",
  "validateOpsActionParams(",
] as const;

describe("ops actions preview route service boundary", () => {
  it("keeps action definition lookup, preview execution, params validation, and token issuing behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
