import { diffPlanResults, type ScenarioDiff } from "./diff";
import { type AllocationPolicyId } from "./policy/types";
import { buildScenarios, type AssumptionsV2, type RiskTolerance, type ScenarioSpec, toSimulationAssumptionsV2 } from "./scenarios";
import { simulateMonthly } from "./simulateMonthly";
import { type ProfileV2, type SimulationResultV2 } from "./types";

type RunScenariosInput = {
  profile: ProfileV2;
  horizonMonths: number;
  baseAssumptions: AssumptionsV2;
  riskTolerance?: RiskTolerance;
  policyId?: AllocationPolicyId;
  rules?: {
    conservativeDelta?: { investReturnPct?: number; inflationPct?: number; cashReturnPct?: number };
    aggressiveDelta?: { investReturnPct?: number; inflationPct?: number; cashReturnPct?: number };
  };
};

type ScenarioRun = {
  spec: ScenarioSpec;
  result: SimulationResultV2;
  diffVsBase: ScenarioDiff;
};

export function runScenarios(input: RunScenariosInput): {
  base: SimulationResultV2;
  scenarios: ScenarioRun[];
  specs: ScenarioSpec[];
} {
  const specs = buildScenarios({
    base: input.baseAssumptions,
    riskTolerance: input.riskTolerance ?? "mid",
    rules: input.rules,
  });

  const baseSpec = specs.find((spec) => spec.id === "base");
  if (!baseSpec) {
    throw new Error("Missing base scenario");
  }

  const base = simulateMonthly(
    input.profile,
    toSimulationAssumptionsV2(baseSpec.assumptions),
    input.horizonMonths,
    { policyId: input.policyId },
  );

  const scenarios = specs
    .filter((spec) => spec.id !== "base")
    .map((spec) => {
      const result = simulateMonthly(
        input.profile,
        toSimulationAssumptionsV2(spec.assumptions),
        input.horizonMonths,
        { policyId: input.policyId },
      );
      return {
        spec,
        result,
        diffVsBase: diffPlanResults(base, result),
      };
    });

  return { base, scenarios, specs };
}
