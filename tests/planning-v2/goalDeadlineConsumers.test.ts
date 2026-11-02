import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { answerQuestion } from "../../src/lib/planning/v2/qa";
import { buildActionsFromPlan } from "../../src/lib/planning/v2/actions/buildActions";
import { toMarkdownReport } from "../../src/lib/planning/v2/report";
import { aggregateWarnings } from "../../src/lib/planning/v2/report/warningsAggregate";
import { mapGoals } from "../../src/lib/planning/v2/report/mapGoals";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";
import { buildReportVM } from "../../src/lib/planning/reports/reportViewModel";
import { renderStandaloneHtml } from "../../src/lib/planning/reports/standaloneHtmlReport";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const profile: ProfileV2 = {
  monthlyIncomeNet: 100_000, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0,
  liquidAssets: 0, investmentAssets: 0, debts: [],
  goals: [{ id: "goal", name: "목표", targetAmount: 300_000, targetMonth: 2, priority: 3 }],
};
const simulate = () => simulateMonthly(profile, { inflation: 0, expectedReturn: 0 }, 3);

describe("deadline outcomes in report, QA, actions and DTO consumers", () => {
  it("distinguishes late achievement in mapGoals and DTO without changing final achievement counts", () => {
    const plan = simulate();
    expect(mapGoals(plan.goalStatus)[0]).toMatchObject({ achieved: true, achievedMonth: 3, shortfall: 0, comment: "기한 후 달성" });
    const dto = buildResultDtoV1({ simulate: plan });
    expect(dto.goals[0]).toMatchObject({ id: "goal", achieved: true, shortfallKrw: 0, comment: "기한 후 달성" });
    expect(dto.summary.goalsAchieved).toEqual({ achieved: 1, total: 1 });
    expect(dto.warnings.aggregated).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GOAL_MISSED", count: 1 })]));
  });

  it.each([0, 2, undefined])("preserves reached comments for achievement month %s", (achievedMonth) => {
    expect(mapGoals([{ ...simulate().goalStatus[0], achievedMonth }])[0].comment).toBe("달성");
  });

  it("answers QA with the recorded deadline gap instead of the final zero shortfall", () => {
    const answer = answerQuestion("WHY_GOAL_MISSED", simulate());
    expect(answer.evidenceCodes).toContain("GOAL_MISSED");
    expect(answer.bullets.join("\n")).toContain("100,000원");
    expect(answer.bullets.join("\n")).not.toContain("미달액은 0원");
  });

  it("does not invent a deadline amount when late achievement has no recorded gap", () => {
    const plan = simulate();
    plan.warnings = plan.warnings.map((warning) => ({ ...warning, meta: { goalId: "goal" } }));
    const answer = answerQuestion("WHY_GOAL_MISSED", plan);
    expect(answer.bullets.join("\n")).toContain("데이터는 제한적");
    expect(answer.bullets.join("\n")).not.toContain("미달액은 0원");
  });

  it("keeps deadline warnings in the markdown report and labels the achieved goal as late", () => {
    const markdown = toMarkdownReport({ plan: simulate() });
    expect(markdown).toContain("목표 기한 미달 1건: 목표");
    expect(markdown).toContain("| 목표 | Y (기한 후) | 100.0% | 0 | 2 |");
    expect(markdown).toContain("GOAL_MISSED");
  });

  it("aggregates the deadline month and does not create a new funding action for a funded goal", () => {
    const plan = simulate();
    expect(aggregateWarnings(plan.warnings)).toMatchObject([
      { code: "GOAL_MISSED", count: 1, months: { first: 1, last: 1 } },
    ]);
    const actions = buildActionsFromPlan({ plan, profile, baseAssumptions: {
      inflationPct: 0, investReturnPct: 0, cashReturnPct: 0, withdrawalRatePct: 4, debtRates: {},
    } });
    expect(actions.some((action) => action.code === "COVER_LUMP_SUM_GOAL")).toBe(false);
  });

  it("retains the late achievement explanation in report guide rows and exported HTML", () => {
    const plan = simulate();
    const run: PlanningRunRecord = {
      version: 1, id: "run", profileId: "profile", createdAt: "2026-09-06T00:00:00.000Z",
      input: { horizonMonths: 3 }, meta: {},
      outputs: { resultDto: buildResultDtoV1({ simulate: plan }) },
    };
    const vm = buildReportVM(run);
    expect.soft(vm.guide.goals[0]).toMatchObject({ achieved: true, shortfallKrw: 0, interpretation: "기한 후 달성" });
    const html = renderStandaloneHtml({
      runId: "run", reportId: "report", createdAt: run.createdAt,
      assumptionsLines: [], summaryCards: {}, warnings: [], goals: vm.goalsTable, actions: [],
      verdict: { label: "참고", headline: "목표 기한 확인" }, diagnostics: [],
    });
    expect(html).toContain("기한 후 달성");
    for (const comment of [undefined, "   "]) {
      const dto = buildResultDtoV1({ simulate: plan });
      dto.goals[0].comment = comment;
      expect(buildReportVM({ ...run, outputs: { resultDto: dto } }).guide.goals[0].interpretation).toBe("달성");
    }
  });
});
