import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLatestEvalReport } from "../../src/lib/planning/regression/readLatestEval";

const env = process.env as Record<string, string | undefined>;
const originalPath = process.env.PLANNING_EVAL_REPORT_PATH;

describe("readLatestEvalReport", () => {
  beforeEach(() => {
    delete env.PLANNING_EVAL_REPORT_PATH;
  });

  afterEach(() => {
    if (typeof originalPath === "string") env.PLANNING_EVAL_REPORT_PATH = originalPath;
    else delete env.PLANNING_EVAL_REPORT_PATH;
  });

  it("loads latest eval report from fixture path", async () => {
    env.PLANNING_EVAL_REPORT_PATH = path.join(
      "tests",
      "fixtures",
      "planning-regression",
      "eval-latest.sample.json",
    );

    const report = await readLatestEvalReport();
    expect(report).not.toBeNull();
    expect(report?.summary?.total).toBe(3);
    expect(report?.summary?.fail).toBe(1);
    expect(report?.cases?.[1]?.id).toBe("case-002");
    expect(report?.cases?.[1]?.diffs?.[0]?.path).toBe("simulate.endNetWorthKrw");
  });

  it("returns null when report file does not exist", async () => {
    env.PLANNING_EVAL_REPORT_PATH = path.join("tests", "fixtures", "planning-regression", "missing.json");

    const report = await readLatestEvalReport();
    expect(report).toBeNull();
  });
});
