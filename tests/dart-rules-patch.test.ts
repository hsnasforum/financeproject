import path from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import {
  applyPatchToRules,
  buildPatchDiffMarkdown,
  createBackupPath,
} from "../scripts/dart_rules_apply_patch.mjs";

describe("dart rules patch", () => {
  it("does not add duplicate patterns", () => {
    const rules = {
      version: 1,
      categories: [
        {
          id: "capital",
          patterns: ["유상증자"],
        },
      ],
    };
    const patch = {
      version: 1,
      createdAt: "2026-02-27T00:00:00.000Z",
      changes: [
        {
          categoryId: "capital",
          addPatterns: ["유상증자", "신규패턴", "신규패턴"],
        },
      ],
    };

    const out = applyPatchToRules(rules, patch);
    const category = (out.nextRules.categories as Array<{ id: string; patterns: string[] }>).find(
      (row) => row.id === "capital",
    );

    expect(category?.patterns).toEqual(["유상증자", "신규패턴"]);
    expect(out.summary.totalAdded).toBe(1);
  });

  it("builds dry-run diff markdown", () => {
    const markdown = buildPatchDiffMarkdown({
      generatedAt: "2026-02-27T00:00:00.000Z",
      rulesPath: "config/dart-disclosure-rules.json",
      patchPath: "tmp/dart/rules_patch.json",
      summary: {
        totalAdded: 2,
        categoryChanges: [
          {
            categoryId: "capital",
            beforeCount: 5,
            afterCount: 7,
            addPatterns: ["신규1", "신규2"],
          },
        ],
      },
    });

    expect(markdown).toContain("# DART Rules Patch Diff (Dry Run)");
    expect(markdown).toContain("- + 신규1");
    expect(markdown).toContain("- + 신규2");
    expect(markdown).toContain("- totalAdded: 2");
  });

  it("creates backup filename with expected format", () => {
    const root = "/tmp/workspace";
    const backupPath = createBackupPath(root, new Date("2026-02-27T12:34:56.789Z"));
    const base = path.basename(backupPath);

    expect(backupPath).toContain(path.join(root, "tmp", "dart"));
    expect(base).toMatch(/^rules_before_patch_\d{8}_\d{6}_\d{3}\.json$/);
  });
});
