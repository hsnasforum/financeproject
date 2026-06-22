import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TEST_ROOT = "tests";
const PLANNING_ROUTE_IMPORT_MARKERS = [
  "src/app/api/planning",
  "@/app/api/planning",
];
const PLANNING_ROUTE_IMPORT_PATTERN = /from\s+["'](?:@\/app\/api\/planning|(?:\.\.\/)+src\/app\/api\/planning)/u;

const LEGACY_RUNTIME_ROUTE_IMPORTS_WITH_IMPLICIT_LOCAL_AUTH_FALLBACK: string[] = [];

const STATIC_ROUTE_SOURCE_REFERENCES_WITHOUT_TEST_AUTH_FALLBACK = [
  "tests/planning/auth/planningRouteUserScopeCoverage.test.ts",
].sort();

function walkTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTestFiles(filePath));
      continue;
    }
    if (/\.test\.tsx?$/u.test(entry.name)) out.push(filePath);
  }
  return out;
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function referencesPlanningApiRouteSource(source: string): boolean {
  return PLANNING_ROUTE_IMPORT_MARKERS.some((marker) => source.includes(marker));
}

function importsPlanningApiRoute(source: string): boolean {
  return PLANNING_ROUTE_IMPORT_PATTERN.test(source);
}

function hasExplicitPlanningAuthFallback(source: string): boolean {
  return source.includes("PLANNING_AUTH_REQUIRED") || source.includes("installPlanningAuthRequiredFalseForTest");
}

describe("vitest planning auth fallback contract", () => {
  it("keeps the global planning auth fallback bridge removed from vitest config", () => {
    const config = fs.readFileSync("vitest.config.ts", "utf8");

    expect(config).not.toContain("Temporary bridge for legacy planning route tests");
    expect(config).not.toContain("PLANNING_AUTH_REQUIRED: process.env.PLANNING_AUTH_REQUIRED");
  });

  it("keeps runtime planning API route imports without explicit auth env on an allowlist", () => {
    const implicitFallbackTests = walkTestFiles(TEST_ROOT)
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return importsPlanningApiRoute(source) && !hasExplicitPlanningAuthFallback(source);
      })
      .map(normalizePath)
      .sort();

    expect(implicitFallbackTests).toEqual(LEGACY_RUNTIME_ROUTE_IMPORTS_WITH_IMPLICIT_LOCAL_AUTH_FALLBACK);
  });

  it("tracks static route source references separately from runtime route imports", () => {
    const staticSourceReferences = walkTestFiles(TEST_ROOT)
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return referencesPlanningApiRouteSource(source) && !importsPlanningApiRoute(source) && !hasExplicitPlanningAuthFallback(source);
      })
      .map(normalizePath)
      .sort();

    expect(staticSourceReferences).toEqual(STATIC_ROUTE_SOURCE_REFERENCES_WITHOUT_TEST_AUTH_FALLBACK);
  });
});
