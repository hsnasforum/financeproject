import { describe, expect, it } from "vitest";
import { computePlanner, getDefaultPlannerAssumptions } from "../src/lib/planner/compute";
import { type PlannerInput } from "../src/lib/planner/types";

function baseInput(): PlannerInput {
  return {
    monthlyIncomeNet: 4000000,
    monthlyFixedExpenses: 1200000,
    monthlyVariableExpenses: 800000,
    liquidAssets: 1000000,
    otherAssets: 0,
    debts: [],
    goals: [{ name: "목돈", targetAmount: 12000000, horizonMonths: 24 }],
  };
}

describe("computePlanner", () => {
  const emergencyRecommendHref = "/recommend?purpose=emergency&kind=deposit&preferredTerm=3&liquidityPref=high&rateMode=max&pool=unified&autorun=1&save=1&go=history";

  it("allocates to emergency fund when free cashflow is positive and emergency is insufficient", () => {
    const input = baseInput();
    const result = computePlanner(input, getDefaultPlannerAssumptions());

    expect(result.emergencyPlan.suggestedMonthly).toBeGreaterThan(0);
    expect(result.emergencyPlan.estimatedMonths).not.toBeNull();
  });

  it("allocates extra payment to high-interest debt when minimum emergency is met", () => {
    const input = baseInput();
    input.liquidAssets = 2500000;
    input.debts = [
      { name: "카드론", balance: 8000000, aprPct: 15, monthlyPayment: 350000 },
      { name: "저금리대출", balance: 7000000, aprPct: 5, monthlyPayment: 200000 },
    ];

    const result = computePlanner(input, getDefaultPlannerAssumptions());

    expect(result.debtPlan.highInterestDebts.length).toBeGreaterThan(0);
    expect(result.debtPlan.focusDebt).toBe("카드론");
    expect(result.debtPlan.extraPaymentMonthly).toBeGreaterThan(0);
  });

  it("prioritizes cashflow correction when free cashflow is non-positive", () => {
    const input = baseInput();
    input.monthlyIncomeNet = 1500000;
    input.monthlyFixedExpenses = 1100000;
    input.monthlyVariableExpenses = 500000;
    input.debts = [{ name: "대출", balance: 5000000, aprPct: 12, monthlyPayment: 150000 }];

    const result = computePlanner(input, getDefaultPlannerAssumptions());
    const firstActionHrefs = result.actions[0]?.links?.map((link) => link.href) ?? [];

    expect(result.warnings.join(" ")).toContain("월 가용저축액");
    expect(result.actions[0]?.title).toContain("현금흐름");
    expect(firstActionHrefs).toContain("/gov24");
  });

  it("attaches emergency recommend links to emergency-first actions", () => {
    const minEmergencyInput = baseInput();
    minEmergencyInput.liquidAssets = 1_000_000;

    const minEmergencyResult = computePlanner(minEmergencyInput, getDefaultPlannerAssumptions());
    const minEmergencyAction = minEmergencyResult.actions.find((action) => action.title === "최소 비상금 먼저 확보");
    const minEmergencyHrefs = minEmergencyAction?.links?.map((link) => link.href) ?? [];

    expect(minEmergencyHrefs).toContain(emergencyRecommendHref);

    const targetEmergencyInput = baseInput();
    targetEmergencyInput.liquidAssets = 2_500_000;

    const targetEmergencyResult = computePlanner(targetEmergencyInput, getDefaultPlannerAssumptions());
    const targetEmergencyAction = targetEmergencyResult.actions.find((action) => action.title === "비상금 목표까지 우선 적립");
    const targetEmergencyHrefs = targetEmergencyAction?.links?.map((link) => link.href) ?? [];

    expect(targetEmergencyHrefs).toContain(emergencyRecommendHref);
  });

  it("attaches credit-loan deep links to debt-focused actions", () => {
    const input = baseInput();
    input.liquidAssets = 2_500_000;
    input.debts = [
      { name: "카드론", balance: 8_000_000, aprPct: 15, monthlyPayment: 350_000 },
    ];

    const result = computePlanner(input, getDefaultPlannerAssumptions());
    const parallelAction = result.actions.find((action) => action.title === "고금리 부채+비상금 병행");
    const focusAction = result.actions.find((action) => action.title.startsWith("집중 상환 대상:"));
    const parallelHrefs = parallelAction?.links?.map((link) => link.href) ?? [];
    const focusHrefs = focusAction?.links?.map((link) => link.href) ?? [];

    expect(parallelHrefs).toContain("/products/credit-loan");
    expect(parallelHrefs).toContain(emergencyRecommendHref);
    expect(focusHrefs).toContain("/products/credit-loan");
  });

  it("adds housing afford and subscription links when housing goal keywords are present", () => {
    const input = baseInput();
    input.goals = [{ name: "내집 마련 청약", targetAmount: 150000000, horizonMonths: 60 }];

    const result = computePlanner(input, getDefaultPlannerAssumptions());
    const allHrefs = result.actions.flatMap((action) => action.links?.map((link) => link.href) ?? []);

    expect(allHrefs).toContain("/housing/afford?incomeNet=4000000&outflow=2000000");
    expect(allHrefs).toContain("/housing/subscription?region=전국&mode=all&houseType=apt");
  });
});
