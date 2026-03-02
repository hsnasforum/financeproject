import { describe, expect, it } from "vitest";
import { buildInterpretationVM } from "../../../../src/lib/planning/v2/insights/interpretationVm";

describe("buildInterpretationVM", () => {
  it("classifies representative verdicts", () => {
    const risk = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: -120_000,
        emergencyFundMonths: 0.8,
        dsrPct: 62,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(risk.verdict.code).toBe("RISK");

    const caution = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 80_000,
        emergencyFundMonths: 2.2,
        dsrPct: 45,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(caution.verdict.code).toBe("CAUTION");

    const good = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 550_000,
        emergencyFundMonths: 5.1,
        dsrPct: 21,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(good.verdict.code).toBe("GOOD");

    const unknown = buildInterpretationVM({
      summary: {},
      aggregatedWarnings: [],
      goals: [],
    });
    expect(unknown.verdict.code).toBe("UNKNOWN");
  });

  it("keeps unknown warning code render-safe", () => {
    const vm = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 200_000,
      },
      aggregatedWarnings: [
        {
          code: "NO_SUCH_WARNING",
          severity: "warn",
          count: 2,
          firstMonth: 0,
          lastMonth: 1,
        },
      ],
      goals: [],
    });

    expect(vm.warnings).toHaveLength(1);
    expect(vm.warnings[0]?.title).toBe("알 수 없는 경고(NO_SUCH_WARNING)");
    expect((vm.warnings[0]?.plainDescription.length ?? 0) > 0).toBe(true);
  });

  it("includes /ops/assumptions next action when snapshot is stale", () => {
    const vm = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 240_000,
      },
      aggregatedWarnings: [],
      goals: [],
      outcomes: {
        snapshotMeta: {
          staleDays: 80,
        },
      },
    });

    const assumptionsAction = vm.nextActions.find((action) => action.href === "/ops/assumptions");
    expect(assumptionsAction).toBeTruthy();
  });

  it("adds candidate comparison action when DSR is high", () => {
    const vm = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 350_000,
        emergencyFundMonths: 2.2,
        dsrPct: 44,
      },
      aggregatedWarnings: [],
      goals: [],
    });

    const compareAction = vm.nextActions.find((action) => action.id === "OPEN_CANDIDATE_COMPARISON");
    expect(compareAction).toBeTruthy();
    expect(compareAction?.href).toBe("/planning/reports#candidate-comparison-section");
  });

  it("includes diagnostic evidence detail when summary evidence is provided", () => {
    const vm = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 120_000,
      },
      summaryEvidence: {
        monthlySurplusKrw: {
          metric: "monthlySurplusKrw",
          formula: "monthlySurplusKrw = monthlyIncomeKrw - monthlyExpensesKrw - monthlyDebtPaymentKrw",
          inputs: {
            monthlyIncomeKrw: 3_200_000,
            monthlyExpensesKrw: 2_500_000,
            monthlyDebtPaymentKrw: 580_000,
          },
          assumptions: ["month=start 기준"],
        },
      },
      aggregatedWarnings: [],
      goals: [],
    });

    const monthlyDiag = vm.diagnostics.find((diag) => diag.id === "monthly-surplus");
    expect(monthlyDiag?.evidenceDetail?.formula).toContain("monthlySurplusKrw");
    expect(monthlyDiag?.evidenceDetail?.inputs.monthlyIncomeKrw).toBe(3_200_000);
    expect(monthlyDiag?.evidenceItem?.id).toBe("monthlySurplus-diag");
    expect(monthlyDiag?.evidenceItem?.inputs.some((entry) => entry.value.includes("원"))).toBe(true);
  });
});
