import { describe, expect, it } from "vitest";
import {
  computeCandidateComparison,
  computeInterestEstimate,
  type CandidateVM,
} from "../../../src/lib/planning/candidates/comparison";

describe("candidate comparison utilities", () => {
  it("computes simple interest estimate with assumptions", () => {
    const result = computeInterestEstimate(10_000_000, 12, 4.8, { taxRatePct: 15.4 });

    expect(result.estimate).toEqual({
      grossInterestKrw: 480_000,
      taxKrw: 73_920,
      netInterestKrw: 406_080,
      maturityAmountKrw: 10_406_080,
    });
    expect(result.assumptionsUsed).toEqual({
      ratePct: 4.8,
      termMonths: 12,
      amountKrw: 10_000_000,
      taxRatePct: 15.4,
      model: "simple_interest",
      note: expect.any(String),
    });
    expect(result.evidence.formula).toContain("grossInterestKrw");
    expect(result.evidence.inputs.principalKrw).toBe(10_000_000);
    expect(result.evidence.assumptions.length).toBeGreaterThan(0);
    const evidenceJson = JSON.stringify(result.evidence);
    expect(evidenceJson).not.toContain("process.env");
    expect(evidenceJson).not.toContain(".data/");
    expect(evidenceJson).not.toContain("Bearer ");
    expect(evidenceJson).not.toContain("GITHUB_TOKEN");
    expect(evidenceJson).not.toContain("ECOS_API_KEY");
  });

  it("builds deterministic comparison rows for identical inputs", () => {
    const candidates: CandidateVM[] = [
      {
        id: "cand-a",
        kind: "deposit",
        providerName: "테스트은행A",
        productName: "상품A",
        termMonths: 12,
        baseRatePct: 3.8,
        conditionsSummary: "조건A",
        source: "finlife",
        fetchedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "cand-b",
        kind: "saving",
        providerName: "테스트은행B",
        productName: "상품B",
        termMonths: 24,
        baseRatePct: 4.2,
        bonusRatePct: 0.3,
        conditionsSummary: "조건B",
        source: "finlife",
        fetchedAt: "2026-03-01T00:00:00.000Z",
      },
    ];

    const input = {
      monthlyIncomeNet: 4_500_000,
      monthlyEssentialExpenses: 1_700_000,
      monthlyDiscretionaryExpenses: 800_000,
      liquidAssets: 12_000_000,
    };
    const goal = {
      id: "goal-1",
      name: "비상금",
      targetAmount: 18_000_000,
      currentAmount: 6_000_000,
      targetMonth: 12,
    };

    const first = computeCandidateComparison(input, goal, candidates, {
      amountKrw: 9_000_000,
      taxRatePct: 15.4,
      fallbackTermMonths: 12,
    });
    const second = computeCandidateComparison(input, goal, candidates, {
      amountKrw: 9_000_000,
      taxRatePct: 15.4,
      fallbackTermMonths: 12,
    });

    expect(first).toStrictEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]?.estimate.netInterestKrw).toBeGreaterThan(0);
    expect((first[0]?.estimateEvidence.assumptions.length ?? 0) > 0).toBe(true);
  });
});
