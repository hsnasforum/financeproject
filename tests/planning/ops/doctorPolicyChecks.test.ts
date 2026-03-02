import { describe, expect, it } from "vitest";
import {
  buildAssumptionsFreshnessDoctorCheck,
  buildMetricsDoctorChecks,
  buildRecentSuccessfulRunDoctorCheck,
  buildScheduledRunFailureDoctorCheck,
  computeStaleDays,
} from "../../../src/lib/ops/doctorPolicyChecks";

describe("doctorPolicyChecks", () => {
  it("computes staleDays as non-negative UTC day diff", () => {
    const now = new Date("2026-03-02T10:00:00.000Z");
    expect(computeStaleDays("2026-03-01T23:00:00.000Z", now)).toBe(1);
    expect(computeStaleDays("2026-03-03T00:00:00.000Z", now)).toBe(0);
  });

  it("returns WARN when assumptions snapshot is stale beyond caution threshold", () => {
    const check = buildAssumptionsFreshnessDoctorCheck({
      snapshot: {
        asOf: "2026-01-01",
        fetchedAt: "2026-01-01T00:00:00.000Z",
      },
      staleCautionDays: 45,
      staleRiskDays: 120,
      now: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(check.status).toBe("WARN");
    expect(check.message).toContain("staleDays=60");
  });

  it("returns PASS when a successful run exists within threshold", () => {
    const check = buildRecentSuccessfulRunDoctorCheck({
      runs: [
        {
          id: "run-1",
          createdAt: "2026-02-25T09:00:00.000Z",
          overallStatus: "SUCCESS",
        },
      ],
      successRunWarnDays: 10,
      now: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(check.status).toBe("PASS");
    expect(check.message).toContain("5일 전");
  });

  it("returns WARN when no successful run exists in recent window", () => {
    const check = buildRecentSuccessfulRunDoctorCheck({
      runs: [
        {
          id: "run-2",
          createdAt: "2026-02-28T09:00:00.000Z",
          overallStatus: "FAILED",
        },
      ],
      successRunWarnDays: 7,
      now: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(check.status).toBe("WARN");
    expect(check.message).toContain("최근 성공 run이 없습니다");
  });

  it("triggers metrics warnings when failure and refresh-failure thresholds are exceeded", () => {
    const checks = buildMetricsDoctorChecks({
      events: [
        {
          type: "ASSUMPTIONS_REFRESH",
          at: "2026-03-02T09:00:00.000Z",
          meta: { status: "FAILED", durationMs: 900 },
        },
        {
          type: "ASSUMPTIONS_REFRESH",
          at: "2026-03-02T08:00:00.000Z",
          meta: { status: "FAILED", durationMs: 880 },
        },
        {
          type: "RUN_STAGE",
          at: "2026-03-02T07:00:00.000Z",
          meta: { status: "FAILED", durationMs: 1400 },
        },
        {
          type: "RUN_STAGE",
          at: "2026-03-02T06:00:00.000Z",
          meta: { status: "SUCCESS", durationMs: 1200 },
        },
        {
          type: "RUN_STAGE",
          at: "2026-03-01T05:00:00.000Z",
          meta: { status: "SUCCESS", durationMs: 100 },
        },
      ],
      failureRateWarnPct: 40,
      latencyRegressionWarnMs: 100,
      refreshFailureWarnCount: 2,
      shortWindowHours: 24,
      longWindowDays: 7,
      now: new Date("2026-03-02T10:00:00.000Z"),
    });

    expect(checks).toHaveLength(3);
    expect(checks.find((row) => row.id === "metrics-failure-rate")?.status).toBe("WARN");
    expect(checks.find((row) => row.id === "metrics-latency-regression")?.status).toBe("WARN");
    expect(checks.find((row) => row.id === "metrics-refresh-failures")?.status).toBe("WARN");
  });

  it("warns when scheduled monthly run fails repeatedly within window", () => {
    const check = buildScheduledRunFailureDoctorCheck({
      events: [
        { type: "SCHEDULED_TASK", at: "2026-03-02T09:00:00.000Z", meta: { taskName: "PLANNING_RUN_MONTHLY", status: "FAILED", code: "LOCKED" } },
        { type: "SCHEDULED_TASK", at: "2026-03-01T09:00:00.000Z", meta: { taskName: "PLANNING_RUN_MONTHLY", status: "FAILED", code: "STALE_ASSUMPTIONS" } },
        { type: "SCHEDULED_TASK", at: "2026-02-28T09:00:00.000Z", meta: { taskName: "PLANNING_RUN_MONTHLY", status: "FAILED", code: "LOCKED" } },
        { type: "SCHEDULED_TASK", at: "2026-03-02T08:00:00.000Z", meta: { taskName: "OPS_REFRESH_ASSUMPTIONS", status: "FAILED", code: "INTERNAL" } },
      ],
      taskName: "PLANNING_RUN_MONTHLY",
      failureWarnCount: 3,
      windowDays: 14,
      now: new Date("2026-03-02T10:00:00.000Z"),
    });

    expect(check.status).toBe("WARN");
    expect(check.message).toContain("실패 3건");
    expect(check.details?.recentCodes).toEqual(expect.arrayContaining(["LOCKED", "STALE_ASSUMPTIONS"]));
  });
});
