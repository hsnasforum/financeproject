import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { runLabeledEval } from "../scripts/dart_rules_eval_labeled.mjs";

const roots: string[] = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-dart-labeled-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("dart rules labeled eval", () => {
  it("creates accuracy and misclassification outputs from csv fixture", async () => {
    const root = makeRoot();
    const labelsPath = path.join(root, "labels.csv");
    const outputJsonPath = path.join(root, "rules_labeled_eval.json");
    const outputMdPath = path.join(root, "rules_labeled_report.md");
    const rulesPath = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

    fs.writeFileSync(
      labelsPath,
      [
        "corpCode,rceptDt,reportNm,label",
        "00126380,20260226,유상증자 결정,capital",
        "00126380,20260225,대표이사 변경,governance",
        "00126380,20260224,유상증자 결정,governance",
      ].join("\n"),
      "utf-8",
    );

    const result = await runLabeledEval({
      cwd: root,
      labelsPath,
      rulesPath,
      outputJsonPath,
      outputMdPath,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(fs.existsSync(outputJsonPath)).toBe(true);
    expect(fs.existsSync(outputMdPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(outputJsonPath, "utf-8")) as {
      total?: number;
      accuracy?: number;
      misclassifiedTop?: Array<{ label?: string; predictedCategoryId?: string }>;
    };
    expect(parsed.total).toBe(3);
    expect(typeof parsed.accuracy).toBe("number");
    expect((parsed.misclassifiedTop ?? []).length).toBeGreaterThanOrEqual(1);
    expect(parsed.misclassifiedTop?.[0]?.label).toBeTruthy();
    expect(parsed.misclassifiedTop?.[0]?.predictedCategoryId).toBeTruthy();
  });
});
