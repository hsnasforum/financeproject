import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { evaluateQualityGate, runQualityGate } from "../scripts/dart_rules_quality_gate.mjs";

const roots: string[] = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-dart-gate-"));
  roots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("dart rules quality gate", () => {
  it("fails when unknownRate regresses beyond threshold", () => {
    const result = evaluateQualityGate(
      {
        unknownRate: 0.15,
        correctionFlagRate: 0.02,
        highRate: 0.2,
        categoryRates: { capital: 0.3 },
      },
      {
        unknownRate: 0.1,
        correctionFlagRate: 0.02,
        highRate: 0.2,
        categoryRates: { capital: 0.3 },
      },
      { highRatePolicy: "warn" },
    );

    expect(result.status).toBe("FAIL");
    expect(result.failCount).toBeGreaterThanOrEqual(1);
    expect(result.checks.some((check: { key?: string; status?: string }) => check.key === "unknownRate" && check.status === "FAIL"))
      .toBe(true);
  });

  it("updates baseline only when update-baseline mode is enabled", () => {
    const root = makeRoot();
    const evalPath = path.join(root, "tmp", "dart", "rules_eval.json");
    const baselinePath = path.join(root, "docs", "dart-rules-quality-baseline.json");
    const reportPath = path.join(root, "docs", "dart-rules-quality-report.md");

    writeJson(evalPath, {
      unknownRate: 0.11,
      flagRates: { correction: 0.07 },
      levelRates: { high: 0.25 },
      categoryRates: { capital: 0.4, contract: 0.3 },
    });

    const updated = runQualityGate({
      cwd: root,
      updateBaseline: true,
      highRatePolicy: "warn",
    });

    expect(updated.ok).toBe(true);
    expect(updated.status).toBe("PASS");
    expect(fs.existsSync(baselinePath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);

    const baseline = readJson<{
      unknownRate?: number;
      correctionFlagRate?: number;
      highRate?: number;
      categoryRates?: Record<string, number>;
    }>(baselinePath);
    expect(baseline.unknownRate).toBeCloseTo(0.11, 6);
    expect(baseline.correctionFlagRate).toBeCloseTo(0.07, 6);
    expect(baseline.highRate).toBeCloseTo(0.25, 6);
    expect(baseline.categoryRates?.capital).toBeCloseTo(0.4, 6);
  });
});
