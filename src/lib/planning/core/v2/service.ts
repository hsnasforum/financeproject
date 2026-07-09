import {
  assessAssumptionsHealth,
  assessRiskAssumptionConsistency,
  combineAssumptionsHealth,
} from "./assumptionsHealth";
import { runScenarios } from "./runScenarios";
import { type AssumptionsV2, type RiskTolerance } from "./scenarios";
import { simulateMonthly } from "./simulateMonthly";
import { runMonteCarlo, type MonteCarloInput } from "./monteCarlo";
import { buildActionsFromPlan } from "./actions/buildActions";
import { type ActionItemV2 } from "./actions/types";
import { type DebtStrategyInput } from "./debt/types";
import { type AssumptionsProvider } from "../../providers/assumptionsProvider";
import { attachProductCandidatesToActions, type ProductCandidatesProvider } from "../../providers/productCandidatesProvider";
import { type DebtStrategyProvider } from "../../providers/debtStrategyProvider";
import { type TaxPensionProvider } from "../../providers/taxPensionProvider";
import { type ProfileV2, type SimulationAssumptionsV2 } from "./types";
import { type AllocationPolicyId } from "./policy/types";

type ResolveAssumptionsInput = {
  profile: ProfileV2;
  riskTolerance: RiskTolerance;
  assumptionsOverridesRaw: Record<string, unknown>;
  requestedSnapshotId?: string;
};

export type PlanningServiceDependencies = {
  assumptionsProvider: AssumptionsProvider;
  productCandidatesProvider: ProductCandidatesProvider;
  debtStrategyProvider: DebtStrategyProvider;
  taxPensionProvider: TaxPensionProvider;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toNormalizedOverrides(raw: Record<string, unknown>): Partial<AssumptionsV2> {
  const out: Partial<AssumptionsV2> = {};

  if (isFiniteNumber(raw.inflation)) out.inflationPct = raw.inflation;
  if (isFiniteNumber(raw.expectedReturn)) out.investReturnPct = raw.expectedReturn;
  if (isRecord(raw.debtRates)) out.debtRates = raw.debtRates as Record<string, number>;

  if (!isFiniteNumber(out.inflationPct) && isFiniteNumber(raw.inflationPct)) {
    out.inflationPct = raw.inflationPct;
  }
  if (!isFiniteNumber(out.investReturnPct) && isFiniteNumber(raw.investReturnPct)) {
    out.investReturnPct = raw.investReturnPct;
  }
  if (isFiniteNumber(raw.cashReturnPct)) out.cashReturnPct = raw.cashReturnPct;
  if (isFiniteNumber(raw.withdrawalRatePct)) out.withdrawalRatePct = raw.withdrawalRatePct;

  return out;
}

function toScenarioOverrideForCache(overrides: Partial<AssumptionsV2>): Partial<Pick<AssumptionsV2, "cashReturnPct" | "withdrawalRatePct">> {
  return {
    ...(isFiniteNumber(overrides.cashReturnPct) ? { cashReturnPct: overrides.cashReturnPct } : {}),
    ...(isFiniteNumber(overrides.withdrawalRatePct) ? { withdrawalRatePct: overrides.withdrawalRatePct } : {}),
  };
}

function requireDependency<T>(
  value: T | undefined,
  name: keyof PlanningServiceDependencies,
): T {
  if (value) return value;
  throw new Error(`createPlanningService requires ${name}; use server/v2/service for default provider wiring.`);
}

export function createPlanningService(deps: PlanningServiceDependencies) {
  const input = deps as Partial<PlanningServiceDependencies> | undefined;
  const assumptionsProvider = requireDependency(input?.assumptionsProvider, "assumptionsProvider");
  const productCandidatesProvider = requireDependency(input?.productCandidatesProvider, "productCandidatesProvider");
  const debtStrategyProvider = requireDependency(input?.debtStrategyProvider, "debtStrategyProvider");
  const taxPensionProvider = requireDependency(input?.taxPensionProvider, "taxPensionProvider");

  return {
    async resolveAssumptionsContext(input: ResolveAssumptionsInput) {
      const normalizedOverrides = toNormalizedOverrides(input.assumptionsOverridesRaw);
      const resolved = await assumptionsProvider.getBaseAssumptions(
        input.profile,
        normalizedOverrides,
        input.requestedSnapshotId,
      );

      const baseHealth = assessAssumptionsHealth({
        assumptions: resolved.assumptions,
        snapshotMeta: resolved.snapshotMeta,
      });
      const riskWarnings = assessRiskAssumptionConsistency(input.riskTolerance, resolved.assumptions);
      const health = combineAssumptionsHealth(baseHealth, [...riskWarnings, ...resolved.snapshotWarnings]);
      const taxPensionExplain = taxPensionProvider.explain(input.profile);
      const precisionNotes = Array.from(
        new Set(
          (taxPensionExplain.notes ?? [])
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean),
        ),
      );

      return {
        assumptions: resolved.assumptions,
        simulationAssumptions: resolved.simulationAssumptions,
        snapshotMeta: resolved.snapshotMeta,
        snapshotId: resolved.snapshotId,
        health,
        taxPensionExplain: {
          applied: Boolean(taxPensionExplain.applied),
          notes: precisionNotes,
        },
        normalizedOverrides,
        scenarioOverrideForCache: toScenarioOverrideForCache(normalizedOverrides),
      };
    },

    simulate(
      profile: ProfileV2,
      assumptions: SimulationAssumptionsV2,
      horizonMonths: number,
      options?: { policyId?: AllocationPolicyId },
    ) {
      return simulateMonthly(profile, assumptions, horizonMonths, options);
    },

    scenarios(input: {
      profile: ProfileV2;
      horizonMonths: number;
      baseAssumptions: AssumptionsV2;
      riskTolerance: RiskTolerance;
      policyId?: AllocationPolicyId;
    }) {
      return runScenarios(input);
    },

    monteCarlo(input: MonteCarloInput) {
      return runMonteCarlo(input);
    },

    buildActions(args: Parameters<typeof buildActionsFromPlan>[0]) {
      return buildActionsFromPlan(args);
    },

    async attachCandidates(
      actions: ActionItemV2[],
      options: {
        includeProducts: boolean;
        emergencyHorizonMonths?: number;
        maxCandidatesPerAction?: number;
        requestBaseUrl?: string;
        fetchImpl?: typeof fetch;
      },
    ) {
      return attachProductCandidatesToActions(productCandidatesProvider, actions, options);
    },

    computeDebtStrategy(input: DebtStrategyInput) {
      return debtStrategyProvider.compute(input);
    },
  };
}
