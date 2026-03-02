import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../../src/lib/planning/v2/report/htmlReport";
import { type ResultDtoV1 } from "../../../src/lib/planning/v2/resultDto";

function dtoFixture(): ResultDtoV1 {
  return {
    version: 1,
    meta: {
      generatedAt: "2026-03-01T00:00:00.000Z",
      snapshot: {
        id: "2026-02_2026-03-01-10-00-00",
        asOf: "2026-02",
        fetchedAt: "2026-03-01T10:00:00.000Z",
      },
      health: {
        warningsCodes: ["SNAPSHOT_STALE"],
        criticalCount: 1,
        snapshotStaleDays: 50,
      },
      policyId: "balanced",
    },
    summary: {
      endNetWorthKrw: 200_000_000,
      worstCashKrw: -500_000,
      worstCashMonthIndex: 8,
      goalsAchieved: { achieved: 1, total: 2 },
      dsrPct: 42.3,
      criticalWarnings: 1,
      totalWarnings: 3,
    },
    warnings: {
      aggregated: [
        {
          code: "NEGATIVE_CASHFLOW",
          severity: "critical",
          count: 2,
          firstMonth: 8,
          lastMonth: 10,
          sampleMessage: "현금이 부족합니다.",
        },
      ],
      top: [{ code: "NEGATIVE_CASHFLOW", severity: "critical", message: "현금 부족" }],
    },
    goals: [
      {
        id: "goal-1",
        title: "비상금",
        type: "emergencyFund",
        targetKrw: 10_000_000,
        currentKrw: 7_000_000,
        shortfallKrw: 3_000_000,
        targetMonth: 12,
        achieved: false,
        comment: "부족액 존재",
      },
    ],
    timeline: {
      points: [
        { label: "start", monthIndex: 0, cashKrw: 2_000_000, netWorthKrw: 100_000_000 },
        { label: "mid", monthIndex: 60, cashKrw: 800_000, netWorthKrw: 150_000_000 },
        { label: "end", monthIndex: 120, cashKrw: 500_000, netWorthKrw: 200_000_000 },
      ],
    },
    actions: {
      items: [
        {
          code: "FIX_NEGATIVE_CASHFLOW",
          severity: "warn",
          title: "지출 조정",
          summary: "고정비 절감",
          why: [{ code: "NEGATIVE_CASHFLOW", message: "현금 부족 신호" }],
          metrics: { cashGapKrw: 500_000 },
          steps: ["통신비 재협상"],
          cautions: [],
        },
      ],
      top: [
        {
          code: "FIX_NEGATIVE_CASHFLOW",
          severity: "warn",
          title: "지출 조정",
          summary: "고정비 절감",
          why: [{ code: "NEGATIVE_CASHFLOW", message: "현금 부족 신호" }],
          metrics: { cashGapKrw: 500_000 },
          steps: ["통신비 재협상"],
          cautions: [],
        },
      ],
      top3: [
        {
          code: "FIX_NEGATIVE_CASHFLOW",
          severity: "warn",
          title: "지출 조정",
          summary: "고정비 절감",
          why: [{ code: "NEGATIVE_CASHFLOW", message: "현금 부족 신호" }],
          metrics: { cashGapKrw: 500_000 },
          steps: ["통신비 재협상"],
          cautions: [],
        },
      ],
    },
    raw: {
      simulate: {
        assumptionsUsed: {
          inflationPct: 2.0,
          expectedReturnPct: 4.8,
          cashReturnPct: 2.1,
          withdrawalRatePct: 4.0,
        },
      },
    },
  };
}

describe("renderHtmlReport", () => {
  it("includes fixed sections and excludes JSON fenced blocks", () => {
    const html = renderHtmlReport(dtoFixture(), { title: "테스트 리포트" });

    expect(html).toContain("기준정보(스냅샷/가정)");
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Key Findings Top3");
    expect(html).toContain("Warnings Summary");
    expect(html).toContain("Goals Table");
    expect(html).toContain("Action Plan Top3");
    expect(html).toContain("해석 문장");
    expect(html).toContain("경고 항목");
    expect(html).not.toContain("<th>Code</th>");
    expect(html).not.toContain("```");
    expect(html).toContain("가정 기반 계산 결과이며 수익/성과를 보장하지 않고 투자 권유가 아닙니다");
  });
});
