import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedReportBrief from "../../../src/components/planning/reports/SavedReportBrief";
import { buildInterpretationVM } from "../../../src/lib/planning/v2/insights/interpretationVm";
import { toInterpretationInputFromReportVM } from "../../../src/lib/planning/reports/reportInterpretationAdapter";
import PlanningReportsDashboardClient from "../../../src/components/PlanningReportsDashboardClient";
import { runScenarios } from "../../../src/lib/planning/core/v2/runScenarios";
import { buildActionsFromPlan } from "../../../src/lib/planning/core/v2/actions/buildActions";
import { buildPlanningRunArtifacts } from "../../../src/lib/planning/server/v2/runArtifacts";
import { safeBuildReportVMFromRun } from "../../../src/lib/planning/reports/reportViewModel";
import type { PlanningRunRecord } from "../../../src/lib/planning/store/types";
import { formatKrw } from "../../../src/lib/planning/i18n/format";
import { compactRunOutputs } from "../../../src/lib/planning/store/runMetaRecord";

const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/planning/reports",
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

const profile = {
  monthlyIncomeNet: 4_100_000, monthlyEssentialExpenses: 1_800_000,
  monthlyDiscretionaryExpenses: 600_000, liquidAssets: 2_500_000,
  investmentAssets: 4_400_000, debts: [],
  goals: [{ id: "emergency", name: "비상금", targetAmount: 12_000_000, currentAmount: 1_000_000, targetMonth: 12 }],
};
const baseAssumptions = { inflationPct: 2, investReturnPct: 5, cashReturnPct: 2, withdrawalRatePct: 4 };
const scenarios = runScenarios({ profile, horizonMonths: 24, baseAssumptions });
const actions = buildActionsFromPlan({ plan: scenarios.base, profile, baseAssumptions });

function fixture(enabled = true): PlanningRunRecord {
  const artifacts = buildPlanningRunArtifacts({
    profile, policyId: "balanced", snapshotMeta: { asOf: "2026-09-07" }, healthSummary: {},
    simulatePlan: scenarios.base, scenariosOutput: enabled ? scenarios : null,
    actionsOutput: actions, monteCarloOutput: null, debtStrategyOutput: null,
  });
  return {
    version: 1, id: "scenario-run", profileId: "profile", createdAt: "2026-09-07T00:00:00.000Z",
    overallStatus: "SUCCESS", input: { horizonMonths: 24 }, meta: {},
    outputs: {
      engineSchemaVersion: artifacts.outputs.engineSchemaVersion,
      engine: artifacts.outputs.engine,
      resultDto: artifacts.resultDto,
      simulate: { ...artifacts.outputs.simulate, ref: { name: "simulate", path: "fixture/simulate.json" } },
      ...(artifacts.outputs.scenarios ? { scenarios: { ...artifacts.outputs.scenarios, ref: { name: "scenarios", path: "fixture/scenarios.json" } } } : {}),
      actions: { ...artifacts.outputs.actions, ref: { name: "actions", path: "fixture/actions.json" } },
    },
  };
}

function render(run: PlanningRunRecord, other?: PlanningRunRecord) {
  return renderToStaticMarkup(<PlanningReportsDashboardClient initialRuns={other ? [run, other] : [run]} initialRunId={run.id} />);
}

describe("stable report scenario to action flow", () => {
  beforeEach(() => { navigation.query = ""; });

  it("renders actual artifacts with matching scenario IDs, values and existing VM interpretations before actions", () => {
    const run = fixture();
    const before = JSON.stringify(run);
    const vm = safeBuildReportVMFromRun(run).vm;
    expect(vm?.scenarioRows.map((row) => row.id)).toEqual(["base", "conservative", "aggressive"]);
    const html = render(run);
    expect(html).toContain('data-testid="report-scenario-comparison"');
    for (const row of vm!.scenarioRows) {
      const renderedRow = html.split(`data-testid="report-scenario-${row.id}"`)[1].split("</tr>")[0];
      expect(renderedRow).toContain(row.title);
      expect(renderedRow).toContain(formatKrw("ko-KR", row.endNetWorthKrw));
      expect(renderedRow).toContain(`${row.endNetWorthDeltaKrw > 0 ? "+" : ""}${formatKrw("ko-KR", row.endNetWorthDeltaKrw)}`);
      expect(renderedRow).toContain(formatKrw("ko-KR", row.worstCashKrw));
      expect(renderedRow).toContain(`>${row.goalsAchievedCount}</td>`);
      expect(renderedRow).toContain(`>${row.warningsCount}</td>`);
      expect(renderedRow).toContain(row.interpretation);
    }
    expect(vm!.scenarioRows[0].endNetWorthDeltaKrw).toBe(0);
    expect(html).toContain('data-testid="report-top-actions"');
    expect(html).toContain(actions[0].title);
    const order = ['data-testid="report-summary-cards"', "발생 경고", "목표 달성 여부", 'data-testid="report-scenario-comparison"', 'data-testid="report-top-actions"', "추가 분석 및 다음 확인"];
    order.slice(1).forEach((label, index) => { expect(html.indexOf(order[index])).toBeLessThan(html.indexOf(label)); });
    expect(JSON.stringify(run)).toBe(before);
    expect(vm!.actionRows).toEqual(safeBuildReportVMFromRun(fixture(false)).vm!.actionRows);
  });

  it("puts a saved-context brief first while preserving the same interpretation in a closed detail section", () => {
    const run = fixture();
    const vm = safeBuildReportVMFromRun(run).vm!;
    const expected = buildInterpretationVM(toInterpretationInputFromReportVM(vm));
    const html = render(run);
    expect(html.indexOf('data-testid="saved-report-brief"')).toBeLessThan(html.indexOf('data-testid="report-summary-cards"'));
    const brief = renderToStaticMarkup(<SavedReportBrief run={run} vm={vm} />);
    expect(brief).toContain(expected.assessment.headline);
    expect(brief).toContain(expected.assessment.basisLabel);
    expect(brief).toContain(expected.nextActions[0].title);
    expect(brief).toContain("24개월");
    expect(brief).toContain("2026-09-07");
    expect(brief).toContain("현재 잔액이나 보장된 수익이 아니며");
    const details = html.match(/<details[^>]*data-testid="report-interpretation-details"[^>]*>/)?.[0];
    expect(details).toBeDefined();
    expect(details).not.toMatch(/\sopen(?:[=\s>])/);
    expect(html).toContain('data-testid="interpretation-guide"');
  });

  it.each(["FAILED", "RUNNING"] as const)("does not present preserved outputs as an actionable successful result when the run is %s", (status) => {
    const run = { ...fixture(), overallStatus: status };
    const before = JSON.stringify(run);
    const html = render(run);
    expect(html).toContain("해석 확인 필요");
    expect(html).toContain("이 실행의 결과를 해석할 수 없습니다");
    expect(html).not.toContain('data-testid="interpretation-guide"');
    expect(JSON.stringify(run)).toBe(before);
  });

  it("keeps missing reference data and partial results explicit without inventing values", () => {
    const run = { ...fixture(), overallStatus: "PARTIAL_SUCCESS" as const };
    const vm = safeBuildReportVMFromRun(run).vm!;
    vm.snapshot = { missing: true };
    const before = JSON.stringify(vm);
    const html = renderToStaticMarkup(<SavedReportBrief run={run} vm={vm} />);
    expect(html).toContain("기준일 미확인");
    expect(html).toContain("계산 기준 데이터가 없어");
    expect(html).toContain("일부 계산 단계가 완료되지 않았습니다");
    expect(JSON.stringify(vm)).toBe(before);
  });

  it("keeps actions and the report available without stored scenarios", () => {
    const run = fixture(false);
    expect(safeBuildReportVMFromRun(run).vm?.scenarioRows).toEqual([]);
    const html = render(run);
    expect(html).not.toContain('data-testid="report-scenario-comparison"');
    expect(html).toContain('data-testid="report-top-actions"');
    expect(html).toContain(actions[0].title);
  });

  it.each(["disabled", "failed"])("keeps successful actions available when scenario stage is %s", (state) => {
    const run = fixture(false);
    run.overallStatus = state === "failed" ? "PARTIAL_SUCCESS" : "SUCCESS";
    run.stages = [
      { id: "simulate", status: "SUCCESS" },
      { id: "scenarios", status: state === "failed" ? "FAILED" : "SKIPPED", reason: state === "failed" ? "STAGE_ERROR" : "OPTION_DISABLED" },
      { id: "actions", status: "SUCCESS" },
    ];
    const html = render(run);
    expect(html).not.toContain('data-testid="report-scenario-comparison"');
    expect(html).toContain('data-testid="report-summary-cards"');
    expect(html).toContain(actions[0].title);
  });

  it("keeps stored run comparison distinct and after scenario and action sections", () => {
    const run = fixture();
    const baseline = { ...fixture(false), id: "baseline", title: "저장 실행 A" };
    navigation.query = "baseRunId=baseline";
    const html = render(run, baseline);
    expect(html).toContain("한 실행 안의 가정 변화");
    expect(html).toContain("저장 실행 간 비교");
    expect(html).toContain("서로 다른 저장 실행 A와 B");
    expect(html).toContain('data-testid="baseline-selector"');
    expect(html.indexOf('data-testid="report-top-actions"')).toBeLessThan(html.indexOf('data-testid="report-run-comparison"'));
  });

  it("renders ID-specific explanations from compact metadata with the existing action flow", () => {
    const run = fixture();
    const beforeMap = run.outputs.scenarios!.shortWhyByScenario as Record<string, string[]>;
    run.outputs = compactRunOutputs(run.outputs);
    expect(run.outputs.scenarios?.shortWhyByScenario).toEqual(beforeMap);
    expect(run.outputs.resultDto?.raw).toEqual({});
    const vm = safeBuildReportVMFromRun(run).vm!;
    const html = render(run);
    expect(vm.scenarioRows).toHaveLength(3);
    for (const row of vm.scenarioRows) {
      const renderedRow = html.split(`data-testid="report-scenario-${row.id}"`)[1].split("</tr>")[0];
      expect(renderedRow).toContain(row.title);
      expect(renderedRow).toContain(row.interpretation);
      expect(row.interpretation).toBe(beforeMap[row.id]?.[0] ?? "기준 대비 순자산/경고 변화를 함께 확인하세요.");
    }
    expect(html).toContain(actions[0].title);
  });

  it("keeps the existing fallback for legacy compact runs with no ID map", () => {
    const run = fixture();
    run.outputs = compactRunOutputs(run.outputs);
    delete run.outputs.scenarios;
    const html = render(run);
    expect(html).toContain('data-testid="report-scenario-comparison"');
    expect(html).toContain("기준 대비 순자산/경고 변화를 함께 확인하세요.");
    expect(html).toContain(actions[0].title);
  });
});
