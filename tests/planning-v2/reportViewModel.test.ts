import { describe, expect, it } from "vitest";
import {
  buildReportVM,
  buildReportVMFromRun,
} from "../../src/app/planning/reports/_lib/reportViewModel";
import { buildResultDtoV1FromRunRecord } from "../../src/lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function sampleRunWithWarnings(warnings: unknown[]): PlanningRunRecord {
  const run: PlanningRunRecord = {
    version: 1,
    id: "run-1",
    profileId: "profile-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    input: {
      horizonMonths: 36,
      assumptionsOverride: {
        inflationPct: 2.1,
        investReturnPct: 5.2,
        cashReturnPct: 2.0,
        withdrawalRatePct: 4.0,
      },
      monteCarlo: { paths: 500, seed: 1234 },
    },
    meta: {
      snapshot: {
        id: "snap-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      health: {
        warningsCodes: ["NEGATIVE_CASHFLOW"],
        criticalCount: 1,
      },
    },
    reproducibility: {
      appVersion: "0.1.0",
      engineVersion: "planning-v2",
      profileHash: "a".repeat(64),
      assumptionsHash: "b".repeat(64),
      effectiveAssumptionsHash: "c".repeat(64),
      policy: {
        dsr: { cautionPct: 40, riskPct: 60 },
        emergencyFundMonths: { caution: 3, risk: 1 },
        monthlySurplusKrw: { cautionMax: 200000, riskMax: 0 },
        monteCarlo: { cautionDepletionPct: 10, riskDepletionPct: 30 },
        snapshot: { staleCautionDays: 45, staleRiskDays: 120 },
        warnings: { cautionCount: 3 },
      },
      appliedOverrides: [
        {
          key: "inflationPct",
          value: 2.6,
          reason: "ops override",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
    outputs: {
      engineSchemaVersion: 1,
      engine: {
        stage: "DEBT",
        financialStatus: {
          stage: "DEBT",
          trace: {
            savingCapacity: 4_170_000,
            savingRate: 0.59,
            liquidAssets: 4_500_000,
            debtBalance: 90_000_000,
            emergencyFundTarget: 16_800_000,
            emergencyFundGap: 12_300_000,
            triggeredRules: [],
          },
        },
        stageDecision: {
          priority: "PAY_DEBT",
          investmentAllowed: false,
          warnings: [],
        },
      },
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/test/report-view-model/run-1/simulate.json",
        },
        summary: {
          endNetWorthKrw: 10_000_000,
          worstCashKrw: -200_000,
          worstCashMonthIndex: 5,
          goalsAchievedCount: 1,
          goalsMissedCount: 1,
        },
        warnings: warnings as unknown as string[],
        goalsStatus: [
          {
            name: "비상금",
            targetAmount: 3_000_000,
            currentAmount: 2_000_000,
            shortfall: 1_000_000,
            targetMonth: 12,
            achieved: false,
            onTrack: true,
          },
          {
            name: "목돈",
            targetAmount: 5_000_000,
            currentAmount: 5_000_000,
            shortfall: 0,
            targetMonth: 24,
            achieved: true,
            achievedMonth: 20,
          },
        ],
        keyTimelinePoints: [
          { monthIndex: 0, row: { income: 100, expenses: 60, debtPayment: 20, operatingCashflow: 40, liquidAssets: 1_000, netWorth: 2_000, totalDebt: 500 } },
          { monthIndex: 6, row: { income: 105, expenses: 64, debtPayment: 18, operatingCashflow: 41, liquidAssets: 1_050, netWorth: 2_100, totalDebt: 460 } },
          { monthIndex: 12, row: { income: 110, expenses: 66, debtPayment: 17, operatingCashflow: 44, liquidAssets: 1_120, netWorth: 2_250, totalDebt: 420 } },
        ],
      },
      actions: {
        ref: {
          name: "actions",
          path: ".data/test/report-view-model/run-1/actions.json",
        },
        actions: [
          {
            code: "FIX_NEGATIVE_CASHFLOW",
            severity: "critical",
            title: "현금흐름 우선 개선",
            summary: "지출 구조와 상환액을 우선 조정하세요.",
            why: [{ code: "NEGATIVE_CASHFLOW", message: "현금 부족" }],
            metrics: { worstCashKrw: -200000 },
            steps: ["고정비 점검", "자동이체 조정", "비상자금 우선 확보"],
            candidates: [
              {
                kind: "deposit",
                finPrdtCd: "prod-1",
                company: "A",
                name: "상품후보",
              },
            ],
            cautions: ["단기 해지 수수료 확인"],
          },
        ],
      },
      monteCarlo: {
        ref: {
          name: "monteCarlo",
          path: ".data/test/report-view-model/run-1/monte-carlo.json",
        },
        probabilities: {
          retirementDepletionBeforeEnd: 0.24,
        },
        percentiles: {
          endNetWorthKrw: { p10: 1_000_000, p50: 5_000_000, p90: 9_000_000 },
        },
        notes: ["경로 수가 적으면 변동성이 커질 수 있습니다."],
      },
      debtStrategy: {
        ref: {
          name: "debtStrategy",
          path: ".data/test/report-view-model/run-1/debt-strategy.json",
        },
        summary: {
          debtServiceRatio: 0.45,
          totalMonthlyPaymentKrw: 800_000,
          warningsCount: 1,
        },
        warnings: [{ code: "HIGH_DEBT_RATIO", message: "DSR이 높습니다." }],
        summaries: [
          {
            liabilityId: "loan-1",
            name: "주택담보대출",
            type: "amortizing",
            principalKrw: 90_000_000,
            aprPct: 4.3,
            remainingMonths: 180,
            monthlyPaymentKrw: 700_000,
            monthlyInterestKrw: 320_000,
            totalInterestRemainingKrw: 18_000_000,
            payoffMonthIndex: 170,
          },
        ],
        whatIf: {
          termExtensions: [],
          termReductions: [],
          extraPayments: [],
        },
      },
    },
  };
  run.outputs.resultDto = buildResultDtoV1FromRunRecord(run);
  return run;
}

describe("buildReportVM", () => {
  it("collapses repeated monthly warnings and groups by code+subjectKey", () => {
    const vm = buildReportVM(sampleRunWithWarnings([
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족",
        month: 1,
        meta: { subjectKey: "cashflow" },
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족(중복)",
        month: 1,
        meta: { subjectKey: "cashflow" },
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족",
        month: 2,
        meta: { subjectKey: "cashflow" },
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족(다른 대상)",
        month: 2,
        meta: { subjectKey: "cashflow-alt" },
      },
    ]));

    const cashflowWarning = vm.warningAgg.find((row) => row.code === "NEGATIVE_CASHFLOW" && row.subjectKey === "cashflow");
    expect(cashflowWarning).toBeDefined();
    expect(cashflowWarning?.count).toBe(2);
    expect(cashflowWarning?.periodMinMax).toBe("M1~M2");

    const altWarning = vm.warningAgg.find((row) => row.code === "NEGATIVE_CASHFLOW" && row.subjectKey === "cashflow-alt");
    expect(altWarning).toBeDefined();
    expect(altWarning?.count).toBe(1);

    expect(vm.summaryCards.endNetWorthKrw).toBe(10_000_000);
    expect(vm.summaryCards.dsrPct).toBe(45);
    expect(vm.summaryCards.totalWarnings).toBe(5);
    expect(vm.topActions).toHaveLength(1);
    expect(vm.assumptionsLines).toContain("기간: 36개월");
    expect(vm.assumptionsLines).toContain("투자수익률 가정: 5.2%");
    expect(vm.assumptionsLines).toContain("현금수익률 가정: 2.0%");
    expect(vm.assumptionsLines).toContain("인출률 가정: 4.0%");
    expect(vm.actionRows[0]?.title).toBe("현금흐름 우선 개선");
    expect(vm.guide.warnings[0]?.code).toBe("NEGATIVE_CASHFLOW");
    expect(vm.guide.goals[0]?.name).toBe("비상금");
    expect(vm.guide.timelineSummaryRows).toHaveLength(3);
    expect(vm.guide.badge.status).toBe("risk");
    expect(vm.monteProbabilityRows[0]?.label).toBe("은퇴 자산 고갈 확률");
    expect(vm.montePercentileRows[0]?.metric).toBe("endNetWorthKrw");
    expect(vm.debtSummaryRows[0]?.name).toBe("주택담보대출");
    expect(vm.debtSummary?.warnings[0]?.code).toBe("HIGH_DEBT_RATIO");
    expect(vm.debtSummary?.meta.totalMonthlyPaymentKrw).toBe(800_000);
    expect(vm.topActions[0]?.candidates).toBeUndefined();
    expect(vm.reproducibility?.appliedOverrides).toHaveLength(1);
    expect(vm.reproducibility?.appliedOverrides[0]?.key).toBe("inflationPct");
    expect(vm.evidence?.summary.monthlySurplusKrw?.formula).toContain("monthlySurplusKrw");
    expect(vm.evidence?.summary.dsrPct?.formula).toContain("dsrPct");
    expect(vm.evidence?.summary.emergencyFundMonths?.formula).toContain("emergencyFundMonths");
    expect(vm.evidence?.items.map((item) => item.id)).toEqual(["monthlySurplus", "dsrPct", "emergency"]);
    expect(vm.monthlyOperatingGuide?.currentSplit.map((item) => item.title)).toEqual(["생활비/고정운영", "대출 상환", "남는 돈"]);
    expect(vm.monthlyOperatingGuide?.nextPlanTitle).toBe("남는 돈 운영안");

    const evidenceJson = JSON.stringify(vm.evidence ?? {});
    expect(evidenceJson).not.toContain("outputs");
    expect(evidenceJson).not.toContain("raw");
    expect(evidenceJson).not.toContain("runJson");
    expect(evidenceJson).not.toContain("process.env");
    expect(evidenceJson).not.toContain(".data/");
    expect(evidenceJson).not.toContain("Bearer ");
    expect(evidenceJson).not.toContain("GITHUB_TOKEN");
    expect(evidenceJson).not.toContain("ECOS_API_KEY");
  });

  it("renders unknown warning code fallback title without breaking", () => {
    const vm = buildReportVM(sampleRunWithWarnings([
      {
        reasonCode: "NO_SUCH_WARNING",
        severity: "warn",
        message: "unknown warning message",
        month: 1,
      },
    ]));

    const unknown = vm.warningAgg.find((row) => row.code === "NO_SUCH_WARNING");
    expect(unknown).toBeDefined();
    expect(unknown?.title).toBe("알 수 없는 경고(NO_SUCH_WARNING)");
    expect(unknown?.plainDescription.length ?? 0).toBeGreaterThan(0);
  });

  it("builds report VM from run through report contract path", () => {
    const vm = buildReportVMFromRun(sampleRunWithWarnings([
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족",
        month: 1,
        meta: { subjectKey: "cashflow" },
      },
    ]), {
      id: "report-1",
      runId: "run-1",
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    expect(vm.header.reportId).toBe("report-1");
    expect(vm.header.runId).toBe("run-1");
    expect(vm.contract?.engineSchemaVersion).toBe(1);
    expect(vm.contract?.fallbacks).toEqual([]);
    expect(vm.summaryCards.endNetWorthKrw).toBe(10_000_000);
    expect(vm.warningAgg.some((row) => row.code === "NEGATIVE_CASHFLOW")).toBe(true);
  });

  it("falls back to engine trace when start timeline cashflow is zero", () => {
    const run = sampleRunWithWarnings([]);
    run.outputs.engine = {
      ...(run.outputs.engine ?? {}),
      financialStatus: {
        ...(run.outputs.engine?.financialStatus ?? {}),
        trace: {
          ...(run.outputs.engine?.financialStatus?.trace ?? {}),
          savingCapacity: 4_170_000,
          emergencyFundTarget: 16_800_000,
        },
      },
    } as PlanningRunRecord["outputs"]["engine"];
    run.outputs.simulate = {
      ...run.outputs.simulate,
      ref: run.outputs.simulate?.ref ?? {
        name: "simulate",
        path: ".data/test/report-view-model/run-1/simulate.json",
      },
      keyTimelinePoints: [
        { monthIndex: 0, row: { income: 0, expenses: 0, debtPayment: 800_000, operatingCashflow: 0, liquidAssets: 1_000, netWorth: 2_000, totalDebt: 500 } },
        { monthIndex: 6, row: { income: 0, expenses: 0, debtPayment: 800_000, operatingCashflow: 0, liquidAssets: 1_050, netWorth: 2_100, totalDebt: 460 } },
        { monthIndex: 12, row: { income: 0, expenses: 0, debtPayment: 800_000, operatingCashflow: 0, liquidAssets: 1_120, netWorth: 2_250, totalDebt: 420 } },
      ],
    } as PlanningRunRecord["outputs"]["simulate"];
    run.outputs.debtStrategy = {
      ...run.outputs.debtStrategy,
      ref: run.outputs.debtStrategy?.ref ?? {
        name: "debtStrategy",
        path: ".data/test/report-view-model/run-1/debt-strategy.json",
      },
      summary: {
        ...run.outputs.debtStrategy?.summary,
        totalMonthlyPaymentKrw: 0,
      },
    } as PlanningRunRecord["outputs"]["debtStrategy"];
    run.outputs.resultDto = buildResultDtoV1FromRunRecord(run);

    const vm = buildReportVMFromRun(run, {
      id: "report-fallback",
      runId: run.id,
      createdAt: run.createdAt,
    });

    expect(vm.summaryCards.monthlySurplusKrw).toBe(3_370_000);
    expect(vm.summaryCards.totalMonthlyDebtPaymentKrw).toBe(800_000);
    expect(vm.evidence?.summary.monthlySurplusKrw?.inputs.monthlyIncomeKrw).toBe(6_970_000);
    expect(vm.evidence?.summary.monthlySurplusKrw?.inputs.monthlyExpensesKrw).toBe(2_800_000);
  });
});
