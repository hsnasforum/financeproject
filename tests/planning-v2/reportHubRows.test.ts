import { describe, expect, it } from "vitest";
import { toRunReportHubRow } from "../../src/app/planning/reports/_lib/runReportHubRows";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function buildRun(input?: Partial<PlanningRunRecord>): PlanningRunRecord {
  return {
    version: 1,
    id: input?.id ?? "run-1",
    profileId: input?.profileId ?? "profile-1",
    ...(input?.title ? { title: input.title } : {}),
    createdAt: input?.createdAt ?? "2026-03-01T09:00:00.000Z",
    input: input?.input ?? { horizonMonths: 120 },
    meta: input?.meta ?? {
      snapshot: {
        id: "snap-meta",
        asOf: "2026-02-28",
        missing: false,
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: input?.outputs ?? {
      resultDto: {
        version: 1,
        meta: {
          generatedAt: "2026-03-01T09:00:01.000Z",
          snapshot: {
            id: "snap-dto",
            asOf: "2026-02-27",
            missing: false,
          },
        },
        summary: {
          worstCashKrw: 1_000_000,
          goalsAchieved: { achieved: 2, total: 3 },
          dsrPct: 45,
          totalWarnings: 1,
        },
        warnings: {
          aggregated: [],
          top: [],
        },
        goals: [],
        timeline: {
          points: [],
        },
      },
    },
  };
}

describe("toRunReportHubRow", () => {
  it("maps summary and falls back to Run {id} title", () => {
    const row = toRunReportHubRow(buildRun({
      id: "run-fallback-title",
      outputs: {
        resultDto: {
          version: 1,
          meta: {
            generatedAt: "2026-03-01T09:00:01.000Z",
            snapshot: {
              id: "snap-dto",
              asOf: "2026-02-28",
              missing: false,
            },
          },
          summary: {
            worstCashKrw: 2_500_000,
            goalsAchieved: { achieved: 1, total: 2 },
            dsrPct: 0.48,
            totalWarnings: 0,
          },
          warnings: { aggregated: [], top: [] },
          goals: [],
          timeline: { points: [] },
        },
      },
    }));

    expect(row.title).toBe("실행 run-fallback-title");
    expect(row.snapshot.id).toBe("snap-meta");
    expect(row.snapshot.asOf).toBe("2026-02-28");
    expect(row.snapshot.missing).toBe(false);
    expect(row.summary.goalsAchieved).toBe("1/2");
    expect(row.summary.worstCashKrw).toBe(2_500_000);
    expect(row.summary.dsrPct).toBe(48);
  });

  it("derives goals and dsr when summary fields are absent", () => {
    const row = toRunReportHubRow(buildRun({
      title: "내 실행",
      meta: {
        snapshot: {},
        health: {
          warningsCodes: [],
          criticalCount: 0,
        },
      },
      outputs: {
        resultDto: {
          version: 1,
          meta: {
            generatedAt: "2026-03-01T09:00:01.000Z",
            snapshot: {
              id: "snap-from-dto",
              asOf: "2026-02-20",
              missing: true,
            },
          },
          summary: {
            totalWarnings: 0,
          },
          warnings: { aggregated: [], top: [] },
          goals: [
            { id: "g1", title: "비상금", type: "emergencyFund", achieved: true },
            { id: "g2", title: "목돈", type: "lumpSum", achieved: false },
          ],
          timeline: { points: [] },
          debt: {
            dsrPct: 0.325,
          },
        },
      },
    }));

    expect(row.title).toBe("내 실행");
    expect(row.snapshot.id).toBe("snap-from-dto");
    expect(row.snapshot.asOf).toBe("2026-02-20");
    expect(row.snapshot.missing).toBe(true);
    expect(row.summary.goalsAchieved).toBe("1/2");
    expect(row.summary.worstCashKrw).toBeUndefined();
    expect(row.summary.dsrPct).toBe(32.5);
  });
});
