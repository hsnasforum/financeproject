import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_REFRESH_APPROVED_PR_PATHS,
  DAILY_REFRESH_DIAGNOSTIC_ARTIFACT_PATHS,
} from "../scripts/daily_refresh_contract.mjs";

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

describe("daily refresh workflow contract", () => {
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
    const setupNodeBlock = workflow.slice(
      workflow.indexOf("      - name: Setup Node"),
      workflow.indexOf("      - name: Install"),
    );
    expect(setupNodeBlock).not.toContain('cache: "pnpm"');
    for (const envName of [
      "FINLIFE_API_KEY",
      "FINLIFE_TOPFIN_GRP_LIST",
      "KDB_DATAGO_SERVICE_KEY",
      "DATAGO_SERVICE_KEY",
      "BOK_ECOS_API_KEY",
      "ECOS_API_KEY",
      "EXIM_EXCHANGE_API_KEY",
      "EXIM_EXCHANGE_API_URL",
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
