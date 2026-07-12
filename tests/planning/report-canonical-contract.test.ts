import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportDashboard from "../../src/app/planning/reports/_components/ReportDashboard";
import {
  buildReportVM,
  buildReportVMFromRun,
  type ReportVM,
} from "../../src/lib/planning/reports/reportViewModel";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1FromRunRecord } from "../../src/lib/planning/v2/resultDto";

function fixtureRun(): PlanningRunRecord {
  const run: PlanningRunRecord = {
    version: 1,
    id: "run-canonical-1",
    profileId: "profile-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 36,
      monteCarlo: { paths: 500, seed: 7 },
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
        dsr: { cautionPct: 40, riskPct: 60 },
        emergencyFundMonths: { caution: 3, risk: 1 },
        monthlySurplusKrw: { cautionMax: 200_000, riskMax: 0 },
        monteCarlo: { cautionDepletionPct: 10, riskDepletionPct: 30 },
        snapshot: { staleCautionDays: 45, staleRiskDays: 120 },
        warnings: { cautionCount: 3 },
      },
      appliedOverrides: [],
    },
    outputs: {
      engineSchemaVersion: 1,
      engine: {
        stage: "EMERGENCY",
        financialStatus: {
          stage: "EMERGENCY",
          trace: {
            savingCapacity: 1_000_000,
            savingRate: 0.25,
            liquidAssets: 1_000_000,
            debtBalance: 0,
            emergencyFundTarget: 9_000_000,
            emergencyFundGap: 8_000_000,
            triggeredRules: ["EMERGENCY_LOW"],
          },
        },
        stageDecision: {
          priority: "BUILD_EMERGENCY_FUND",
          investmentAllowed: false,
          warnings: [],
        },
      },
      simulate: {
        ref: {
          name: "simulate",
          path: ".data/test/report-canonical/run-canonical-1/simulate.json",
        },
        summary: {
          endNetWorthKrw: 15_000_000,
          worstCashKrw: 1_000_000,
          worstCashMonthIndex: 3,
          goalsAchievedCount: 0,
          goalsMissedCount: 1,
        },
        warnings: [],
        goalsStatus: [
          {
            name: "비상금",
            targetAmount: 9_000_000,
            currentAmount: 1_000_000,
            shortfall: 8_000_000,
            targetMonth: 12,
            achieved: false,
          },
        ],
        keyTimelinePoints: [
          { monthIndex: 0, row: { income: 5_000_000, expenses: 3_000_000, debtPayment: 0, operatingCashflow: 2_000_000, liquidAssets: 1_000_000, netWorth: 15_000_000, totalDebt: 0 } },
          { monthIndex: 12, row: { income: 5_000_000, expenses: 3_000_000, debtPayment: 0, operatingCashflow: 2_000_000, liquidAssets: 8_000_000, netWorth: 22_000_000, totalDebt: 0 } },
          { monthIndex: 35, row: { income: 5_000_000, expenses: 3_000_000, debtPayment: 0, operatingCashflow: 2_000_000, liquidAssets: 20_000_000, netWorth: 34_000_000, totalDebt: 0 } },
        ],
      },
      actions: {
        ref: {
          name: "actions",
          path: ".data/test/report-canonical/run-canonical-1/actions.json",
        },
        actions: [
          {
            code: "BUILD_EMERGENCY_FUND",
            title: "비상금 먼저 보강",
            summary: "비상금이 부족합니다.",
            severity: "warn",
            why: [],
            metrics: {},
            steps: ["비상금 계좌를 분리합니다."],
            cautions: [],
          },
        ],
      },
    },
  };
  run.outputs.resultDto = buildResultDtoV1FromRunRecord(run);
  return run;
}

function projectFile(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

describe("planning report canonical contract", () => {
  it("exposes stage, severity, reason codes, and recommended actions without production raw runJson", () => {
    const vm = buildReportVMFromRun(fixtureRun());

    expect(vm.contract?.engineSchemaVersion).toBe(1);
    expect(vm.interpretation).toMatchObject({
      stage: "EMERGENCY",
      severity: "caution",
    });
    expect(vm.interpretation?.reasonCodes).toEqual(expect.arrayContaining(["emergency-fund", "goals"]));
    expect(vm.interpretation?.recommendedActions?.map((action) => action.id)).toContain("BUILD_EMERGENCY_FUND");
    expect((vm.raw as { runJson?: unknown } | undefined)?.runJson).toBeUndefined();
  });

  it("dashboard derives tone and stage from canonical interpretation, not raw run outputs", () => {
    const rawStageOnlyVm = {
      ...buildReportVM(fixtureRun()),
      interpretation: {
        stage: "EMERGENCY",
        severity: "caution",
        verdictCode: "CAUTION",
        label: "주의",
        headline: "몇 가지 보강이 필요합니다.",
        reasonCodes: ["emergency-fund"],
        recommendedActions: [
          {
            id: "BUILD_EMERGENCY_FUND",
            title: "비상금 먼저 보강",
            href: "/recommend?purpose=emergency",
          },
        ],
      },
      raw: {
        reportMarkdown: "debug only",
        runJson: {
          outputs: {
            engine: {
              stage: "DEBT",
            },
          },
        },
      },
    } as unknown as ReportVM;

    const html = renderToStaticMarkup(createElement(ReportDashboard, { vm: rawStageOnlyVm }));

    expect(html).toContain("주의 구간");
    expect(html).toContain("planning.summary.stage=EMERGENCY");
    expect(html).not.toContain("planning.summary.stage=DEBT");
  });

  it("keeps current planning report code off legacy planner imports and raw runJson reads", () => {
    const reportSourceFiles = [
      "src/app/planning/reports/_components/reportDashboard/shared.ts",
      "src/app/planning/reports/_components/ReportDashboard.tsx",
      "src/components/planning/reports/ReportRecommendationsSection.tsx",
      "src/lib/planning/reports/reportViewModel.ts",
    ];

    const combined = reportSourceFiles
      .map((file) => fs.readFileSync(projectFile(file), "utf8"))
      .join("\n");

    expect(combined).not.toContain("@/lib/planner/");
    expect(combined).not.toMatch(/raw\??\.runJson|runJson:\s*run/);
  });
});
