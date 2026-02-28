import { type SimulationAssumptionsV2 } from "./types";

export type ScenarioId = "base" | "conservative" | "aggressive";

export type RiskTolerance = "low" | "mid" | "high";

export type AssumptionsV2 = {
  inflationPct: number;
  investReturnPct: number;
  cashReturnPct: number;
  withdrawalRatePct: number;
  debtRates?: Record<string, number>;
};

export type ScenarioSpec = {
  id: ScenarioId;
  title: string;
  assumptions: AssumptionsV2;
};

type ScenarioDeltaRule = {
  investReturnPct?: number;
  inflationPct?: number;
  cashReturnPct?: number;
};

type BuildScenariosParams = {
  base: AssumptionsV2;
  riskTolerance: RiskTolerance;
  rules?: {
    conservativeDelta?: ScenarioDeltaRule;
    aggressiveDelta?: ScenarioDeltaRule;
  };
};

const MIN_PCT = -20;
const MAX_PCT = 30;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_PCT, Math.max(MIN_PCT, value));
}

function clampAssumptions(assumptions: AssumptionsV2): AssumptionsV2 {
  return {
    inflationPct: clampPct(assumptions.inflationPct),
    investReturnPct: clampPct(assumptions.investReturnPct),
    cashReturnPct: clampPct(assumptions.cashReturnPct),
    withdrawalRatePct: clampPct(assumptions.withdrawalRatePct),
    debtRates: assumptions.debtRates ?? {},
  };
}

function normalizePctInput(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function toScenarioAssumptionsV2(
  input: SimulationAssumptionsV2,
  extra?: Partial<Pick<AssumptionsV2, "cashReturnPct" | "withdrawalRatePct">>,
): AssumptionsV2 {
  return clampAssumptions({
    inflationPct: normalizePctInput(input.inflation),
    investReturnPct: normalizePctInput(input.expectedReturn),
    cashReturnPct: normalizePctInput(extra?.cashReturnPct ?? 2.0),
    withdrawalRatePct: normalizePctInput(extra?.withdrawalRatePct ?? 4.0),
    debtRates: input.debtRates ?? {},
  });
}

export function toSimulationAssumptionsV2(input: AssumptionsV2): SimulationAssumptionsV2 {
  return {
    inflation: input.inflationPct,
    expectedReturn: input.investReturnPct,
    debtRates: input.debtRates ?? {},
  };
}

export function buildScenarios(params: BuildScenariosParams): ScenarioSpec[] {
  const base = clampAssumptions(params.base);

  const conservativeInvestDelta = params.rules?.conservativeDelta?.investReturnPct
    ?? (params.riskTolerance === "low" ? -2.0 : params.riskTolerance === "mid" ? -3.0 : -4.0);
  const conservativeInflationDelta = params.rules?.conservativeDelta?.inflationPct ?? 0.5;
  const conservativeCashDelta = params.rules?.conservativeDelta?.cashReturnPct ?? -0.5;

  const aggressiveInvestDelta = params.rules?.aggressiveDelta?.investReturnPct
    ?? (params.riskTolerance === "high" ? 2.0 : params.riskTolerance === "mid" ? 1.5 : 1.0);
  const aggressiveInflationDelta = params.rules?.aggressiveDelta?.inflationPct ?? -0.3;
  const aggressiveCashDelta = params.rules?.aggressiveDelta?.cashReturnPct ?? 0;

  const conservative: AssumptionsV2 = clampAssumptions({
    ...base,
    investReturnPct: base.investReturnPct + conservativeInvestDelta,
    inflationPct: base.inflationPct + conservativeInflationDelta,
    cashReturnPct: Math.max(0, base.cashReturnPct + conservativeCashDelta),
  });

  const aggressive: AssumptionsV2 = clampAssumptions({
    ...base,
    investReturnPct: base.investReturnPct + aggressiveInvestDelta,
    inflationPct: Math.max(0, base.inflationPct + aggressiveInflationDelta),
    cashReturnPct: base.cashReturnPct + aggressiveCashDelta,
  });

  return [
    {
      id: "base",
      title: "Base",
      assumptions: base,
    },
    {
      id: "conservative",
      title: "Conservative",
      assumptions: conservative,
    },
    {
      id: "aggressive",
      title: "Aggressive",
      assumptions: aggressive,
    },
  ];
}
