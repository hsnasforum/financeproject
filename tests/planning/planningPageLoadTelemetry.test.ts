import { describe, expect, it, vi } from "vitest";
import {
  createPlanningPageLoadTelemetry,
  getPlanningPageLoadSlowThresholdMs,
} from "../../src/lib/planning/server/pages/planningPageLoadTelemetry";

function createSequenceClock(values: number[]) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
}

describe("planning page load telemetry", () => {
  it("records slow page load steps without logging ids or payloads", async () => {
    const logger = vi.fn();
    const telemetry = createPlanningPageLoadTelemetry({
      context: {
        hasInitialFilterProfileId: true,
        invalidCount: Number.NaN,
        omitted: undefined,
      },
      enabled: true,
      logger,
      nowMs: createSequenceClock([0, 5, 20, 25, 35, 60]),
      route: "/planning/runs",
      slowThresholdMs: 50,
    });

    await expect(telemetry.step("profiles", async () => "ready")).resolves.toBe("ready");
    await expect(telemetry.step("runs", async () => {
      throw new TypeError("store failed");
    })).rejects.toThrow("store failed");

    const snapshot = telemetry.finish({
      profileCount: 1,
      runCount: 0,
      status: "fallback",
    });

    expect(snapshot).toEqual({
      context: {
        hasInitialFilterProfileId: true,
        invalidCount: null,
        profileCount: 1,
        runCount: 0,
        status: "fallback",
      },
      route: "/planning/runs",
      slowThresholdMs: 50,
      steps: [
        { durationMs: 15, name: "profiles", status: "ok" },
        { durationMs: 10, errorName: "TypeError", name: "runs", status: "error" },
      ],
      totalMs: 60,
    });
    expect(logger).toHaveBeenCalledWith(snapshot);
  });

  it("does not log when a load stays under the slow threshold", async () => {
    const logger = vi.fn();
    const telemetry = createPlanningPageLoadTelemetry({
      enabled: true,
      logger,
      nowMs: createSequenceClock([0, 2, 5, 10]),
      route: "/planning/runs",
      slowThresholdMs: 50,
    });

    await telemetry.step("profiles", async () => []);
    const snapshot = telemetry.finish({ status: "ok" });

    expect(snapshot.totalMs).toBe(10);
    expect(logger).not.toHaveBeenCalled();
  });

  it("uses an opt-in env threshold while keeping invalid values safe", () => {
    const previous = process.env.PLANNING_PAGE_LOAD_SLOW_MS;
    try {
      process.env.PLANNING_PAGE_LOAD_SLOW_MS = "1234";
      expect(getPlanningPageLoadSlowThresholdMs()).toBe(1234);

      process.env.PLANNING_PAGE_LOAD_SLOW_MS = "-1";
      expect(getPlanningPageLoadSlowThresholdMs()).toBe(5000);

      process.env.PLANNING_PAGE_LOAD_SLOW_MS = "not-a-number";
      expect(getPlanningPageLoadSlowThresholdMs()).toBe(5000);
    } finally {
      if (previous === undefined) {
        delete process.env.PLANNING_PAGE_LOAD_SLOW_MS;
      } else {
        process.env.PLANNING_PAGE_LOAD_SLOW_MS = previous;
      }
    }
  });
});
