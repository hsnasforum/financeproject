import {
  buildScenarioParams,
  type MonteCarloDistributionSummary,
  type MonteCarloScenarioComparison,
  type ScenarioName,
} from "./monteCarloCore";
import { roundKrw, roundToDigits } from "@/lib/planning/calc/roundingPolicy";

type DraftPatchInput = {
  monthlyIncomeNet?: unknown;
  monthlyEssentialExpenses?: unknown;
  monthlyDiscretionaryExpenses?: unknown;
};

type ScenarioParamsInput = {
  volatilityPct?: unknown;
  periodMonths?: unknown;
  sampleCount?: unknown;
};

export type DraftScenarioSimulationInput = {
  draftPatch?: DraftPatchInput | null;
  scenario?: ScenarioParamsInput | null;
  volatilityPct?: unknown;
  periodMonths?: unknown;
  sampleCount?: unknown;
  seed?: unknown;
};

export type DraftScenarioSimulationResult = {
  summary: {
    mean: number;
    median: number;
    p05: number;
    p25: number;
    p75: number;
    p95: number;
    failureProbability: number;
    failureDefinition: "finalCumulativeNetKrw < 0";
  };
  meta: {
    seed: number;
    sampleCount: number;
    periodMonths: number;
    volatilityPct: number;
  };
  scenarios: Record<ScenarioName, MonteCarloDistributionSummary>;
  comparisons: {
    conservativeVsBase: MonteCarloScenarioComparison;
    aggressiveVsBase: MonteCarloScenarioComparison;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toIntInRange(value: unknown, fallback: number, min: number, max: number): number {
  const rounded = Math.trunc(toFiniteNumber(value, fallback));
  return Math.max(min, Math.min(max, rounded));
}

function toVolatilityPct(value: unknown): number {
  const raw = Math.abs(toFiniteNumber(value, 20));
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(300, roundToDigits(pct, 2)));
}

function normalizeSeed(value: unknown): number {
  return toIntInRange(value, 12345, 0, 0xffffffff) >>> 0;
}

function buildZeroSummary(): DraftScenarioSimulationResult["summary"] {
  return {
    mean: 0,
    median: 0,
    p05: 0,
    p25: 0,
    p75: 0,
    p95: 0,
    failureProbability: 0,
    failureDefinition: "finalCumulativeNetKrw < 0",
  };
}

function buildZeroDistribution(): MonteCarloDistributionSummary {
  return {
    mean: 0,
    median: 0,
    p05: 0,
    p25: 0,
    p75: 0,
    p95: 0,
    failureProbability: 0,
  };
}

function buildZeroComparisons(): DraftScenarioSimulationResult["comparisons"] {
  return {
    conservativeVsBase: {
      deltaMean: 0,
      deltaMedian: 0,
      deltaP05: 0,
      deltaP95: 0,
      deltaFailureProbability: 0,
    },
    aggressiveVsBase: {
      deltaMean: 0,
      deltaMedian: 0,
      deltaP05: 0,
      deltaP95: 0,
      deltaFailureProbability: 0,
    },
  };
}

export function simulateDraftScenario(input: DraftScenarioSimulationInput): DraftScenarioSimulationResult {
  const draftPatch = isRecord(input.draftPatch) ? input.draftPatch : {};
  const scenario = isRecord(input.scenario) ? input.scenario : {};

  const normalizedPatch = {
    monthlyIncomeNet: roundKrw(toFiniteNumber(draftPatch.monthlyIncomeNet, 0)),
    monthlyEssentialExpenses: roundKrw(toFiniteNumber(draftPatch.monthlyEssentialExpenses, 0)),
    monthlyDiscretionaryExpenses: roundKrw(toFiniteNumber(draftPatch.monthlyDiscretionaryExpenses, 0)),
  };

  const volatilityPct = scenario.volatilityPct ?? input.volatilityPct;
  const sampleCount = scenario.sampleCount ?? input.sampleCount;
  const periodMonths = scenario.periodMonths ?? input.periodMonths;

  const simulated = buildScenarioParams({
    draftPatch: normalizedPatch,
    volatilityPct,
    sampleCount,
    periodMonths,
    seed: input.seed,
  });

  if (!simulated.ok) {
    const zeroSummary = buildZeroSummary();
    const zeroDistribution = buildZeroDistribution();
    return {
      summary: zeroSummary,
      meta: {
        seed: normalizeSeed(input.seed),
        sampleCount: toIntInRange(sampleCount, 2000, 100, 20000),
        periodMonths: toIntInRange(periodMonths, 120, 1, 600),
        volatilityPct: toVolatilityPct(volatilityPct),
      },
      scenarios: {
        conservative: { ...zeroDistribution },
        base: { ...zeroDistribution },
        aggressive: { ...zeroDistribution },
      },
      comparisons: buildZeroComparisons(),
    };
  }

  const base = simulated.data.scenarios.base;
  return {
    summary: {
      mean: base.mean,
      median: base.median,
      p05: base.p05,
      p25: base.p25,
      p75: base.p75,
      p95: base.p95,
      failureProbability: base.failureProbability,
      failureDefinition: "finalCumulativeNetKrw < 0",
    },
    meta: {
      seed: simulated.data.seed,
      sampleCount: simulated.data.sampleCount,
      periodMonths: simulated.data.periodMonths,
      volatilityPct: simulated.data.baseVolatilityPct,
    },
    scenarios: simulated.data.scenarios,
    comparisons: simulated.data.comparisons,
  };
}
