import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseInstallConfig } from "../scripts/playwright_install_chromium.mjs";
import {
  PLANNING_AUTH_CHECK_TEST_FILES,
  QUALITY_GATE_SUITES,
  getQualityGate,
  renderQualityGateCommand,
} from "../scripts/quality_gates.mjs";

const { load: loadYaml } = createRequire(import.meta.url)("js-yaml") as {
  load: (source: string) => unknown;
};

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

type Workflow = {
  env?: Record<string, string>;
  jobs: Record<string, {
    "timeout-minutes": number;
    env?: Record<string, string>;
    steps: Array<{
      name: string;
      uses?: string;
      with?: Record<string, string | number>;
      run?: string;
      env?: Record<string, string>;
    }>;
  }>;
};

function readWorkflows(): Array<{ file: string; workflow: Workflow }> {
  return fs.readdirSync(".github/workflows")
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map((file) => ({ file, workflow: loadYaml(read(`.github/workflows/${file}`)) as Workflow }));
}

function pnpmVersionIssues(workflows: ReturnType<typeof readWorkflows>): string[] {
  const issues: string[] = [];
  let setupCount = 0;
  for (const { file, workflow } of workflows) {
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      for (const [index, step] of (job.steps ?? []).entries()) {
        if (!step.uses?.startsWith("pnpm/action-setup@")) continue;
        setupCount += 1;
        const location = `${file}/${jobId}/steps[${index}] (${step.name})`;
        if (step.uses !== "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86") {
          issues.push(`${location}: uses=${step.uses} must equal the reviewed pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86`);
        }
        const manifestInput = step.with?.package_json_file ?? "package.json";
        if (typeof manifestInput !== "string" || manifestInput.includes("${{")) {
          issues.push(`${location}: cannot statically resolve package_json_file=${manifestInput}`);
          continue;
        }
        const manifestPath = path.relative(process.cwd(), path.resolve(manifestInput));
        if (manifestPath.startsWith(`..${path.sep}`) || path.isAbsolute(manifestPath)) {
          issues.push(`${location}: package_json_file is outside the repository: ${manifestInput}`);
          continue;
        }
        try {
          const source = read(manifestPath);
          const manifest = (/\.ya?ml$/.test(manifestPath) ? loadYaml(source) : JSON.parse(source)) as {
            packageManager?: string;
          };
          const version = manifest.packageManager?.match(/^pnpm@([^+]+)(?:\+.*)?$/)?.[1];
          if (!version) {
            issues.push(`${location}: ${manifestInput} must declare a pnpm packageManager`);
          } else if (step.with?.version !== version) {
            issues.push(`${location}: version=${String(step.with?.version)} must equal ${manifestInput} packageManager version=${version}`);
          }
        } catch (error) {
          issues.push(`${location}: cannot read package_json_file=${manifestInput}: ${String(error)}`);
        }
      }
    }
  }
  if (setupCount === 0) issues.push("No pnpm/action-setup steps discovered");
  return issues;
}

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
    expect(QUALITY_GATE_SUITES["release:verify"].preflightRequired).toContain("freshness:release");
    expect(renderQualityGateCommand("freshness:release")).toBe("pnpm freshness:release");
    expect(renderQualityGateCommand("e2e:inventory:check")).toBe("pnpm e2e:inventory:check");
    expect(QUALITY_GATE_SUITES["release:verify"].lateRequired).toContain("e2e:release:contracts");
    expect(QUALITY_GATE_SUITES["release:verify"].lateRequired).toEqual(expect.arrayContaining([
      "planning:v2:prod:smoke",
      "planning:v2:desktop:smoke",
    ]));
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

  it.each([
    { file: "ci.yml", timeouts: { verify: 40 }, nativeTimeouts: { windows_native: 45 } },
    { file: "e2e-smoke.yml", timeouts: { core_flows: 35, dart_index_present: 30, dart_index_missing: 30 } },
  ])("keeps bounded Chromium installation and native job timeouts in $file", ({ file, timeouts, nativeTimeouts }) => {
    const workflow = loadYaml(read(`.github/workflows/${file}`)) as Workflow;

    expect(Object.keys(workflow.jobs).sort()).toEqual([...Object.keys(timeouts), ...Object.keys(nativeTimeouts ?? {})].sort());
    for (const [jobId, timeout] of Object.entries(nativeTimeouts ?? {})) {
      expect(workflow.jobs[jobId]["timeout-minutes"]).toBe(timeout);
      expect(workflow.jobs[jobId].steps.filter((step) => step.run === "pnpm e2e:install:chromium")).toHaveLength(0);
    }
    expect(workflow.env).toMatchObject({
      PLAYWRIGHT_INSTALL_ATTEMPTS: "1",
      PLAYWRIGHT_INSTALL_TIMEOUT_MS: "900000",
    });
    for (const [jobId, timeout] of Object.entries(timeouts)) {
      const job = workflow.jobs[jobId];
      const installs = job.steps.filter((step) => step.run === "pnpm e2e:install:chromium");
      expect(job["timeout-minutes"]).toBe(timeout);
      expect(installs).toHaveLength(1);
      expect(installs[0]).toEqual({
        name: expect.stringContaining("Install Playwright Chromium"),
        run: "pnpm e2e:install:chromium",
      });
      expect(parseInstallConfig([], {
        NODE_ENV: "test",
        ...workflow.env,
        ...job.env,
        ...installs[0].env,
      })).toMatchObject({ attempts: 1, timeoutMs: 900_000 });
    }
  });

  it.each(["ci.yml", "e2e-smoke.yml"])("pins the declared toolchain in %s", (file) => {
    const workflow = loadYaml(read(`.github/workflows/${file}`)) as Workflow;
    const pkg = JSON.parse(read("package.json")) as { packageManager?: string; engines?: { node?: string } };
    const nodeVersion = pkg.engines?.node;
    expect(nodeVersion).toBe("22.22.2");
    const pins = {
      "actions/checkout": "df4cb1c069e1874edd31b4311f1884172cec0e10",
      "pnpm/action-setup": "0977fd99725f1db4007ccb2928dbb4e90d06cc86",
      "actions/setup-node": "a0853c24544627f65ddf259abe73b1d18a591444",
    };

    expect(pkg.packageManager).toBe("pnpm@9.15.9");
    for (const job of Object.values(workflow.jobs)) {
      for (const [action, sha] of Object.entries(pins)) {
        const steps = job.steps.filter((step) => step.uses?.startsWith(`${action}@`));
        expect(steps).toHaveLength(1);
        expect(steps[0].uses).toBe(`${action}@${sha}`);
      }
      expect(job.steps.find((step) => step.name === "Setup pnpm")?.with).toEqual({
        version: "9.15.9",
      });
      expect(job.steps.find((step) => step.name === "Setup Node.js")?.with).toEqual({
        "node-version": nodeVersion,
        cache: "pnpm",
        "cache-dependency-path": "pnpm-lock.yaml",
      });
    }
  });

  it("aligns every workflow setup-node version with package.json engines.node", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    const setupNodeSteps = readWorkflows().flatMap(({ file, workflow }) =>
      Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
        (job.steps ?? [])
          .filter((step) => step.uses?.startsWith("actions/setup-node@"))
          .map((step) => ({ location: `${file}/${jobId}`, nodeVersion: step.with?.["node-version"] })),
      ),
    );

    expect(setupNodeSteps.length).toBeGreaterThan(0);
    expect(setupNodeSteps.filter((step) => step.nodeVersion !== pkg.engines?.node)).toEqual([]);
  });


  it("pins every discovered pnpm setup and aligns its input with packageManager", () => {
    expect(pnpmVersionIssues(readWorkflows())).toEqual([]);
  });

  it.each(readWorkflows().flatMap(({ file, workflow }) =>
    Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
      (job.steps ?? []).flatMap((step, index) => step.uses?.startsWith("pnpm/action-setup@")
        ? ["0ebf47130e4866e96fce0953f49152a61190b271", "v6", "0000000000000000000000000000000000000000"]
          .map((ref) => ({ file, jobId, index, ref }))
        : []),
    ),
  ))("rejects $ref at $file/$jobId/steps[$index]", ({ file, jobId, index, ref }) => {
    const workflows = readWorkflows();
    const workflow = workflows.find((entry) => entry.file === file)!.workflow;
    workflow.jobs[jobId].steps[index].uses = `pnpm/action-setup@${ref}`;
    expect(pnpmVersionIssues(workflows)).toEqual([
      expect.stringContaining(`${file}/${jobId}/steps[${index}]`),
    ]);
    expect(pnpmVersionIssues(workflows)[0]).toContain("must equal the reviewed pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86");
  });

  it.each(["release.yml", "daily-refresh.yml", "rules-tune-pr.yml"])(
    "rejects a remaining major-only pnpm input in %s",
    (file) => {
      const workflows = readWorkflows();
      const workflow = workflows.find((entry) => entry.file === file)!.workflow;
      const step = Object.values(workflow.jobs)
        .flatMap((job) => job.steps ?? [])
        .find((entry) => entry.uses?.startsWith("pnpm/action-setup@"))!;
      expect(step.with).toBeDefined();
      step.with!.version = 9;
      const issues = pnpmVersionIssues(workflows);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain(`${file}/`);
      expect(issues[0]).toContain("version=9 must equal package.json packageManager version=");
    },
  );

  it("allows jobs without pnpm while checking a static manifest path", () => {
    const workflow = loadYaml(read(".github/workflows/release.yml")) as Workflow;
    expect(workflow.jobs.publish.steps.some((step) => step.uses?.startsWith("pnpm/action-setup@"))).toBe(false);
    const step = workflow.jobs.verify_and_package.steps
      .find((entry) => entry.uses?.startsWith("pnpm/action-setup@"))!;
    step.with!.package_json_file = "./package.json";
    expect(pnpmVersionIssues([{ file: "release.yml", workflow }])).toEqual([]);
  });

  it.each(["${{ inputs.manifest }}", "missing-package.json"])(
    "reports an unresolved pnpm manifest instead of skipping %s",
    (manifest) => {
      const workflow = loadYaml(read(".github/workflows/release.yml")) as Workflow;
      const step = workflow.jobs.verify_and_package.steps
        .find((entry) => entry.uses?.startsWith("pnpm/action-setup@"))!;
      step.with!.package_json_file = manifest;
      expect(pnpmVersionIssues([{ file: "release.yml", workflow }])).toEqual([
        expect.stringContaining("release.yml/verify_and_package/steps[1] (Setup pnpm): cannot"),
      ]);
    },
  );

  it("does not pass pnpm alignment when no setup steps are discovered", () => {
    expect(pnpmVersionIssues([])).toEqual(["No pnpm/action-setup steps discovered"]);
  });

  it("pins the runtime toolchain, workflow actions, and native Windows smoke", () => {
    const pkg = JSON.parse(read("package.json")) as {
      packageManager?: string;
      engines?: { node?: string; pnpm?: string };
    };
    const workflows = [read(".github/workflows/ci.yml"), read(".github/workflows/release.yml")];
    const usesLines = workflows.flatMap((source) => source.split(/\r?\n/u).filter((line) => line.trim().startsWith("uses:")));

    expect(pkg.packageManager).toBe("pnpm@9.15.9");
    expect(pkg.engines).toEqual({ node: "22.22.2", pnpm: "9.15.9" });
    expect(usesLines.length).toBeGreaterThan(0);
    expect(usesLines.every((line) => /@[0-9a-f]{40}(?:\s+#.*)?$/u.test(line.trim()))).toBe(true);
    for (const workflow of workflows) {
      expect(workflow).toContain('node-version: "22.22.2"');
    }
    const ci = workflows[0] ?? "";
    expect(ci).toContain("windows_native:");
    expect(ci).toContain("runs-on: windows-latest");
    expect(ci).toContain('DATABASE_URL: "file:./windows-ci.db"');
    expect(ci).not.toContain('DATABASE_URL: "file:./prisma/windows-ci.db"');
    expect(ci).toContain("planning:v2:prod:smoke");
    expect(ci).toContain("planning:v2:desktop:smoke");
    expect(ci).toContain("--use-installed-database");
    expect(ci).toContain("desktop-artifact-provenance.test.ts");
    expect(ci).toContain("planningRuntimeRoot.test.ts");
    expect(ci).toContain("planningWriterLease.test.ts");
    expect(ci).toContain("planningDesktopSessionServer.test.ts");
    expect(ci).not.toContain("planningDesktopLauncher.test.ts");
  });

  it("keeps planning route coverage discovery-based instead of fixed counts or proxy lists", () => {
    const coverageSource = read("tests/planning/auth/planningRouteUserScopeCoverage.test.ts");
    const legacyProxyRoute = ["src", "app", "api", "planning", "run", "[id]", "route.ts"].join("/");

    expect(coverageSource).not.toContain("EXPECTED_PLANNING_ROUTE_COUNT");
    expect(coverageSource).toContain("findPlanningProxyRouteFiles");
    expect(coverageSource).not.toContain(legacyProxyRoute);
  });
});
