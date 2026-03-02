import { describe, expect, it } from "vitest";
import { buildReportVM } from "../../src/app/planning/reports/_lib/reportViewModel";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function sampleRunWithWarnings(warnings: unknown[]): PlanningRunRecord {
  return {
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
      simulate: {
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
        probabilities: {
          retirementDepletionBeforeEnd: 0.24,
        },
        percentiles: {
          endNetWorthKrw: { p10: 1_000_000, p50: 5_000_000, p90: 9_000_000 },
        },
        notes: ["경로 수가 적으면 변동성이 커질 수 있습니다."],
      },
      debtStrategy: {
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
    expect(vm.topActions).toHaveLength(1);
    expect(vm.topActions[0]?.candidates).toBeUndefined();
    expect(vm.reproducibility?.appliedOverrides).toHaveLength(1);
    expect(vm.reproducibility?.appliedOverrides[0]?.key).toBe("inflationPct");
    expect(vm.evidence?.summary.monthlySurplusKrw?.formula).toContain("monthlySurplusKrw");
    expect(vm.evidence?.summary.dsrPct?.formula).toContain("dsrPct");
    expect(vm.evidence?.summary.emergencyFundMonths?.formula).toContain("emergencyFundMonths");
    expect(vm.evidence?.items.map((item) => item.id)).toEqual(["monthlySurplus", "dsrPct", "emergency"]);

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
});
