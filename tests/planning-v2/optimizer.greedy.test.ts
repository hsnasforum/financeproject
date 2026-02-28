import { describe, expect, it } from "vitest";
import { generateCandidatePlans } from "../../src/lib/planning/v2/optimizer/greedy";
import { type AssumptionsV2 } from "../../src/lib/planning/v2/scenarios";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function baseProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 4_500_000,
    monthlyEssentialExpenses: 1_400_000,
    monthlyDiscretionaryExpenses: 700_000,
    liquidAssets: 2_000_000,
    investmentAssets: 4_000_000,
    debts: [
      {
        id: "loan-1",
        name: "Loan 1",
        balance: 8_000_000,
        minimumPayment: 220_000,
        apr: 0.06,
        remainingMonths: 48,
      },
    ],
    goals: [
      {
        id: "goal-emergency",
        name: "Emergency",
        targetAmount: 8_000_000,
        targetMonth: 18,
        priority: 5,
      },
    ],
  };
}

function baseAssumptions(): AssumptionsV2 {
  return {
    inflationPct: 2,
    investReturnPct: 5,
    cashReturnPct: 2,
    withdrawalRatePct: 4,
    debtRates: {},
  };
}

describe("generateCandidatePlans", () => {
  it("is deterministic for identical seed and input", () => {
    const input = {
      profile: baseProfile(),
      horizonMonths: 60,
      baseAssumptions: baseAssumptions(),
      constraints: {
        minEmergencyMonths: 1,
      },
      knobs: {
        maxMonthlyContributionKrw: 200_000,
        allowExtraDebtPayment: true,
        allowInvestContribution: true,
      },
      search: {
        candidates: 16,
        keepTop: 4,
        seed: 42,
      },
    } as const;

    const first = generateCandidatePlans(input);
    const second = generateCandidatePlans(input);
    expect(first).toEqual(second);
  });

  it("filters out candidates violating constraints", () => {
    const candidates = generateCandidatePlans({
      profile: baseProfile(),
      horizonMonths: 36,
      baseAssumptions: baseAssumptions(),
      constraints: {
        minEmergencyMonths: 1,
        minEndCashKrw: 1_500_000,
      },
      knobs: {
        maxMonthlyContributionKrw: 150_000,
        allowExtraDebtPayment: false,
        allowInvestContribution: true,
      },
      search: {
        candidates: 12,
        keepTop: 5,
        seed: 7,
      },
    });

    expect(candidates.length).toBeGreaterThan(0);
    candidates.forEach((candidate) => {
      expect(candidate.result.summary.worstCashKrw).toBeGreaterThanOrEqual(0);
      const last = candidate.result.keyTimelinePoints[candidate.result.keyTimelinePoints.length - 1];
      expect(last?.liquidAssetsKrw ?? 0).toBeGreaterThanOrEqual(1_500_000);
    });
  });

  it("respects knob flags for invest/extra debt payment", () => {
    const candidates = generateCandidatePlans({
      profile: baseProfile(),
      horizonMonths: 24,
      baseAssumptions: baseAssumptions(),
      constraints: {
        minEmergencyMonths: 0,
      },
      knobs: {
        maxMonthlyContributionKrw: 300_000,
        allowExtraDebtPayment: false,
        allowInvestContribution: false,
      },
      search: {
        candidates: 6,
        keepTop: 3,
      },
    });

    expect(candidates.length).toBeGreaterThan(0);
    candidates.forEach((candidate) => {
      expect(candidate.strategy.extraDebtPaymentKrw ?? 0).toBe(0);
      expect(candidate.strategy.investContributionKrw ?? 0).toBe(0);
    });
  });
});
