import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAYWRIGHT_TEST_IGNORE,
  PLAYWRIGHT_TEST_MATCH,
  assertPlaywrightConfigContract,
  classifyE2EInventory,
} from "../scripts/e2e_inventory_check.mjs";

describe("E2E inventory contract", () => {
  it("includes both maintained Playwright roots and rejects unknown orphan files", () => {
    const result = classifyE2EInventory([
      "tests/e2e/smoke.spec.ts",
      "e2e/benefits_sigungu.e2e.ts",
      "archive/unknown-flow.spec.ts",
    ]);

    expect(result.included).toEqual([
      "e2e/benefits_sigungu.e2e.ts",
      "tests/e2e/smoke.spec.ts",
    ]);
    expect(result.excluded).toEqual([]);
    expect(result.unaccounted).toEqual(["archive/unknown-flow.spec.ts"]);
  });

  it("keeps the executable inventory aligned with Playwright configuration", () => {
    const source = fs.readFileSync("playwright.config.ts", "utf8");

    expect(PLAYWRIGHT_TEST_MATCH).toEqual([
      "tests/e2e/**/*.spec.ts",
      "e2e/**/*.e2e.ts",
    ]);
    expect(PLAYWRIGHT_TEST_IGNORE).toEqual([
      "**/.next*/**",
      "**/.dist/**",
      "**/node_modules/**",
      "**/tmp/**",
    ]);
    expect(assertPlaywrightConfigContract(source)).toEqual([]);
  });

  it("accounts for generated copies using the same ignore boundaries as Playwright", () => {
    const ignored = [
      "tmp/review/tests/e2e/copy.spec.ts",
      "nested/tmp/copy.spec.ts",
      "node_modules/dependency/index.spec.js",
      "nested/node_modules/dependency/index.spec.js",
      "tmp/review/node_modules/.pnpm/dependency/node_modules/dependency/index.spec.js",
      "node_modules/.pnpm/dependency/spec/index.spec.js",
      ".next-build/server/copy.spec.ts",
      "nested/.next/standalone/copy.spec.ts",
      ".dist/package/copy.e2e.ts",
      "tests/e2e/tmp/copy.spec.ts",
      "TMP/review/copy.spec.ts",
      "nested/NODE_MODULES/dependency/index.spec.js",
      "tests/e2e/.NEXT-build/copy.spec.ts",
    ];
    const result = classifyE2EInventory([
      ...ignored,
      "tmp\\windows\\copy.spec.ts",
      "tests/e2e/smoke.spec.ts",
      "archive/unknown-flow.spec.ts",
      "tmp-like/unknown-flow.spec.ts",
    ]);

    expect(result.included).toEqual(["tests/e2e/smoke.spec.ts"]);
    expect(result.excluded.map((entry) => entry.filePath)).toEqual([
      ...ignored,
      "tmp/windows/copy.spec.ts",
    ].sort());
    expect(result.excluded.every((entry) => entry.reason.length > 0)).toBe(true);
    expect(result.unaccounted).toEqual([
      "archive/unknown-flow.spec.ts",
      "tmp-like/unknown-flow.spec.ts",
    ]);
  });

  it("isolates full E2E storage and cleans it after every wrapper run", () => {
    const source = fs.readFileSync("scripts/playwright_with_webserver_debug.mjs", "utf8");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

    expect(source).toContain("createIsolatedPlanningV2E2EOptions");
    expect(source).toContain('sandboxPrefix: "finance-full-e2e-"');
    expect(source).toContain("forceIsolatedPlanningData: true");
    expect(source).toContain("env.PORT || portFromBaseUrl(configuredBaseUrl)");
    expect(source).toContain("env = isolated.env");
    expect(source).toContain("preparePlanningSmokeDatabase");
    expect(source).toContain("env.DATABASE_URL = smokeDatabase.databaseUrl");
    expect(source).toContain("await isolated.cleanup()");
    expect(pkg.scripts?.e2e).toContain("--workers=1");
    expect(pkg.scripts?.e2e).toContain("--debug-pages");
    expect(source).toContain('env.PLANNING_DEBUG_ENABLED = "true"');
  });

  it("keeps interactive profile draft flows on the real development hydration path", () => {
    const source = fs.readFileSync("tests/e2e/helpers/e2eTest.ts", "utf8");

    expect(source).toContain('pathname.startsWith("/planning/v3/profile/drafts")');
  });
});
