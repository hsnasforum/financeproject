import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_REFRESH_APPROVED_PR_PATHS,
  DAILY_REFRESH_DIAGNOSTIC_ARTIFACT_PATHS,
} from "../scripts/daily_refresh_contract.mjs";

const { load: loadYaml } = createRequire(import.meta.url)("js-yaml") as {
  load: (source: string) => unknown;
};

type DailyWorkflow = {
  jobs: {
    refresh: {
      steps: Array<{ name: string; uses?: string; with?: { version?: string | number } }>;
    };
  };
};

function expectExactPnpmContract(workflow: DailyWorkflow, packageManager: string | undefined): void {
  const setup = workflow.jobs.refresh.steps.find((step) => step.name === "Setup pnpm");
  expect(setup?.uses).toBe("pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86");
  expect(setup?.with?.version).toBe("9.15.9");
  expect(packageManager).toBe("pnpm@9.15.9");
  expect(setup?.with?.version).toBe(packageManager?.slice("pnpm@".length));
}

function extractAddPaths(source: string): string[] {
  const marker = "          add-paths: |\n";
  const start = source.indexOf(marker);
  if (start < 0) return [];
  const lines = source.slice(start + marker.length).split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("            ")) break;
    const value = line.trim();
    if (value) out.push(value);
  }
  return out;
}

function extractUploadPaths(source: string): string[] {
  const marker = "          path: |\n";
  const start = source.indexOf(marker);
  if (start < 0) return [];
  const lines = source.slice(start + marker.length).split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("            ")) break;
    const value = line.trim();
    if (value) out.push(value);
  }
  return out;
}

function extractStepBlock(source: string, name: string): string {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const next = source.indexOf("\n      - name: ", start + marker.length);
  return source.slice(start, next < 0 ? undefined : next);
}

describe("daily refresh workflow contract", () => {
  it("pins exact pnpm 9.15.9 before the engines Node pnpm cache and frozen install", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github", "workflows", "daily-refresh.yml"),
      "utf-8",
    );
    const stepNames = [
      "Checkout",
      "Setup pnpm",
      "Setup Node",
      "Install",
      "Validate refresh configuration",
      "Run daily refresh",
      "Validate refresh result and build evidence",
      "Upload artifacts",
      "Create refresh pull request",
    ];
    const positions = stepNames.map((name) => workflow.indexOf(`      - name: ${name}\n`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));

    const setupPnpmBlock = extractStepBlock(workflow, "Setup pnpm");
    expect(setupPnpmBlock).toContain("uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      packageManager?: string;
      engines?: { node?: string };
    };
    expectExactPnpmContract(loadYaml(workflow) as DailyWorkflow, pkg.packageManager);

    const setupNodeBlock = extractStepBlock(workflow, "Setup Node");
    expect(setupNodeBlock).toContain("uses: actions/setup-node@v5");
    expect(pkg.engines?.node).toBe("22.22.2");
    expect(setupNodeBlock).toContain(`node-version: "${pkg.engines?.node}"`);
    expect(setupNodeBlock).toContain('cache: "pnpm"');
    expect(setupNodeBlock).toContain("cache-dependency-path: pnpm-lock.yaml");

    const installBlock = extractStepBlock(workflow, "Install");
    expect(installBlock).toContain('DATABASE_URL: "file:./prisma/ci.db"');
    expect(installBlock).toContain("run: pnpm install --frozen-lockfile");
    expect(installBlock).not.toContain("corepack enable");
    expect(workflow).not.toContain("corepack enable");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toMatch(/\n  schedule:\n\s+- cron:/);
  });

  it.each([
    { label: "numeric major", version: 9, packageManager: "pnpm@9.15.9" },
    { label: "string major", version: "9", packageManager: "pnpm@9.15.9" },
    { label: "other patch", version: "9.15.10", packageManager: "pnpm@9.15.9" },
    { label: "missing version", version: undefined, packageManager: "pnpm@9.15.9" },
    { label: "manifest mismatch", version: "9.15.9", packageManager: "pnpm@9.15.10" },
    { label: "matching but unapproved versions", version: "9.15.10", packageManager: "pnpm@9.15.10" },
  ])("rejects $label in the exact pnpm contract", ({ version, packageManager }) => {
    const workflow = loadYaml(fs.readFileSync(".github/workflows/daily-refresh.yml", "utf8")) as DailyWorkflow;
    const setup = workflow.jobs.refresh.steps.find((step) => step.name === "Setup pnpm")!;
    if (version === undefined) delete setup.with!.version;
    else setup.with!.version = version;
    expect(() => expectExactPnpmContract(workflow, packageManager)).toThrow();
  });

  it.each(['"9.15.9"', "9.15.9"])("accepts the parsed exact pnpm version %s", (version) => {
    const workflow = loadYaml(`
jobs:
  refresh:
    steps:
      - name: Setup pnpm
        uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86
        with:
          version: ${version}
`) as DailyWorkflow;
    expect(() => expectExactPnpmContract(workflow, "pnpm@9.15.9")).not.toThrow();
  });

  it("fails closed before creating a pull request and uses only approved tracked paths", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github", "workflows", "daily-refresh.yml"),
      "utf-8",
    );

    expect(workflow).toContain("id: refresh");
    expect(workflow).toContain("id: preflight");
    expect(workflow).toContain("node scripts/daily_refresh_ci.mjs --check-env");
    expect(workflow).toContain("run: pnpm daily:refresh:strict");
    expect(workflow).toContain("id: evidence");
    expect(workflow).toContain("node scripts/daily_refresh_ci.mjs");
    expect(workflow).toContain("steps.preflight.outcome == 'success'");
    expect(workflow).toContain("steps.refresh.outcome == 'success'");
    expect(workflow).toContain("steps.evidence.outcome == 'success'");
    expect(workflow).toContain("steps.evidence.outputs.ok == 'true'");
    expect(workflow).toContain("steps.artifacts.outcome == 'success'");
    expect(workflow).toContain("body-path: ${{ runner.temp }}/daily_refresh_pr_body.md");
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("base: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("group: daily-refresh-${{ github.repository }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1");
    for (const envName of [
      "FINLIFE_API_KEY",
      "FINLIFE_TOPFIN_GRP_LIST",
      "KDB_DATAGO_SERVICE_KEY",
      "DATAGO_SERVICE_KEY",
      "BOK_ECOS_API_KEY",
      "ECOS_API_KEY",
      "EXIM_EXCHANGE_API_KEY",
      "EXIM_EXCHANGE_API_URL",
      "MOIS_BENEFITS_API_KEY",
      "MOIS_BENEFITS_API_URL",
      "OPENDART_API_KEY",
    ]) {
      const secretExpression = "${{ secrets." + envName + " }}";
      expect(workflow).toContain(`${envName}: ${secretExpression}`);
    }
    expect(workflow).not.toMatch(/run:\s+pnpm daily:refresh\s*$/m);
    expect(workflow).not.toContain("add-paths: |\n            docs/**");
    expect(workflow).not.toContain("tmp/**");
    expect(extractAddPaths(workflow)).toEqual(DAILY_REFRESH_APPROVED_PR_PATHS);
  });

  it("keeps failure diagnostics uploadable without adding them to the PR", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github", "workflows", "daily-refresh.yml"),
      "utf-8",
    );
    const addPaths = new Set(extractAddPaths(workflow));

    expect(workflow).toContain("tmp/daily_refresh_result.json");
    expect(workflow).toContain("tmp/daily_refresh.log");
    expect(workflow).toContain("tmp/daily_refresh_evidence.json");
    expect(workflow).toContain("${{ runner.temp }}/daily_refresh_pr_body.md");
    expect(extractStepBlock(workflow, "Validate refresh result and build evidence")).toContain("if: always()");
    expect(extractStepBlock(workflow, "Upload artifacts")).toContain("if: always()");
    expect(extractUploadPaths(workflow)).toEqual([
      ...DAILY_REFRESH_DIAGNOSTIC_ARTIFACT_PATHS.slice(0, 3),
      "${{ runner.temp }}/daily_refresh_pr_body.md",
      ...DAILY_REFRESH_DIAGNOSTIC_ARTIFACT_PATHS.slice(3),
    ]);
    expect(addPaths.has("tmp/daily_refresh_result.json")).toBe(false);
    expect(addPaths.has("tmp/daily_refresh.log")).toBe(false);
    expect(addPaths.has("tmp/daily_refresh_evidence.json")).toBe(false);
  });
});
