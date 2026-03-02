import { describe, expect, it } from "vitest";
import { runStagePipeline } from "../../../src/lib/planning/v2/stagePipeline";

function createNow(seed = 1_700_000_000_000) {
  let cursor = seed;
  return () => {
    cursor += 11;
    return cursor;
  };
}

describe("runStagePipeline", () => {
  it("stops after simulate failure and marks later stages as PREREQ_FAILED skipped", async () => {
    const now = createNow();
    const result = await runStagePipeline({
      simulate: {
        run: () => {
          throw new Error("simulate boom");
        },
      },
      scenarios: { run: () => ({ ok: true }) },
      monteCarlo: { run: () => ({ ok: true }) },
      actions: { run: () => ({ ok: true }) },
      debt: { run: () => ({ ok: true }) },
      nowMs: now,
    });

    expect(result.overallStatus).toBe("FAILED");
    expect(result.stages.find((stage) => stage.id === "simulate")?.status).toBe("FAILED");
    expect(result.stages.find((stage) => stage.id === "scenarios")).toMatchObject({
      status: "SKIPPED",
      reason: "PREREQ_FAILED",
    });
    expect(result.stages.find((stage) => stage.id === "monteCarlo")).toMatchObject({
      status: "SKIPPED",
      reason: "PREREQ_FAILED",
    });
    expect(result.stages.find((stage) => stage.id === "actions")).toMatchObject({
      status: "SKIPPED",
      reason: "PREREQ_FAILED",
    });
    expect(result.stages.find((stage) => stage.id === "debt")).toMatchObject({
      status: "SKIPPED",
      reason: "PREREQ_FAILED",
    });
  });

  it("marks monteCarlo as SKIPPED when budget is exceeded", async () => {
    const now = createNow();
    const result = await runStagePipeline({
      simulate: { run: () => ({ netWorth: 1 }) },
      scenarios: { enabled: false, run: () => ({}) },
      monteCarlo: {
        preSkipped: {
          reason: "BUDGET_EXCEEDED",
          message: "budget exceeded",
        },
        run: () => ({ probability: 0.5 }),
      },
      actions: { enabled: false, run: () => ({}) },
      debt: { enabled: false, run: () => ({}) },
      nowMs: now,
    });

    expect(result.stages.find((stage) => stage.id === "monteCarlo")).toMatchObject({
      status: "SKIPPED",
      reason: "BUDGET_EXCEEDED",
    });
    expect(result.overallStatus).toBe("PARTIAL_SUCCESS");
  });

  it("returns PARTIAL_SUCCESS when optional stage fails and later stages still run", async () => {
    const now = createNow();
    const result = await runStagePipeline({
      simulate: { run: () => ({ netWorth: 1 }) },
      scenarios: {
        run: () => {
          throw new Error("scenario failure");
        },
      },
      monteCarlo: { enabled: false, run: () => ({}) },
      actions: { run: () => ({ actions: 3 }) },
      debt: { run: () => ({ debt: 1 }) },
      nowMs: now,
    });

    expect(result.overallStatus).toBe("PARTIAL_SUCCESS");
    expect(result.stages.find((stage) => stage.id === "scenarios")).toMatchObject({
      status: "FAILED",
      reason: "STAGE_ERROR",
    });
    expect(result.stages.find((stage) => stage.id === "actions")?.status).toBe("SUCCESS");
    expect(result.stages.find((stage) => stage.id === "debt")?.status).toBe("SUCCESS");
  });

  it("computes non-negative durationMs for terminal stages", async () => {
    const now = createNow();
    const result = await runStagePipeline({
      simulate: { run: () => ({ ok: true }) },
      scenarios: { enabled: false, run: () => ({}) },
      monteCarlo: { enabled: false, run: () => ({}) },
      actions: { enabled: false, run: () => ({}) },
      debt: { enabled: false, run: () => ({}) },
      nowMs: now,
    });

    for (const stage of result.stages) {
      if (stage.status === "RUNNING" || stage.status === "PENDING") continue;
      expect(typeof stage.durationMs).toBe("number");
      expect((stage.durationMs ?? -1) >= 0).toBe(true);
    }
  });
});
