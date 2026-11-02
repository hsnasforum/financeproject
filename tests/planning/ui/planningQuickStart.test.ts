import { describe, expect, it } from "vitest";
import { simulateMonthly } from "../../../src/lib/planning/core/v2/simulateMonthly";
import { buildResultDtoV1 } from "../../../src/lib/planning/v2/resultDto";
import {
  hydrateProfileJsonEditorState,
  normalizeDraftWithDisclosure,
  toProfileJson,
} from "../../../src/lib/planning/ui/profileFormModel";
import {
  buildPlanningQuickStartPreview,
  buildPlanningQuickStartOutput,
  isPlanningQuickStartReady,
  resolvePlanningQuickRuleStatus,
} from "../../../src/lib/planning/ui/planningQuickStart";

describe("planningQuickStart", () => {
  it("keeps a custom emergency goal through apply and save without changing its calculation", () => {
    const draft = {
      monthlyIncomeNet: 4_800_000,
      fixedExpense: 2_300_000,
      goalName: "검토용 비상금",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    };
    const preview = buildPlanningQuickStartPreview(draft);
    const output = buildPlanningQuickStartOutput(draft);
    const editor = hydrateProfileJsonEditorState(output.profile, "변경한 프로필 이름");
    const savedProfile = normalizeDraftWithDisclosure(toProfileJson(editor.form)).profile;

    expect(preview.goalName).toBe("검토용 비상금");
    expect(output.profile.goals[0]?.name).toBe("검토용 비상금");
    expect(editor.form.goals[0]?.name).toBe("검토용 비상금");
    expect(savedProfile.goals[0]).toMatchObject({
      id: "goal-1",
      name: "검토용 비상금",
      targetAmount: 10_000_000,
      targetMonth: 12,
    });

    const assumptions = { inflation: 0, expectedReturn: 0 };
    const simulation = simulateMonthly(savedProfile, assumptions, 12);
    const legacySimulation = simulateMonthly({
      ...savedProfile,
      goals: [{ ...savedProfile.goals[0], name: "비상금" }],
    }, assumptions, 12);
    expect(simulation.timeline).toEqual(legacySimulation.timeline);
    expect(simulation.assumptionsUsed).toEqual(legacySimulation.assumptionsUsed);

    const result = buildResultDtoV1({ simulate: simulation });
    const legacyResult = buildResultDtoV1({ simulate: legacySimulation });
    expect(result.summary).toEqual(legacyResult.summary);
    expect(result.goals).toMatchObject([{
      id: "goal-1",
      title: "검토용 비상금",
      type: "emergencyFund",
      targetKrw: 10_000_000,
      targetMonth: 12,
    }]);
  });

  it("requires income, fixed expense, and one goal before apply", () => {
    expect(isPlanningQuickStartReady({
      monthlyIncomeNet: 3_200_000,
      fixedExpense: 1_700_000,
      goalName: "비상금 1,000만 원",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    })).toBe(true);

    expect(isPlanningQuickStartReady({
      monthlyIncomeNet: 3_200_000,
      fixedExpense: 1_700_000,
      goalName: "",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    })).toBe(false);
  });

  it("maps quick-start draft to wizard output using fixed expense and one goal", () => {
    const output = buildPlanningQuickStartOutput({
      monthlyIncomeNet: 3_200_000,
      fixedExpense: 1_700_000,
      goalName: "비상금 1,000만 원",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    });

    expect(output.profile.monthlyIncomeNet).toBe(3_200_000);
    expect(output.profile.monthlyEssentialExpenses).toBe(1_700_000);
    expect(output.profile.monthlyDiscretionaryExpenses).toBe(0);
    expect(output.profile.goals.some((goal) => (
      goal.targetAmount === 10_000_000
      && goal.targetMonth === 12
    ))).toBe(true);
  });

  it("builds preview summary before applying quick-start output", () => {
    const preview = buildPlanningQuickStartPreview({
      monthlyIncomeNet: 3_200_000,
      fixedExpense: 1_700_000,
      goalName: "비상금 1,000만 원",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    });

    expect(preview.monthlyIncomeNet).toBe(3_200_000);
    expect(preview.fixedExpense).toBe(1_700_000);
    expect(preview.monthlySurplus).toBe(1_500_000);
    expect(preview.targetMonthlyContribution).toBe(833_334);
    expect(preview.goalName).toBe("비상금 1,000만 원");
    expect(preview.caution).toBe("");
    expect(preview.quickRuleStatus.label).toBe("배분 가능");
    expect(preview.defaultNotes).toHaveLength(3);
  });

  it("adds caution when monthly surplus is smaller than target contribution", () => {
    const preview = buildPlanningQuickStartPreview({
      monthlyIncomeNet: 2_000_000,
      fixedExpense: 1_700_000,
      goalName: "비상금 1,000만 원",
      goalTargetAmount: 10_000_000,
      goalTargetMonth: 12,
    });

    expect(preview.monthlySurplus).toBe(300_000);
    expect(preview.targetMonthlyContribution).toBe(833_334);
    expect(preview.caution).toContain("매달 남는 돈보다 목표 적립액이 더 큽니다");
    expect(preview.quickRuleStatus.label).toBe("고정의무 압박");
  });

  it("classifies fixed obligation pressure before broader living-cost pressure", () => {
    const status = resolvePlanningQuickRuleStatus({
      monthlyIncomeNet: 3_000_000,
      fixedExpense: 2_100_000,
      monthlySurplus: 500_000,
    });

    expect(status.label).toBe("고정의무 압박");
    expect(status.detail).toContain("고정지출 비중이 커");
  });

  it("classifies living-cost pressure when surplus is tight after broader spending", () => {
    const status = resolvePlanningQuickRuleStatus({
      monthlyIncomeNet: 4_000_000,
      fixedExpense: 1_900_000,
      monthlySurplus: 300_000,
    });

    expect(status.label).toBe("생활비 압박");
    expect(status.detail).toContain("남는 돈이 적어");
  });
});
