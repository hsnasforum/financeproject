import { describe, expect, it } from "vitest";
import { buildV3RefreshAllPlan, parseArgs, runV3RefreshAll, type V3RefreshAllStep } from "./refreshAll";

describe("planning v3 refresh-all", () => {
  it("builds default plan with indicators then news", () => {
    const plan = buildV3RefreshAllPlan();
    expect(plan.map((row) => row.name)).toEqual(["indicators:refresh", "news:refresh"]);
  });

  it("adds doctor step only with --with-doctor", () => {
    const parsed = parseArgs(["--with-doctor"]);
    const plan = buildV3RefreshAllPlan(parsed);
    expect(plan.map((row) => row.name)).toEqual(["indicators:refresh", "news:refresh", "v3:doctor"]);
  });

  it("runs sequentially and returns deterministic summary shape", () => {
    const executed: V3RefreshAllStep["name"][] = [];
    const summary = runV3RefreshAll({
      withDoctor: true,
      execStep: ({ step }) => {
        executed.push(step.name);
        return { status: 0, signal: null };
      },
      now: new Date("2026-03-05T00:00:00.000Z"),
    });

    expect(executed).toEqual(["indicators:refresh", "news:refresh", "v3:doctor"]);
    expect(summary.steps).toHaveLength(3);
    expect(summary.steps.every((row) => row.exitCode === 0)).toBe(true);
    expect(summary.startedAt).toBe("2026-03-05T00:00:00.000Z");
  });

  it("fails fast on first non-zero exit and does not continue", () => {
    const executed: V3RefreshAllStep["name"][] = [];
    expect(() => runV3RefreshAll({
      execStep: ({ step }) => {
        executed.push(step.name);
        if (step.name === "news:refresh") {
          return { status: 1, signal: null };
        }
        return { status: 0, signal: null };
      },
    })).toThrow(/STEP_FAILED:news:refresh:1/);

    expect(executed).toEqual(["indicators:refresh", "news:refresh"]);
  });
});
