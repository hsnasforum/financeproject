import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { filterWhitelistedPaths, runRulesPrPrepare } from "../scripts/rules_pr_prepare.mjs";

const roots: string[] = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-rules-pr-prepare-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("rules pr prepare", () => {
  it("filters out non-whitelisted files", () => {
    const paths = [
      "config/dart-disclosure-rules.json",
      "data/dart/labels.csv",
      "docs/dart-rules-eval-report.md",
      "docs/other.md",
      "src/app/page.tsx",
      "tmp/dart/rules_patch.json",
    ];

    const rulesOnly = filterWhitelistedPaths(paths, { scope: "rules", includeTmpPatch: false });
    expect(rulesOnly).toEqual([
      "config/dart-disclosure-rules.json",
      "docs/dart-rules-eval-report.md",
    ]);

    const bothWithTmp = filterWhitelistedPaths(paths, { scope: "both", includeTmpPatch: true });
    expect(bothWithTmp).toEqual([
      "config/dart-disclosure-rules.json",
      "data/dart/labels.csv",
      "docs/dart-rules-eval-report.md",
      "tmp/dart/rules_patch.json",
    ]);
  });

  it("fails safely when cwd is not a git repository", () => {
    const cwd = makeRoot();
    const result = runRulesPrPrepare({
      cwd,
      scope: "both",
      includeTmpPatch: false,
      branchName: "ops/rules-tune-test",
    });

    const failure = result as { ok: boolean; error?: { message?: string } };
    expect(failure.ok).toBe(false);
    if (failure.ok) {
      throw new Error("expected failure for non-git directory");
    }
    expect(failure.error?.message ?? "").toContain("git repository");
  });
});
