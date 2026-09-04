import fs from "node:fs";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  PLANNING_AUTH_CHECK_TEST_FILES,
  QUALITY_GATE_SUITES,
  getQualityGate,
  renderQualityGateCommand,
} from "../scripts/quality_gates.mjs";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

type Workflow = {
  jobs: Record<string, {
    "timeout-minutes": number;
    steps: Array<{ name: string; run?: string }>;
  }>;
};

describe("quality gate registry", () => {
  it("keeps release and planning v2 complete runners on the shared registry", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const releaseSource = read("scripts/release_verify.mjs");
    const completeSource = read("scripts/planning_v2_complete.mjs");
    const releaseContractsScript = pkg.scripts?.["e2e:release:contracts"] ?? "";
    const releaseGateIds = [
      ...QUALITY_GATE_SUITES["release:verify"].preflightRequired,
      ...QUALITY_GATE_SUITES["release:verify"].earlyRequired,
      ...QUALITY_GATE_SUITES["release:verify"].optional,
      ...QUALITY_GATE_SUITES["release:verify"].lateRequired,
      ...QUALITY_GATE_SUITES["release:verify"].advisory,
    ];

    expect(releaseSource).toContain("QUALITY_GATE_SUITES");
    expect(completeSource).toContain("QUALITY_GATE_SUITES");
    expect(releaseSource).not.toContain("const EARLY_REQUIRED_GATES = [");
    expect(completeSource).not.toContain("const COMPLETE_STEPS = [");
    expect(QUALITY_GATE_SUITES["planning:v2:complete"].required).toEqual([
      "planning:v2:guard",
      "sec:check",
      "planning:v2:freeze:guard",
      "planning:v2:scan:guards",
      "planning:v2:report:test",
      "planning:v2:guide:test",
      "planning:v2:smoke",
      "planning:v2:e2e:fast",
    ]);
    expect(QUALITY_GATE_SUITES["release:verify"].preflightRequired).toContain("e2e:inventory:check");
    expect(renderQualityGateCommand("e2e:inventory:check")).toBe("pnpm e2e:inventory:check");
    expect(QUALITY_GATE_SUITES["release:verify"].lateRequired).toContain("e2e:release:contracts");
    expect(renderQualityGateCommand("e2e:release:contracts")).toBe("pnpm e2e:release:contracts");
    expect(releaseContractsScript).toContain("node scripts/next_build_safe.mjs --webpack");
    expect(releaseContractsScript).toContain("--runtime=production");
    expect(releaseContractsScript).toContain("tests/e2e/products-list-query.spec.ts");
    expect(releaseContractsScript).toContain("tests/e2e/flow-v3-import-to-cashflow.spec.ts");
    expect(releaseContractsScript).toContain("tests/e2e/v3-draft-apply.spec.ts");
    expect(releaseGateIds.every((id) => Boolean(getQualityGate(id)))).toBe(true);
  });

  it("keeps strict freshness as one required release preflight gate", () => {
    const preflight = QUALITY_GATE_SUITES["release:verify"].preflightRequired;
    const freshnessGate = getQualityGate("freshness:release");
    const auditIndex = preflight.indexOf("deps:audit");
    const freshnessIndex = preflight.indexOf("freshness:release");
    const inventoryIndex = preflight.indexOf("e2e:inventory:check");

    expect(freshnessGate).toMatchObject({
      id: "freshness:release",
      tier: "required",
      script: "freshness:release",
    });
    expect(preflight.filter((id) => id === "freshness:release")).toHaveLength(1);
    expect(preflight).toEqual([
      "cleanup:next-artifacts",
      "deps:audit",
      "freshness:release",
      "e2e:inventory:check",
    ]);
    expect(freshnessIndex).toBe(auditIndex + 1);
    expect(freshnessIndex).toBe(inventoryIndex - 1);
    expect(renderQualityGateCommand(freshnessGate)).toBe("pnpm freshness:release");
  });

  it("keeps planning auth check script as a registry runner instead of a long exact string", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const authGate = getQualityGate("planning:auth:check");

    expect(pkg.scripts?.["planning:auth:check"]).toBe("node scripts/quality_gates_runner.mjs planning:auth:check");
    expect(authGate).toBeTruthy();
    expect(renderQualityGateCommand(authGate)).toBe(`vitest run ${PLANNING_AUTH_CHECK_TEST_FILES.join(" ")}`);
    expect(PLANNING_AUTH_CHECK_TEST_FILES).toEqual(expect.arrayContaining([
      "tests/planning/auth/*.test.ts",
      "tests/planner-compute-route-auth.test.ts",
      "tests/planning-v2-api/products-candidates-route.test.ts",
      "tests/planning/ops/actions-run-route.test.ts",
    ]));
  });

  it("keeps CI from duplicating release registry gates outside release:verify", () => {
    const ciSource = read(".github/workflows/ci.yml");
    const ci = loadYaml(ciSource) as Workflow;
    const verify = ci.jobs.verify;
    const preflight = QUALITY_GATE_SUITES["release:verify"].preflightRequired;

    expect(ciSource).toContain("Required Gate - Release Verify (quality gate registry)");
    expect(ciSource).toContain("pnpm release:verify");
    expect(ciSource).not.toContain("Planning V2 Static Guard");
    expect(ciSource).not.toContain("Planning V2 Regression Gate");
    expect(ciSource).not.toContain("run: pnpm planning:v2:guard");
    expect(ciSource).not.toContain("run: pnpm planning:v2:regress");
    expect(ciSource).not.toContain("run: pnpm deps:audit");
    expect(preflight.filter((id) => id === "deps:audit")).toHaveLength(1);
    expect(getQualityGate("deps:audit")).toMatchObject({
      id: "deps:audit",
      tier: "required",
      script: "deps:audit",
    });
    expect(verify["timeout-minutes"]).toBe(40);
    expect(verify.steps).toContainEqual({
      name: "Required Gate - Release Verify (quality gate registry)",
      run: "pnpm release:verify",
    });
    expect(verify.steps).toContainEqual({ name: "Build", run: "pnpm build" });
    expect(verify.steps).toContainEqual({
      name: "Desktop artifact provenance gate",
      run: expect.stringContaining("pnpm planning:v2:desktop:build -- --no-next-build"),
    });
  });

  it("keeps planning route coverage discovery-based instead of fixed counts or proxy lists", () => {
    const coverageSource = read("tests/planning/auth/planningRouteUserScopeCoverage.test.ts");
    const legacyProxyRoute = ["src", "app", "api", "planning", "run", "[id]", "route.ts"].join("/");

    expect(coverageSource).not.toContain("EXPECTED_PLANNING_ROUTE_COUNT");
    expect(coverageSource).toContain("findPlanningProxyRouteFiles");
    expect(coverageSource).not.toContain(legacyProxyRoute);
  });
});
