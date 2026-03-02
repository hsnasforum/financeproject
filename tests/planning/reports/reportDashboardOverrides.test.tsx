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
        actions: [],
      },
    },
  };
}

describe("ReportDashboard overrides disclosure", () => {
  it("renders overrides panel and items when reproducibility overrides exist", () => {
    const vm = buildReportVM(fixtureRun());
    const html = renderToStaticMarkup(<ReportDashboard vm={vm} />);

    expect(html).toContain('data-testid="assumptions-overrides-panel"');
    expect(html).toContain('data-testid="assumptions-overrides-item"');
    expect(html).toContain("inflationPct");
    expect(html).toContain("2.7");
  });
});
