import { describe, expect, it } from "vitest";
import {
  applyScenario,
  computeRunDelta,
  validateScenario,
  type ScenarioPatch,
} from "../../../src/lib/planning/v2/scenario";
import { type ProfileV2 } from "../../../src/lib/planning/v2/types";

function profileFixture(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 900_000,
    liquidAssets: 12_000_000,
    investmentAssets: 8_000_000,
    debts: [
      {
        id: "debt-a",
        name: "Loan A",
        balance: 20_000_000,
        minimumPayment: 500_000,
        aprPct: 4.8,
        remainingMonths: 60,
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "비상금",
        targetAmount: 20_000_000,
        currentAmount: 10_000_000,
        targetMonth: 12,
      },
    ],
  };
}

describe("planning scenario utilities", () => {
  it("applyScenario is pure and applies numeric patches correctly", () => {
    const base = profileFixture();
    const before = JSON.parse(JSON.stringify(base)) as ProfileV2;
    const patches: ScenarioPatch[] = [
      { path: "/monthlyDiscretionaryExpenses", op: "multiply", value: 0.8 },
      { path: "/monthlyIncomeNet", op: "add", value: 100_000 },
      { path: "/debts/debt-a/minimumPayment", op: "add", value: 50_000 },
    ];

    const next = applyScenario(base, patches);

    expect(base).toStrictEqual(before);
    expect(next.monthlyDiscretionaryExpenses).toBe(720_000);
    expect(next.monthlyIncomeNet).toBe(4_600_000);
    expect(next.debts[0]?.minimumPayment).toBe(550_000);
  });

  it("validateScenario returns field-path errors for invalid patches", () => {
    const base = profileFixture();
    const issues = validateScenario(base, [
      { path: "/monthlyDiscretionaryExpenses", op: "set", value: -1 },
      { path: "/debts/no-such-debt/minimumPayment", op: "add", value: 100_000 },
    ]);

    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((issue) => issue.path.includes("/patches/0"))).toBe(true);
    expect(issues.some((issue) => issue.path.includes("/patches/1/path"))).toBe(true);
  });

  it("computeRunDelta returns deterministic baseline vs scenario differences", () => {
    const baselineVm = {
      header: { runId: "run-base" },
      summaryCards: {
        monthlySurplusKrw: 500_000,
        dsrPct: 35,
        emergencyFundMonths: 3,
        endNetWorthKrw: 100_000_000,
        worstCashKrw: 1_000_000,
        totalWarnings: 4,
        criticalWarnings: 1,
      },
      warningAgg: [{ code: "A" }, { code: "B" }],
      goalsTable: [{ achieved: true }, { achieved: false }],
    };
    const scenarioVm = {
      header: { runId: "run-scenario" },
      summaryCards: {
        monthlySurplusKrw: 650_000,
        dsrPct: 30,
        emergencyFundMonths: 4,
        endNetWorthKrw: 112_000_000,
        worstCashKrw: 2_500_000,
        totalWarnings: 2,
        criticalWarnings: 0,
      },
      warningAgg: [{ code: "B" }, { code: "C" }],
      goalsTable: [{ achieved: true }, { achieved: true }],
    };

    const delta = computeRunDelta(baselineVm, scenarioVm);

    expect(delta.baselineRunId).toBe("run-base");
    expect(delta.scenarioRunId).toBe("run-scenario");
    expect(delta.metrics.find((metric) => metric.key === "monthlySurplusKrw")?.delta).toBe(150_000);
    expect(delta.metrics.find((metric) => metric.key === "totalWarnings")?.delta).toBe(-2);
    expect(delta.warnings.added).toEqual(["C"]);
    expect(delta.warnings.removed).toEqual(["A"]);
    expect(delta.goals.achievedDelta).toBe(1);
  });
});

