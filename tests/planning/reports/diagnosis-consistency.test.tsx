import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SavedReportBrief from "../../../src/components/planning/reports/SavedReportBrief";
import { ResultGuideCard } from "../../../src/components/planning/ResultGuideSections";
import { buildInterpretationVM } from "../../../src/lib/planning/v2/insights/interpretationVm";
import { buildWorkspaceResultSummaryVm, resolveWorkspaceInterpretationInput } from "../../../src/lib/planning/ui/workspaceResultInsights";
import { toInterpretationInputFromReportVM } from "../../../src/lib/planning/reports/reportInterpretationAdapter";
import { safeBuildReportVMFromRun } from "../../../src/lib/planning/reports/reportViewModel";
import { buildStandaloneReportArtifactsFromRun } from "../../../src/lib/planning/reports/standaloneReportArtifacts";
import { buildPlanningRunArtifacts } from "../../../src/lib/planning/server/v2/runArtifacts";
import { runScenarios } from "../../../src/lib/planning/core/v2/runScenarios";
import { DEFAULT_PLANNING_POLICY } from "../../../src/lib/planning/catalog/planningPolicy";
import type { PlanningRunRecord } from "../../../src/lib/planning/store/types";

function fixture(): PlanningRunRecord {
  const profile = { monthlyIncomeNet: 4_800_000, monthlyEssentialExpenses: 2_300_000, monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0, investmentAssets: 0, debts: [],
    goals: [{ id: "g", name: "검토용 비상금", targetAmount: 10_000_000, currentAmount: 0, targetMonth: 12 }] };
  const scenarios = runScenarios({ profile, horizonMonths: 120,
    baseAssumptions: { inflationPct: 0, investReturnPct: 0, cashReturnPct: 0, withdrawalRatePct: 4 } });
  const a = buildPlanningRunArtifacts({ profile, policyId: "balanced", snapshotMeta: { asOf: "2026-09-01" },
    healthSummary: {}, simulatePlan: scenarios.base, scenariosOutput: null, actionsOutput: [],
    monteCarloOutput: null, debtStrategyOutput: null });
  return { version: 1, id: "trust-run", profileId: "trust-profile", createdAt: "2026-10-11T00:00:00.000Z",
    overallStatus: "SUCCESS", input: { horizonMonths: 120 }, meta: {},
    outputs: { engineSchemaVersion: a.outputs.engineSchemaVersion, engine: a.outputs.engine, resultDto: a.resultDto,
      simulate: { ...a.outputs.simulate, ref: { name: "simulate", path: "fixture/simulate.json" } } } };
}

// Interpretation policy stored by runs created before the 6-month emergency fund standard.
const PREVIOUS_THREE_MONTH_POLICY = { ...DEFAULT_PLANNING_POLICY, emergencyFundMonths: { caution: 3, risk: 1 } };

function withStoredPolicy(run: PlanningRunRecord, policy: typeof DEFAULT_PLANNING_POLICY): PlanningRunRecord {
  run.reproducibility = { appVersion: "test", engineVersion: "test", profileHash: "synthetic", appliedOverrides: [], policy };
  return run;
}

describe("same saved run diagnosis across views and outputs", () => {
  it("explains zero cash risk alongside good basic metrics without modifying the run", () => {
    const run = withStoredPolicy(fixture(), PREVIOUS_THREE_MONTH_POLICY);
    const before = JSON.stringify(run);
    expect(run.outputs.resultDto!.summary.worstCashKrw).toBe(0);
    const workspace = buildWorkspaceResultSummaryVm({ resultDto: run.outputs.resultDto! });
    const vm = safeBuildReportVMFromRun(run).vm!;
    const interpretation = buildInterpretationVM(toInterpretationInputFromReportVM(vm), vm.reproducibility?.policy);
    expect(interpretation.verdict.code).toBe("GOOD");
    const workspaceHtml = renderToStaticMarkup(<ResultGuideCard locale="ko-KR" status={workspace.guideBadge.status}
      reason={workspace.guideBadge.reason} minCashKrw={workspace.summaryWorstCashKrw}
      achievedGoals={workspace.achievedGoalCount} totalGoals={workspace.goalTableRows.length}
      maxDsr={workspace.guideBadge.maxDsr} topActions={[]} assessment={interpretation.assessment} />);
    const brief = renderToStaticMarkup(<SavedReportBrief run={run} vm={vm} />);
    const reopened = renderToStaticMarkup(<SavedReportBrief run={JSON.parse(before)} vm={safeBuildReportVMFromRun(JSON.parse(before)).vm!} />);
    const output = buildStandaloneReportArtifactsFromRun(run, { printView: true }).html;
    for (const html of [workspaceHtml, brief, reopened, output]) {
      expect(html).toContain("위험 신호 있음");
      expect(html).toContain("기본 지표 판정: 양호");
      expect(html).toContain("기간 중 최저 현금");
      expect(html).not.toContain("정기 점검만 이어가면 됩니다");
    }
    expect(JSON.stringify(run)).toBe(before);
  });

  it("applies the 6-month emergency fund standard in every output when the run stores no policy", () => {
    const run = fixture();
    const vm = safeBuildReportVMFromRun(run).vm!;
    const emergencyFundMonths = vm.summaryCards.emergencyFundMonths ?? Number.NaN;
    expect(emergencyFundMonths).toBeGreaterThanOrEqual(3);
    expect(emergencyFundMonths).toBeLessThan(6);
    const interpretation = buildInterpretationVM(toInterpretationInputFromReportVM(vm), vm.reproducibility?.policy);
    expect(interpretation.verdict.code).toBe("CAUTION");
    const brief = renderToStaticMarkup(<SavedReportBrief run={run} vm={vm} />);
    const output = buildStandaloneReportArtifactsFromRun(run, { printView: true }).html;
    for (const html of [brief, output]) {
      expect(html).toContain("위험 신호 있음");
      expect(html).toContain("기본 지표 판정: 주의");
      expect(html).not.toContain("기본 지표 판정: 양호");
    }
  });

  it("does not turn absent cash into zero in the workspace", () => {
    const dto = fixture().outputs.resultDto!;
    delete dto.summary.worstCashKrw;
    const workspace = buildWorkspaceResultSummaryVm({ resultDto: dto });
    expect(workspace.summaryWorstCashKrw).toBeUndefined();
    expect(workspace.keyFindings).toContain("현금흐름: 기간 중 최저 현금을 확인할 수 없습니다.");
  });

  it.each([0, undefined])("uses the saved canonical evidence when start cashflow is %s", (value) => {
    const run = fixture();
    const dto = run.outputs.resultDto!;
    dto.timeline.points[0].incomeKrw = value;
    dto.timeline.points[0].expensesKrw = value;
    const fallback = { summary: { monthlySurplusKrw: 0 }, aggregatedWarnings: [], goals: [], outcomes: {} };
    const expected = toInterpretationInputFromReportVM(safeBuildReportVMFromRun(run).vm!);
    const rawWorkspace = buildWorkspaceResultSummaryVm({ resultDto: dto });
    expect(rawWorkspace.summaryMonthlySurplusKrw).not.toBe(expected.summary.monthlySurplusKrw);
    expect(expected.summary.monthlySurplusKrw).toBe(2_500_000);
    expect(resolveWorkspaceInterpretationInput(run, fallback)).toEqual(expected);
    expect(resolveWorkspaceInterpretationInput(null, fallback)).toBe(fallback);
  });

  it("labels missing DSR as unknown in the workspace metric card", () => {
    const html = renderToStaticMarkup(<ResultGuideCard locale="ko-KR" status="warn" reason="자료 확인"
      minCashKrw={undefined} maxDsr={undefined} achievedGoals={0} totalGoals={0} topActions={[]} />);
    expect(html).toContain("최대 DSR");
    expect(html.match(/확인되지 않음/g)).toHaveLength(2);
    expect(html).not.toContain("0.0%");
  });

  it("honors a stored interpretation policy in saved and standalone output", () => {
    const run = fixture();
    run.outputs.resultDto!.summary.worstCashKrw = 100_000;
    run.outputs.resultDto!.summary.dsrPct = 35;
    run.reproducibility = { appVersion: "test", engineVersion: "test", profileHash: "synthetic",
      appliedOverrides: [], policy: { ...DEFAULT_PLANNING_POLICY, dsr: { cautionPct: 10, riskPct: 20 } } };
    const vm = safeBuildReportVMFromRun(run).vm!;
    const html = renderToStaticMarkup(<SavedReportBrief run={run} vm={vm} />);
    expect(html).toContain("기본 지표 판정: 위험");
    const standalone = buildStandaloneReportArtifactsFromRun(run);
    expect(standalone.interpretation.verdict.code).toBe("RISK");
    expect(standalone.html).toContain("기본 지표 판정: 위험");
  });

  it("keeps canonical repeated warning counts for the same run's interpretation", () => {
    const run = fixture();
    run.outputs.resultDto!.warnings.aggregated = [{ code: "CONTRIBUTION_SKIPPED", severity: "warn", count: 3, firstMonth: 0, lastMonth: 0 }];
    const vm = safeBuildReportVMFromRun(run).vm!;
    expect(toInterpretationInputFromReportVM(vm).aggregatedWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRIBUTION_SKIPPED", count: 3 }),
    ]));
  });
});
