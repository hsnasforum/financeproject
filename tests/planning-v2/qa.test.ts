import { describe, expect, it } from "vitest";
import { answerQuestion, type PlanningQuestion } from "../../src/lib/planning/v2/qa";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function sampleProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 2_200_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 300_000,
    investmentAssets: 400_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 8_000_000,
        minimumPayment: 250_000,
        apr: 0.12,
        remainingMonths: 48,
      },
    ],
    goals: [
      {
        id: "goal-home",
        name: "Home Goal",
        targetAmount: 12_000_000,
        targetMonth: 12,
        priority: 5,
      },
    ],
  };
}

describe("planning q&a generator", () => {
  it("returns deterministic answers with evidence codes", () => {
    const plan = simulateMonthly(
      sampleProfile(),
      {
        inflation: 0.02,
        expectedReturn: 0.04,
      },
      24,
    );

    const questions: PlanningQuestion[] = [
      "WHY_GOAL_MISSED",
      "WHY_CASH_LOW",
      "WHY_DEBT_RISKY",
      "WHAT_ASSUMPTIONS_MATTER",
    ];
    const answers = questions.map((question) => answerQuestion(question, plan));
    const answersAgain = questions.map((question) => answerQuestion(question, plan));

    expect(answers).toEqual(answersAgain);
    for (const answer of answers) {
      expect(answer.bullets.length).toBeGreaterThanOrEqual(3);
      expect(answer.bullets.length).toBeLessThanOrEqual(7);
      expect(Array.isArray(answer.evidenceCodes)).toBe(true);
    }
    expect(answers).toMatchSnapshot();
  });
});
