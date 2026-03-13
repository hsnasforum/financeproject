import { describe, expect, it } from "vitest";
import {
  buildWorkspaceCompletedRunState,
  buildWorkspaceHealthGuardState,
  buildWorkspaceSnapshotState,
  buildStepStatusesFromRunStages,
  buildWorkspaceRunResultFromRecord,
} from "../../../src/app/planning/_lib/workspaceRunResult";
import { type PlanningRunRecord } from "../../../src/lib/planning/store/types";

function createResultDto() {
  return {
    version: 1,
    meta: {
      generatedAt: "2026-03-10T00:00:00.000Z",
      snapshot: {
        id: "snapshot-1",
      },
      health: {
        criticalCount: 1,
      },
    },
    summary: {},
    warnings: {
      aggregated: [],
      top: [],
    },
    goals: [],
    timeline: {
      points: [],
    },
    raw: {
      simulate: {},
    },
  } as never;
}

function createRun(overrides?: Partial<PlanningRunRecord>): PlanningRunRecord {
  return {
    version: 1,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-03-10T00:00:00.000Z",
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 12,
    },
    meta: {
      snapshot: {
        id: "snapshot-1",
      },
      health: {
        warningsCodes: ["SNAPSHOT_STALE"],
        criticalCount: 1,
        snapshotStaleDays: 8,
      },
    },
    outputs: {
      resultDto: createResultDto(),
      simulate: {
        ref: {
          name: "simulate.json",
          path: ".data/planning/runs/run-1/simulate.json",
        },
        healthWarnings: [
          {
            code: "SNAPSHOT_STALE",
            severity: "warn",
            message: "stale snapshot",
          },
        ],
      },
    },
    stages: [
      {
        id: "simulate",
        status: "SUCCESS",
        startedAt: "2026-03-10T00:00:00.000Z",
        endedAt: "2026-03-10T00:00:01.000Z",
      },
      {
        id: "debt",
        status: "FAILED",
        reason: "STAGE_ERROR",
        errorSummary: "debt failed",
      },
    ],
    ...overrides,
  };
}

describe("workspaceRunResult", () => {
  it("maps legacy debt stage into debtStrategy step", () => {
    const statuses = buildStepStatusesFromRunStages(createRun().stages);

    expect(statuses.find((row) => row.id === "simulate")).toMatchObject({
      state: "SUCCESS",
    });
    expect(statuses.find((row) => row.id === "debtStrategy")).toMatchObject({
      state: "FAILED",
      message: "STAGE_ERROR · debt failed",
    });
  });

  it("builds workspace run result with canonical dto and health warnings", () => {
    const result = buildWorkspaceRunResultFromRecord(createRun());

    expect(result.resultDto.version).toBe(1);
    expect(result.meta?.generatedAt).toBe("2026-03-10T00:00:00.000Z");
    expect(result.meta?.health?.criticalCount).toBe(1);
    expect(result.meta?.health?.warningCodes).toEqual(["SNAPSHOT_STALE"]);
    expect(result.meta?.health?.warningsCount).toBe(1);
    expect(result.meta?.health?.snapshotStaleDays).toBe(8);
    expect(result.hasSimulateResult).toBe(true);
    expect(result.healthWarnings).toEqual([
      {
        code: "SNAPSHOT_STALE",
        severity: "warn",
        message: "stale snapshot",
      },
    ]);
  });

  it("builds completed run state with step statuses and completion notices", () => {
    const completed = buildWorkspaceCompletedRunState(createRun({
      overallStatus: "PARTIAL_SUCCESS",
      stages: [
        {
          id: "simulate",
          status: "SUCCESS",
          startedAt: "2026-03-10T00:00:00.000Z",
          endedAt: "2026-03-10T00:00:01.000Z",
        },
        {
          id: "scenarios",
          status: "FAILED",
          reason: "STAGE_ERROR",
        },
        {
          id: "monteCarlo",
          status: "SKIPPED",
          reason: "BUDGET_EXCEEDED",
        },
        {
          id: "actions",
          status: "FAILED",
          reason: "STAGE_ERROR",
        },
        {
          id: "debt",
          status: "FAILED",
          reason: "STAGE_ERROR",
        },
      ],
    }));

    expect(completed.stepStatuses).toEqual(completed.runResult.stepStatuses);
    expect(completed.notices).toEqual([
      "시나리오 계산에 실패했습니다.",
      "몬테카를로는 예산 초과로 생략되었습니다.",
      "실행 계획 생성에 실패했습니다.",
      "부채 분석에 실패했습니다.",
      "전체 상태: PARTIAL_SUCCESS",
    ]);
  });

  it("builds health guard state with stale snapshot blocking message", () => {
    const runResult = buildWorkspaceRunResultFromRecord(createRun({
      meta: {
        snapshot: {
          id: "snapshot-1",
        },
        health: {
          warningsCodes: ["SNAPSHOT_VERY_STALE"],
          criticalCount: 1,
          snapshotStaleDays: 61,
        },
      },
      outputs: {
        resultDto: createResultDto(),
        simulate: {
          ref: {
            name: "simulate.json",
            path: ".data/planning/runs/run-1/simulate.json",
          },
          healthWarnings: [
            {
              code: "SNAPSHOT_VERY_STALE",
              severity: "critical",
              message: "very stale snapshot",
            },
          ],
        },
      },
    }));

    const blocked = buildWorkspaceHealthGuardState({
      runResult,
      healthAck: false,
    });
    expect(blocked.summary?.warningCodes).toEqual(["SNAPSHOT_VERY_STALE"]);
    expect(blocked.saveBlockedByHealth).toBe(true);
    expect(blocked.disabledReason).toContain("매우 오래되었습니다");

    const acknowledged = buildWorkspaceHealthGuardState({
      runResult,
      healthAck: true,
    });
    expect(acknowledged.saveBlockedByHealth).toBe(false);
    expect(acknowledged.disabledReason).toBe("");
  });

  it("synthesizes display warnings from summary warning codes when detail rows are missing", () => {
    const runResult = buildWorkspaceRunResultFromRecord(createRun({
      meta: {
        snapshot: {
          id: "snapshot-1",
        },
        health: {
          warningsCodes: [],
          warningCodes: ["SNAPSHOT_STALE"],
          criticalCount: 1,
          snapshotStaleDays: 47,
        },
      },
      outputs: {
        resultDto: createResultDto(),
        simulate: {
          ref: {
            name: "simulate.json",
            path: ".data/planning/runs/run-1/simulate.json",
          },
        },
      },
    }));

    const blocked = buildWorkspaceHealthGuardState({
      runResult,
      healthAck: false,
    });

    expect(blocked.warnings).toEqual([
      {
        code: "SNAPSHOT_STALE",
        severity: "warn",
        message: "스냅샷 기준일이 오래되었습니다(47일). /ops/assumptions에서 동기화를 권장합니다.",
        data: { days: 47 },
      },
    ]);
    expect(blocked.saveBlockedByHealth).toBe(true);
  });

  it("builds snapshot state for feedback, outcomes, and debug display", () => {
    const runResult = buildWorkspaceRunResultFromRecord(createRun({
      meta: {
        snapshot: {
          id: "run-snapshot",
          missing: true,
        },
        health: {
          warningsCodes: ["SNAPSHOT_STALE"],
          criticalCount: 0,
          snapshotStaleDays: 12,
        },
      },
    }));

    const snapshotState = buildWorkspaceSnapshotState({
      runResult,
      selectedSnapshot: {
        id: "selected-snapshot",
        asOf: "2026-03-01",
        fetchedAt: "2026-03-02T00:00:00.000Z",
        staleDays: 9,
      },
    });

    expect(snapshotState.displayId).toBe("run-snapshot");
    expect(snapshotState.feedbackContext).toEqual({
      id: "run-snapshot",
      asOf: "2026-03-01",
      fetchedAt: "2026-03-02T00:00:00.000Z",
      missing: true,
    });
    expect(snapshotState.outcomesMeta).toEqual({
      missing: true,
      staleDays: 12,
    });
  });
});
