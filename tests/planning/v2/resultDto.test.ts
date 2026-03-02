import { describe, expect, it } from "vitest";
import { LIMITS } from "../../../src/lib/planning/v2/limits";
import { buildResultDtoV1, buildResultDtoV1FromRunRecord } from "../../../src/lib/planning/v2/resultDto";

describe("buildResultDtoV1", () => {
  it("calculates summary fields from simulate/debt/goals", () => {
    const dto = buildResultDtoV1({
      generatedAt: "2026-03-01T00:00:00.000Z",
      meta: {
        snapshot: { id: "snap-1", asOf: "2026-02-28", missing: false },
        health: { criticalCount: 1, warningsCodes: ["NEGATIVE_CASHFLOW"] },
      },
      simulate: {
        timeline: [
          { month: 1, liquidAssets: 2_000_000, netWorth: 10_000_000, debtServiceRatio: 0.32 },
          { month: 2, liquidAssets: -300_000, netWorth: 9_800_000, debtServiceRatio: 0.58 },
          { month: 3, liquidAssets: 500_000, netWorth: 11_000_000, debtServiceRatio: 0.41 },
        ],
        warnings: [
          { reasonCode: "NEGATIVE_CASHFLOW", message: "현금 부족", month: 2 },
          { reasonCode: "CONTRIBUTION_SKIPPED", message: "적립 스킵", month: 2 },
        ],
        goalStatus: [
          { goalId: "g1", name: "비상금", targetAmount: 3_000_000, currentAmount: 2_500_000, targetMonth: 12, achieved: false, onTrack: true },
          { goalId: "g2", name: "은퇴", targetAmount: 100_000_000, currentAmount: 100_000_000, targetMonth: 240, achieved: true },
        ],
      },
      debt: {
        meta: {
          debtServiceRatio: 0.58,
        },
        warnings: [{ code: "HIGH_DEBT_RATIO", message: "DSR 주의" }],
      },
    });

    expect(dto.version).toBe(1);
    expect(dto.summary.endNetWorthKrw).toBe(11_000_000);
    expect(dto.summary.worstCashKrw).toBe(-300_000);
    expect(dto.summary.worstCashMonthIndex).toBe(1);
    expect(dto.summary.dsrPct).toBe(58);
    expect(dto.summary.goalsAchieved).toEqual({ achieved: 1, total: 2 });
  });

  it("always returns aggregated warnings when warnings exist", () => {
    const dto = buildResultDtoV1({
      simulate: {
        warnings: Array.from({ length: 30 }).map((_, index) => ({
          reasonCode: "CONTRIBUTION_SKIPPED",
          message: "현금 부족으로 적립 건너뜀",
          month: index + 1,
        })),
      },
    });

    expect(dto.warnings.aggregated.length).toBeGreaterThan(0);
    expect(dto.warnings.aggregated[0]).toMatchObject({
      code: "CONTRIBUTION_SKIPPED",
      count: 30,
    });
  });

  it("applies top limits for warnings/actions/goals/timeline defaults", () => {
    const dto = buildResultDtoV1({
      simulate: {
        timeline: Array.from({ length: 120 }).map((_, index) => ({
          month: index + 1,
          liquidAssets: 1_000_000 - (index * 10_000),
          netWorth: 10_000_000 + (index * 100_000),
          totalDebt: Math.max(0, 5_000_000 - (index * 30_000)),
          debtServiceRatio: 0.35,
        })),
        warnings: Array.from({ length: 100 }).map((_, index) => ({
          reasonCode: `WARN_${index + 1}`,
          message: `warning-${index + 1}`,
          month: index + 1,
        })),
        goalStatus: Array.from({ length: 30 }).map((_, index) => ({
          goalId: `goal-${index + 1}`,
          name: `목표-${index + 1}`,
          targetAmount: 10_000_000,
          currentAmount: index * 100_000,
          shortfall: Math.max(0, 10_000_000 - (index * 100_000)),
          targetMonth: index + 1,
          achieved: false,
        })),
      },
      actions: {
        actions: Array.from({ length: 25 }).map((_, index) => ({
          code: `ACT_${index + 1}`,
          severity: index % 2 === 0 ? "warn" : "info",
          title: `액션 ${index + 1}`,
          summary: "요약",
          why: Array.from({ length: 20 }).map((__, whyIndex) => ({ code: `WHY_${whyIndex + 1}`, message: "근거" })),
          steps: Array.from({ length: 20 }).map((__, stepIndex) => `step-${stepIndex + 1}`),
          cautions: Array.from({ length: 20 }).map((__, cautionIndex) => `caution-${cautionIndex + 1}`),
          metrics: { score: index + 1 },
        })),
      },
    });

    expect(dto.warnings.top?.length ?? 0).toBe(LIMITS.warningsTop);
    expect(dto.goals).toHaveLength(LIMITS.goalsTop);
    expect(dto.timeline.points.length).toBeLessThanOrEqual(LIMITS.timelinePoints);
    expect(dto.actions?.items).toHaveLength(LIMITS.actionsTop);
    expect(dto.actions?.top).toHaveLength(LIMITS.actionsTop);
    expect(dto.actions?.top3).toHaveLength(3);
  });

  it("keeps raw dto compact with sampling/truncation", () => {
    const input = {
      simulate: {
        summary: { endNetWorthKrw: 200_000_000 },
        assumptionsUsed: {
          inflationPct: 2.1,
          expectedReturnPct: 5.4,
          cashReturnPct: 2.2,
          withdrawalRatePct: 4.0,
        },
        warnings: Array.from({ length: 200 }).map((_, index) => ({
          reasonCode: `SIM_WARN_${index + 1}`,
          message: `simulate-warning-${index + 1}`,
          month: index + 1,
        })),
        goalStatus: Array.from({ length: 80 }).map((_, index) => ({
          goalId: `goal-${index + 1}`,
          name: `목표-${index + 1}`,
          targetAmount: 10_000_000,
          currentAmount: index * 100_000,
          targetMonth: index + 1,
          achieved: false,
        })),
        timeline: Array.from({ length: 360 }).map((_, index) => ({
          month: index + 1,
          liquidAssets: 1_000_000 - (index * 5_000),
          netWorth: 100_000_000 + (index * 100_000),
          totalDebt: Math.max(0, 50_000_000 - (index * 80_000)),
          debtServiceRatio: 0.4,
        })),
        traces: Array.from({ length: 240 }).map((_, index) => ({
          code: `TRACE_${index + 1}`,
          message: `trace message ${index + 1}`,
        })),
      },
      actions: {
        actions: Array.from({ length: 40 }).map((_, index) => ({
          code: `ACT_${index + 1}`,
          severity: "warn",
          title: `액션 ${index + 1}`,
          summary: "요약",
          why: [{ code: "NEGATIVE_CASHFLOW", message: "근거" }],
          steps: Array.from({ length: 15 }).map((__, stepIndex) => `step-${stepIndex + 1}`),
          cautions: Array.from({ length: 15 }).map((__, cautionIndex) => `caution-${cautionIndex + 1}`),
        })),
      },
      scenarios: {
        table: Array.from({ length: 120 }).map((_, index) => ({
          id: `scenario-${index + 1}`,
          title: `시나리오-${index + 1}`,
          endNetWorthKrw: 100_000_000 - (index * 100_000),
        })),
      },
      debt: {
        summary: {
          debtServiceRatio: 0.45,
          totalMonthlyPaymentKrw: 850_000,
        },
        warnings: Array.from({ length: 60 }).map((_, index) => ({
          code: `DEBT_WARN_${index + 1}`,
          message: `debt-warning-${index + 1}`,
        })),
      },
    };

    const inputRawLength = JSON.stringify(input).length;
    const dto = buildResultDtoV1(input);
    const rawLength = JSON.stringify(dto.raw ?? {}).length;
    const rawSimulate = (dto.raw?.simulate ?? {}) as {
      warnings?: unknown[];
      goalsStatus?: unknown[];
      traces?: unknown[];
      timelineSampled?: unknown[];
    };

    expect(rawLength).toBeLessThan(inputRawLength);
    expect(rawSimulate.warnings?.length ?? 0).toBeLessThanOrEqual(LIMITS.warningsTop);
    expect(rawSimulate.goalsStatus?.length ?? 0).toBeLessThanOrEqual(LIMITS.goalsTop);
    expect(rawSimulate.traces?.length ?? 0).toBeLessThanOrEqual(LIMITS.tracesTop);
    expect(rawSimulate.timelineSampled?.length ?? 0).toBeLessThanOrEqual(LIMITS.tracesTop);
  });
});

describe("buildResultDtoV1FromRunRecord", () => {
  it("builds dto for legacy run without outputs.resultDto", () => {
    const dto = buildResultDtoV1FromRunRecord({
      createdAt: "2026-03-01T00:00:00.000Z",
      input: { policyId: "balanced" },
      meta: {
        snapshot: { id: "snap-legacy", missing: false },
      },
      outputs: {
        simulate: {
          summary: {
            endNetWorthKrw: 12_000_000,
            worstCashKrw: 1_500_000,
            worstCashMonthIndex: 8,
          },
          warnings: ["CONTRIBUTION_SKIPPED"],
          goalsStatus: [],
          keyTimelinePoints: [{ monthIndex: 0, row: { income: 100, expenses: 80, debtPayment: 10, liquidAssets: 1000, netWorth: 2000, totalDebt: 500 } }],
        },
      },
    });

    expect(dto.version).toBe(1);
    expect(dto.summary.endNetWorthKrw).toBe(12_000_000);
    expect(dto.warnings.aggregated[0]?.code).toBe("CONTRIBUTION_SKIPPED");
    expect(dto.timeline.points.length).toBeGreaterThan(0);
  });
});
