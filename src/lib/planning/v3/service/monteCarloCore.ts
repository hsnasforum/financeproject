export type ScenarioName = "conservative" | "base" | "aggressive";

type DraftPatchInput = {
  monthlyIncomeNet?: unknown;
  monthlyEssentialExpenses?: unknown;
  monthlyDiscretionaryExpenses?: unknown;
} | null | undefined;

type SummaryInput = {
  avgNetKrw?: unknown;
  medianIncomeKrw?: unknown;
  medianExpenseKrw?: unknown;
} | null | undefined;

export type MonteCarloInput = {
  draftPatch?: DraftPatchInput;
  summary?: SummaryInput;
  volatilityPct?: unknown;
  periodMonths?: unknown;
  sampleCount?: unknown;
  seed?: unknown;
};

export type MonteCarloRunParams = {
  monthlyNetKrw: number;
  periodMonths: number;
  sampleCount: number;
  volatility: number;
  drift: number;
  shockFloor: number;
  shockCap: number;
  failureThresholdKrw: number;
};

export type MonteCarloDistributionSummary = {
  mean: number;
  median: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  failureProbability: number;
};

type ScenarioAssumption = {
  volatility: number;
  drift: number;
  shockFloor: number;
  shockCap: number;
};

export type MonteCarloScenarioComparison = {
  deltaMean: number;
  deltaMedian: number;
  deltaP05: number;
  deltaP95: number;
  deltaFailureProbability: number;
};

export type MonteCarloScenariosResult =
  | {
    ok: true;
    data: {
      seed: number;
      sampleCount: number;
      periodMonths: number;
      baseVolatilityPct: number;
      baselineMonthlyNetKrw: number;
      scenarios: Record<ScenarioName, MonteCarloDistributionSummary>;
      comparisons: {
        conservativeVsBase: MonteCarloScenarioComparison;
        aggressiveVsBase: MonteCarloScenarioComparison;
      };
    };
  }
  | {
    ok: false;
    error: {
      code: "INPUT";
      message: string;
    };
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toIntInRange(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = toFiniteNumber(value);
  const rounded = Math.trunc(numeric ?? fallback);
  return Math.max(min, Math.min(max, rounded));
}

function normalizeSeed(value: unknown): number {
  return toIntInRange(value, 12345, 0, 0xffffffff) >>> 0;
}

function normalizeVolatilityRate(value: unknown): number {
  const numeric = Math.abs(toFiniteNumber(value) ?? 20);
  const asRate = numeric <= 1 ? numeric : numeric / 100;
  return Math.max(0, Math.min(3, asRate));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length < 1) return 0;
  const idx = (sorted.length - 1) * q;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower] ?? 0;
  const lo = sorted[lower] ?? 0;
  const hi = sorted[upper] ?? 0;
  return lo * (1 - (idx - lower)) + hi * (idx - lower);
}

export function createSeededPrng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function createNormalSampler(rng: () => number): () => number {
  let hasSpare = false;
  let spare = 0;
  return () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = rng();
    while (v <= Number.EPSILON) v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    spare = mag * Math.sin(2 * Math.PI * v);
    hasSpare = true;
    return z0;
  };
}

function normalizeRunParams(input: MonteCarloRunParams): MonteCarloRunParams {
  const volatilityRaw = Math.abs(toFiniteNumber(input.volatility) ?? 0.2);
  const driftRaw = toFiniteNumber(input.drift) ?? 0;
  const shockFloorRaw = toFiniteNumber(input.shockFloor) ?? -0.95;
  const shockCapRaw = toFiniteNumber(input.shockCap) ?? 2.5;
  const minShock = Math.min(shockFloorRaw, shockCapRaw);
  const maxShock = Math.max(shockFloorRaw, shockCapRaw);
  return {
    monthlyNetKrw: Math.round(toFiniteNumber(input.monthlyNetKrw) ?? 0),
    periodMonths: toIntInRange(input.periodMonths, 120, 1, 600),
    sampleCount: toIntInRange(input.sampleCount, 2000, 100, 20000),
    volatility: Math.max(0, Math.min(3, volatilityRaw)),
    drift: Math.max(-0.5, Math.min(0.5, driftRaw)),
    shockFloor: Math.max(-0.99, minShock),
    shockCap: Math.min(5, maxShock),
    failureThresholdKrw: Math.round(toFiniteNumber(input.failureThresholdKrw) ?? 0),
  };
}

export function monteCarloRun(params: MonteCarloRunParams, seed: number): MonteCarloDistributionSummary {
  const normalized = normalizeRunParams(params);
  const rng = createSeededPrng(normalizeSeed(seed));
  const normal = createNormalSampler(rng);
  const outcomes: number[] = [];
  let failures = 0;

  for (let path = 0; path < normalized.sampleCount; path += 1) {
    let cumulative = 0;
    for (let month = 0; month < normalized.periodMonths; month += 1) {
      const randomShock = normal() * normalized.volatility + normalized.drift;
      const boundedShock = Math.max(normalized.shockFloor, Math.min(normalized.shockCap, randomShock));
      cumulative += normalized.monthlyNetKrw * (1 + boundedShock);
    }
    const rounded = Math.round(cumulative);
    outcomes.push(rounded);
    if (rounded < normalized.failureThresholdKrw) failures += 1;
  }

  const sorted = [...outcomes].sort((a, b) => a - b);
  const mean = Math.round(outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length);
  const failureProbability = Math.round((failures / outcomes.length) * 1_000_000) / 1_000_000;
  return {
    mean,
    median: Math.round(quantile(sorted, 0.5)),
    p05: Math.round(quantile(sorted, 0.05)),
    p25: Math.round(quantile(sorted, 0.25)),
    p75: Math.round(quantile(sorted, 0.75)),
    p95: Math.round(quantile(sorted, 0.95)),
    failureProbability,
  };
}

function buildScenarioAssumptions(baseVolatilityRate: number): Record<ScenarioName, ScenarioAssumption> {
  return {
    conservative: {
      volatility: Math.max(0.01, baseVolatilityRate * 0.6),
      drift: -0.01,
      shockFloor: -0.5,
      shockCap: 1.5,
    },
    base: {
      volatility: Math.max(0.01, baseVolatilityRate),
      drift: 0,
      shockFloor: -0.75,
      shockCap: 2.5,
    },
    aggressive: {
      volatility: Math.max(0.01, baseVolatilityRate * 1.6),
      drift: 0.01,
      shockFloor: -0.9,
      shockCap: 3.5,
    },
  };
}

function buildScenarioRunParams(
  monthlyNetKrw: number,
  sampleCount: number,
  periodMonths: number,
  assumption: ScenarioAssumption,
): MonteCarloRunParams {
  return {
    monthlyNetKrw,
    sampleCount,
    periodMonths,
    ...assumption,
    failureThresholdKrw: 0,
  };
}

export function createConservativeScenarioParams(
  monthlyNetKrw: number,
  sampleCount: number,
  periodMonths: number,
  baseVolatilityRate = 0.2,
): MonteCarloRunParams {
  return buildScenarioRunParams(
    monthlyNetKrw,
    sampleCount,
    periodMonths,
    buildScenarioAssumptions(baseVolatilityRate).conservative,
  );
}

export function createBaseScenarioParams(
  monthlyNetKrw: number,
  sampleCount: number,
  periodMonths: number,
  baseVolatilityRate = 0.2,
): MonteCarloRunParams {
  return buildScenarioRunParams(
    monthlyNetKrw,
    sampleCount,
    periodMonths,
    buildScenarioAssumptions(baseVolatilityRate).base,
  );
}

export function createAggressiveScenarioParams(
  monthlyNetKrw: number,
  sampleCount: number,
  periodMonths: number,
  baseVolatilityRate = 0.2,
): MonteCarloRunParams {
  return buildScenarioRunParams(
    monthlyNetKrw,
    sampleCount,
    periodMonths,
    buildScenarioAssumptions(baseVolatilityRate).aggressive,
  );
}

function deriveBaselineMonthlyNet(draftPatch: DraftPatchInput, summary: SummaryInput): number | null {
  const patch = isRecord(draftPatch) ? draftPatch : {};
  const income = toFiniteNumber(patch.monthlyIncomeNet);
  const essential = toFiniteNumber(patch.monthlyEssentialExpenses);
  const discretionary = toFiniteNumber(patch.monthlyDiscretionaryExpenses);
  const fromPatch = income !== null || essential !== null || discretionary !== null
    ? Math.round((income ?? 0) - (essential ?? 0) - (discretionary ?? 0))
    : null;
  if (fromPatch !== null) return fromPatch;

  const summaryRecord = isRecord(summary) ? summary : {};
  const avgNet = toFiniteNumber(summaryRecord.avgNetKrw);
  if (avgNet !== null) return Math.round(avgNet);

  const medianIncome = toFiniteNumber(summaryRecord.medianIncomeKrw);
  const medianExpense = toFiniteNumber(summaryRecord.medianExpenseKrw);
  if (medianIncome !== null || medianExpense !== null) {
    return Math.round((medianIncome ?? 0) - Math.abs(medianExpense ?? 0));
  }
  return null;
}

function compareAgainstBase(
  target: MonteCarloDistributionSummary,
  base: MonteCarloDistributionSummary,
): MonteCarloScenarioComparison {
  return {
    deltaMean: target.mean - base.mean,
    deltaMedian: target.median - base.median,
    deltaP05: target.p05 - base.p05,
    deltaP95: target.p95 - base.p95,
    deltaFailureProbability: Math.round((target.failureProbability - base.failureProbability) * 1_000_000) / 1_000_000,
  };
}

export function buildScenarioParams(input: MonteCarloInput): MonteCarloScenariosResult {
  const baselineMonthlyNetKrw = deriveBaselineMonthlyNet(input.draftPatch, input.summary);
  if (baselineMonthlyNetKrw === null) {
    return {
      ok: false,
      error: {
        code: "INPUT",
        message: "draftPatch 또는 summary의 유효한 숫자 입력이 필요합니다.",
      },
    };
  }

  const sampleCount = toIntInRange(input.sampleCount, 2000, 100, 20000);
  const periodMonths = toIntInRange(input.periodMonths, 120, 1, 600);
  const baseVolatilityRate = normalizeVolatilityRate(input.volatilityPct);
  const seed = normalizeSeed(input.seed);

  const conservative = monteCarloRun(
    createConservativeScenarioParams(baselineMonthlyNetKrw, sampleCount, periodMonths, baseVolatilityRate),
    seed + 101,
  );
  const base = monteCarloRun(
    createBaseScenarioParams(baselineMonthlyNetKrw, sampleCount, periodMonths, baseVolatilityRate),
    seed + 202,
  );
  const aggressive = monteCarloRun(
    createAggressiveScenarioParams(baselineMonthlyNetKrw, sampleCount, periodMonths, baseVolatilityRate),
    seed + 303,
  );

  return {
    ok: true,
    data: {
      seed,
      sampleCount,
      periodMonths,
      baseVolatilityPct: Math.round(baseVolatilityRate * 10000) / 100,
      baselineMonthlyNetKrw,
      scenarios: {
        conservative,
        base,
        aggressive,
      },
      comparisons: {
        conservativeVsBase: compareAgainstBase(conservative, base),
        aggressiveVsBase: compareAgainstBase(aggressive, base),
      },
    },
  };
}
