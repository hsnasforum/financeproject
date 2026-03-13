import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReportDashboard from "../../../src/app/planning/reports/_components/ReportDashboard";
import { buildReportVM } from "../../../src/app/planning/reports/_lib/reportViewModel";
import { type PlanningRunRecord } from "../../../src/lib/planning/store/types";

function fixtureRun(): PlanningRunRecord {
  return {
    version: 1,
    id: "run-override-1",
    profileId: "profile-1",
    createdAt: "2026-03-02T00:00:00.000Z",
    input: {
      horizonMonths: 24,
    },
    meta: {
      snapshot: {
        id: "snap-1",
        asOf: "2026-03-01",
        fetchedAt: "2026-03-01T00:00:00.000Z",
        missing: false,
      },
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    reproducibility: {
      appVersion: "1.0.0",
      engineVersion: "planning-v2",
      profileHash: "a".repeat(64),
      assumptionsHash: "b".repeat(64),
      effectiveAssumptionsHash: "c".repeat(64),
      policy: {
        dsr: { cautionPct: 30, riskPct: 50 },
        emergencyFundMonths: { caution: 3, risk: 1 },
        monthlySurplusKrw: { cautionMax: 200000, riskMax: 0 },
        monteCarlo: { cautionDepletionPct: 10, riskDepletionPct: 30 },
        snapshot: { staleCautionDays: 45, staleRiskDays: 120 },
        warnings: { cautionCount: 3 },
      },
      appliedOverrides: [
        {
          key: "inflationPct",
          value: 2.7,
          reason: "ops override",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
    outputs: {
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/test/report-dashboard/run-override-1/simulate.json",
        },
        summary: {
          endNetWorthKrw: 8_000_000,
          worstCashKrw: 500_000,
          worstCashMonthIndex: 8,
          goalsAchievedCount: 0,
          goalsMissedCount: 0,
        },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [],
      },
      actions: {
        ref: {
          name: "actions",
          path: ".data/test/report-dashboard/run-override-1/actions.json",
        },
        actions: [],
      },
    },
  };
}

describe("ReportDashboard overrides disclosure", () => {
  it("renders overrides panel and items when reproducibility overrides exist", () => {
    const vm = buildReportVM(fixtureRun());
    const html = renderToStaticMarkup(<ReportDashboard vm={vm} />);

    expect(html).toContain("Action First");
    expect(html).toContain("계산 기준과 가정");
    expect(html).toContain('data-testid="assumptions-overrides-panel"');
    expect(html).toContain('data-testid="assumptions-overrides-item"');
    expect(html).toContain("inflationPct");
    expect(html).toContain("2.7");
  });

  it("renders monthly operating guide when the VM provides it", () => {
    const vm = {
      ...buildReportVM(fixtureRun()),
      monthlyOperatingGuide: {
        headline: "남는 돈은 비상금부터 채우는 운영이 더 안전합니다.",
        basisLabel: "현재 매달 남는 돈 900,000원을 기준으로 한 운영안입니다.",
        currentSplit: [
          {
            title: "생활비/고정운영",
            amountKrw: 2_000_000,
            sharePct: 40,
            tone: "slate" as const,
            description: "매달 기본적으로 나가는 생활비와 운영비입니다.",
          },
        ],
        nextPlanTitle: "남는 돈 운영안",
        nextPlan: [
          {
            title: "비상금/안전자금",
            amountKrw: 540_000,
            sharePct: 60,
            tone: "emerald" as const,
            description: "예상 밖 지출이나 소득 변동을 버티기 위한 우선 재원입니다.",
          },
        ],
      },
    };
    const html = renderToStaticMarkup(<ReportDashboard vm={vm} />);

    expect(html).toContain('data-testid="report-monthly-operating-guide"');
    expect(html).toContain("월급 운영 가이드");
    expect(html).toContain("남는 돈 운영안");
  });

  it("keeps core metric evidence panel closed by default", () => {
    const baseVm = buildReportVM(fixtureRun());
    const vm = {
      ...baseVm,
      evidence: {
        summary: {},
        items: [
          {
            id: "monthlySurplus",
            title: "월 잉여현금",
            formula: "income - expense - debtPayment",
            inputs: [
              { label: "월 실수령", value: 3_500_000, unitKind: "krw" as const },
              { label: "월 총지출(필수+선택)", value: 2_600_000, unitKind: "krw" as const },
              { label: "월 부채상환", value: 0, unitKind: "krw" as const },
            ],
            assumptions: ["시작 시점 월값 기준입니다."],
            notes: [],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(<ReportDashboard vm={vm} />);

    expect(html).toContain('data-testid="core-metric-evidence-toggle-monthlySurplus"');
    expect(html).not.toContain('data-testid="core-metric-evidence-panel-monthlySurplus"');
  });
});
