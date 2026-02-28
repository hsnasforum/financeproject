import { describe, expect, it, vi } from "vitest";
import { createPlanningService } from "../../src/lib/planning/v2/service";
import { type ActionItemV2 } from "../../src/lib/planning/v2/actions/types";
import { type DebtStrategyInput, type DebtStrategyResult } from "../../src/lib/planning/v2/debt/types";
import { type AssumptionsProvider } from "../../src/lib/planning/providers/assumptionsProvider";
import { type ProductCandidatesProvider } from "../../src/lib/planning/providers/productCandidatesProvider";
import { type DebtStrategyProvider } from "../../src/lib/planning/providers/debtStrategyProvider";

function baseProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 500_000,
    liquidAssets: 1_000_000,
    investmentAssets: 2_000_000,
    debts: [],
    goals: [],
  };
}

function makeAction(code: ActionItemV2["code"], metrics: Record<string, number> = {}): ActionItemV2 {
  return {
    code,
    severity: "info",
    title: code,
    summary: code,
    why: [],
    metrics,
    steps: [],
    cautions: [],
  };
}

function stubAssumptionsProvider(): AssumptionsProvider {
  return {
    getSnapshotRef: vi.fn().mockResolvedValue({ missing: true }),
    getBaseAssumptions: vi.fn().mockResolvedValue({
      assumptions: {
        inflationPct: 2,
        investReturnPct: 5,
        cashReturnPct: 2,
        withdrawalRatePct: 4,
        debtRates: {},
      },
      simulationAssumptions: {
        inflation: 2,
        expectedReturn: 5,
        debtRates: {},
      },
      snapshotMeta: {
        missing: true,
      },
      snapshotWarnings: [],
    }),
  };
}

describe("createPlanningService", () => {
  it("normalizes override inputs and combines health warnings via assumptions provider", async () => {
    const provider: AssumptionsProvider = {
      getSnapshotRef: vi.fn().mockResolvedValue({ missing: true }),
      getBaseAssumptions: vi.fn().mockResolvedValue({
        assumptions: {
          inflationPct: 1.5,
          investReturnPct: 10,
          cashReturnPct: 2.3,
          withdrawalRatePct: 4.2,
          debtRates: {},
        },
        simulationAssumptions: {
          inflation: 1.5,
          expectedReturn: 10,
          debtRates: {},
        },
        snapshotMeta: {
          id: "snap-1",
          missing: true,
        },
        snapshotWarnings: [
          {
            code: "CASH_RETURN_PROXY_FROM_CD",
            severity: "info",
            message: "proxy",
          },
        ],
        snapshotId: "snap-1",
      }),
    };
    const service = createPlanningService({ assumptionsProvider: provider });
    const profile = baseProfile();

    const result = await service.resolveAssumptionsContext({
      profile,
      riskTolerance: "low",
      assumptionsOverridesRaw: {
        inflation: 1.5,
        expectedReturn: 10,
        cashReturnPct: 2.3,
        withdrawalRatePct: 4.2,
      },
      requestedSnapshotId: "snap-1",
    });

    expect(provider.getBaseAssumptions).toHaveBeenCalledWith(
      profile,
      {
        inflationPct: 1.5,
        investReturnPct: 10,
        cashReturnPct: 2.3,
        withdrawalRatePct: 4.2,
      },
      "snap-1",
    );
    expect(result.snapshotId).toBe("snap-1");
    expect(result.health.summary.warningCodes).toContain("SNAPSHOT_MISSING");
    expect(result.health.summary.warningCodes).toContain("OPTIMISTIC_RETURN");
    expect(result.health.summary.warningCodes).toContain("RISK_ASSUMPTION_MISMATCH");
    expect(result.health.summary.warningCodes).toContain("CASH_RETURN_PROXY_FROM_CD");
    expect(result.scenarioOverrideForCache).toEqual({
      cashReturnPct: 2.3,
      withdrawalRatePct: 4.2,
    });
  });

  it("attaches product candidates through provider and delegates debt strategy compute", async () => {
    const productProvider: ProductCandidatesProvider = {
      matchEmergencyCandidates: vi.fn().mockResolvedValue([
        { kind: "deposit", finPrdtCd: "d1", company: "A", name: "Emergency Deposit" },
      ]),
      matchGoalCandidates: vi.fn().mockResolvedValue([
        { kind: "saving", finPrdtCd: "s1", company: "B", name: "Goal Saving" },
      ]),
    };
    const debtResult: DebtStrategyResult = {
      meta: { debtServiceRatio: 0.22, totalMonthlyPaymentKrw: 400_000 },
      summaries: [],
      whatIf: {
        termExtensions: [],
        termReductions: [],
        extraPayments: [],
      },
      warnings: [],
      cautions: [],
    };
    const debtProvider: DebtStrategyProvider = {
      compute: vi.fn().mockReturnValue(debtResult),
    };
    const service = createPlanningService({
      assumptionsProvider: stubAssumptionsProvider(),
      productCandidatesProvider: productProvider,
      debtStrategyProvider: debtProvider,
    });

    const attached = await service.attachCandidates(
      [
        makeAction("BUILD_EMERGENCY_FUND"),
        makeAction("COVER_LUMP_SUM_GOAL", { targetMonth: 18 }),
      ],
      {
        includeProducts: true,
        maxCandidatesPerAction: 2,
      },
    );

    expect(productProvider.matchEmergencyCandidates).toHaveBeenCalledTimes(1);
    expect(productProvider.matchGoalCandidates).toHaveBeenCalledTimes(1);
    expect(attached[0].candidates?.[0]?.finPrdtCd).toBe("d1");
    expect(attached[1].candidates?.[0]?.finPrdtCd).toBe("s1");

    const input: DebtStrategyInput = {
      liabilities: [],
      monthlyIncomeKrw: 4_000_000,
    };
    const computed = service.computeDebtStrategy(input);
    expect(computed).toEqual(debtResult);
    expect(debtProvider.compute).toHaveBeenCalledWith(input);
  });
});
