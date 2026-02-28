import { describe, expect, it } from "vitest";
import { toMarkdownReport } from "../../src/lib/planning/v2/report";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function sampleProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 3_800_000,
    monthlyEssentialExpenses: 1_400_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_100_000,
    investmentAssets: 2_200_000,
    debts: [],
    goals: [
      {
        id: "goal-a",
        name: "Goal A",
        targetAmount: 4_000_000,
        targetMonth: 24,
        priority: 4,
      },
    ],
  };
}

describe("toMarkdownReport", () => {
  it("renders required sections with qa output", () => {
    const plan = simulateMonthly(sampleProfile(), { inflation: 0.02, expectedReturn: 0.05 }, 36);
    const markdown = toMarkdownReport({
      title: "Planning Report Test",
      generatedAt: "2026-02-28T00:00:00.000Z",
      snapshot: {
        id: "snap-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      assumptionsLabel: "defaults + snapshot",
      plan,
      scenarios: {
        conservative: { endNetWorthDeltaKrw: -1200000 },
      },
      monteCarlo: {
        probabilities: {
          retirementDepletionBeforeEnd: 0.21,
        },
      },
      actions: {
        actions: [{ code: "SET_ASSUMPTIONS_REVIEW", title: "가정 점검" }],
      },
    });

    expect(markdown).toContain("# Planning Report Test");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Warnings");
    expect(markdown).toContain("## Goals");
    expect(markdown).toContain("## Decision Traces");
    expect(markdown).toContain("## Q&A");
    expect(markdown).toContain("왜 목표가 미달인가?");
    expect(markdown).toContain("Snapshot ID: snap-1");
  });
});
