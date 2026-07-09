import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const v2RouteRoot = path.join(process.cwd(), "src/app/api/planning/v2");

const writeRouteFiles = [
  "actions/route.ts",
  "debt-strategy/route.ts",
  "monte-carlo/route.ts",
  "optimize/route.ts",
  "profiles/route.ts",
  "profiles/[id]/route.ts",
  "reports/route.ts",
  "reports/[id]/route.ts",
  "scenarios/route.ts",
  "share-report/route.ts",
  "simulate/route.ts",
  "trash/route.ts",
  "trash/empty/route.ts",
  "trash/restore/route.ts",
] as const;

describe("planning v2 write guard contract", () => {
  it("uses the shared planning write guard for v2 mutation routes", () => {
    for (const relativePath of writeRouteFiles) {
      const source = fs.readFileSync(path.join(v2RouteRoot, relativePath), "utf8");

      expect(source, relativePath).toContain("assertPlanningWriteGuard");
      expect(source, relativePath).not.toContain("function hasCsrfCookie");
      expect(source, relativePath).not.toContain("assertCsrf");
    }
  });
});
