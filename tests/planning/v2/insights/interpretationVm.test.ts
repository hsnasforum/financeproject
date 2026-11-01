import { describe, expect, it } from "vitest";
import { buildInterpretationVM } from "../../../../src/lib/planning/v2/insights/interpretationVm";
import { buildResultDtoV1 } from "../../../../src/lib/planning/v2/resultDto";
import { buildResultSummaryMetrics } from "../../../../src/lib/planning/v2/resultSummary";

describe("buildInterpretationVM", () => {
  it("classifies representative verdicts", () => {
    const risk = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: -100_000,
        emergencyFundMonths: 0.5,
        dsrPct: 20,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(risk.verdict.code).toBe("RISK");

    const caution = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 120_000,
        emergencyFundMonths: 2,
        dsrPct: 45,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(caution.verdict.code).toBe("CAUTION");

    const good = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 300_000,
        emergencyFundMonths: 6,
        dsrPct: 20,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(good.verdict.code).toBe("GOOD");

    // Four months met the previous 3-month caution line but is below the 6-month emergency fund standard.
    const belowEmergencyStandard = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 300_000,
        emergencyFundMonths: 4,
        dsrPct: 20,
      },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(belowEmergencyStandard.verdict.code).toBe("CAUTION");

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
    expect(compareAction?.href).toBe("#candidates");
  });

  it("adds action center link when runId exists", () => {
    const vm = buildInterpretationVM({
      summary: {
        monthlySurplusKrw: 220_000,
        emergencyFundMonths: 2.4,
        dsrPct: 28,
      },
      aggregatedWarnings: [],
      goals: [],
      outcomes: {
        runId: "run-123",
      },
    });

    const actionCenter = vm.nextActions.find((action) => action.id === "MANAGE_ACTION_CENTER");
    expect(actionCenter?.href).toBe("/planning/runs?runId=run-123#action-center");
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
    expect(monthlyDiag?.evidenceItem?.inputs.some((entry) => typeof entry.value === "string" && entry.value.includes("원"))).toBe(true);
  });

  it("reads monthly surplus from recurring operating cashflow, not a start-month extra repayment", () => {
    const keyTimelinePoints = [
      { monthIndex: 0, row: { income: 4_100_000, expenses: 2_700_000, debtPayment: 21_400_000, operatingCashflow: 778_170, liquidAssets: 0, netWorth: -8_698_264.85, totalDebt: 38_820_488.56 } },
      { monthIndex: 12, row: { income: 4_100_000, expenses: 2_754_000, debtPayment: 1_346_000, operatingCashflow: 0, liquidAssets: 0, netWorth: 7_849_982.99, totalDebt: 23_778_351.91 } },
    ];
    const dto = buildResultDtoV1({ simulate: { keyTimelinePoints } });
    const metrics = buildResultSummaryMetrics(dto, { debtMonthlyPaymentKrw: 621_830 });

    expect(metrics.monthlySurplusKrw).toBe(778_170);
    expect(metrics.evidence.monthlySurplusKrw?.inputs).toEqual({
      monthlyIncomeKrw: 4_100_000,
      monthlyExpensesKrw: 2_700_000,
      monthlyDebtPaymentKrw: 621_830,
    });
    expect(metrics.dsrPct).toBeCloseTo(15.17, 2);

    const vm = buildInterpretationVM({
      summary: { monthlySurplusKrw: metrics.monthlySurplusKrw, dsrPct: metrics.dsrPct },
      summaryEvidence: metrics.evidence,
      aggregatedWarnings: [],
      goals: [],
    });
    const monthlyDiag = vm.diagnostics.find((diag) => diag.id === "monthly-surplus");
    expect(monthlyDiag?.severity).not.toBe("risk");
    expect(monthlyDiag?.evidence).toContain("778,170");
    expect(monthlyDiag?.evidence).not.toContain("20,000,000");
    expect(monthlyDiag?.description).not.toContain("매달 돈이 부족");
  });

  it("omits the monthly surplus diagnostic for legacy runs without operating cashflow", () => {
    const dto = buildResultDtoV1({
      simulate: {
        keyTimelinePoints: [{ monthIndex: 0, row: { income: 4_100_000, expenses: 2_700_000, debtPayment: 21_400_000, liquidAssets: 0, netWorth: 0, totalDebt: 0 } }],
      },
    });
    const metrics = buildResultSummaryMetrics(dto, {
      debtMonthlyPaymentKrw: 621_830,
      fallbackStart: { monthlyIncomeKrw: 4_100_000, monthlyExpensesKrw: 2_700_000, monthlyDebtPaymentKrw: 621_830 },
    });

    expect(metrics.monthlySurplusKrw).toBeUndefined();
    expect(metrics.evidence.monthlySurplusKrw).toBeUndefined();
    expect(metrics.dsrPct).toBeCloseTo(15.17, 2);

    const vm = buildInterpretationVM({
      summary: { monthlySurplusKrw: metrics.monthlySurplusKrw, dsrPct: metrics.dsrPct },
      aggregatedWarnings: [],
      goals: [],
    });
    expect(vm.diagnostics.find((diag) => diag.id === "monthly-surplus")).toBeUndefined();
  });

  it("does not estimate monthly surplus from fallbackStart when start income is zero and the field is absent", () => {
    const dto = buildResultDtoV1({
      simulate: {
        keyTimelinePoints: [{ monthIndex: 0, row: { income: 0, expenses: 0, debtPayment: 800_000, liquidAssets: 0, netWorth: 0, totalDebt: 0 } }],
      },
    });
    const metrics = buildResultSummaryMetrics(dto, {
      fallbackStart: { monthlyIncomeKrw: 6_970_000, monthlyExpensesKrw: 2_800_000, monthlyDebtPaymentKrw: 800_000 },
    });

    expect(metrics.monthlySurplusKrw).toBeUndefined();
    expect(metrics.evidence.monthlySurplusKrw).toBeUndefined();
    // Other metrics keep their existing fallback.
    expect(metrics.evidence.dsrPct?.inputs.monthlyIncomeKrw).toBe(6_970_000);
  });

  it("keeps a finite zero operating cashflow from the engine", () => {
    const dto = buildResultDtoV1({
      simulate: {
        keyTimelinePoints: [{ monthIndex: 0, row: { income: 0, expenses: 0, debtPayment: 800_000, operatingCashflow: 0, liquidAssets: 0, netWorth: 0, totalDebt: 0 } }],
      },
    });
    const metrics = buildResultSummaryMetrics(dto, {
      fallbackStart: { monthlyIncomeKrw: 6_970_000, monthlyExpensesKrw: 2_800_000, monthlyDebtPaymentKrw: 800_000 },
    });

    expect(metrics.monthlySurplusKrw).toBe(0);
    expect(metrics.evidence.monthlySurplusKrw?.inputs).toEqual({
      monthlyIncomeKrw: 0,
      monthlyExpensesKrw: 0,
      monthlyDebtPaymentKrw: 0,
    });
  });
});
