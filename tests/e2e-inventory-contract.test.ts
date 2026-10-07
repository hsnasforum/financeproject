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
