import { roundKrw, roundToDigits } from "../../../calc/roundingPolicy";
import { type ActionItemV2 } from "../actions/types";
import { type MonteCarloResult } from "../monteCarlo";
import { type AssumptionsHealthSummary } from "../assumptionsHealth";
import { type DebtStrategyResult } from "../debt/types";
import { type SimulationResultV2 } from "../types";

export type RegressionNormalizedGoal = {
  id: string;
  achieved: boolean;
};

export type RegressionNormalizedOutput = {
  simulate: {
    endNetWorthKrw: number;
    worstCashKrw: number;
    warnings: string[];
    goals: RegressionNormalizedGoal[];
  };
  scenarios: {
    baseEndNetWorthKrw: number;
    conservativeEndNetWorthKrw: number;
    aggressiveEndNetWorthKrw: number;
  };
  monteCarlo?: {
    retirementDepletionBeforeEnd: number;
    endNetWorthP50Krw: number;
  };
  actions: {
    codes: string[];
  };
  health?: {
    criticalCount: number;
    warnings: string[];
  };
  debtStrategy?: {
    debtServiceRatio: number;
    interestSavingsDirection: "positive" | "negative" | "mixed" | "none";
  };
};

type NormalizeInput = {
  simulate: SimulationResultV2;
  scenarios: {
    base: SimulationResultV2;
    conservative?: SimulationResultV2;
    aggressive?: SimulationResultV2;
  };
  monteCarlo?: MonteCarloResult;
  actions: ActionItemV2[];
  health?: AssumptionsHealthSummary;
  debtStrategy?: DebtStrategyResult;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundKrw(value);
}

function roundProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundToDigits(value, 3);
}

function safeEndNetWorth(result: SimulationResultV2 | undefined): number {
  const row = result?.timeline?.[result.timeline.length - 1];
  return roundMoney(row?.netWorth ?? 0);
}

function safeWorstCash(result: SimulationResultV2): number {
  if (result.timeline.length === 0) return 0;
  let min = result.timeline[0].liquidAssets;
  for (let i = 1; i < result.timeline.length; i += 1) {
    min = Math.min(min, result.timeline[i].liquidAssets);
  }
  return roundMoney(min);
}

function normalizeCodes(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeGoals(result: SimulationResultV2): RegressionNormalizedGoal[] {
  return result.goalStatus
    .map((goal) => ({
      id: goal.goalId,
      achieved: goal.achieved,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function inferInterestSavingsDirection(result?: DebtStrategyResult): "positive" | "negative" | "mixed" | "none" {
  if (!result?.refinance || result.refinance.length === 0) return "none";
  let hasPositive = false;
  let hasNegative = false;
  for (const row of result.refinance) {
    if (row.interestSavingsKrw > 0) hasPositive = true;
    if (row.interestSavingsKrw < 0) hasNegative = true;
  }
  if (hasPositive && hasNegative) return "mixed";
  if (hasPositive) return "positive";
  if (hasNegative) return "negative";
  return "none";
}

export function normalizeRegressionOutput(input: NormalizeInput): RegressionNormalizedOutput {
  const conservative = input.scenarios.conservative;
  const aggressive = input.scenarios.aggressive;
  const retirementDepletion = input.monteCarlo?.probabilities.retirementDepletionBeforeEnd;
  const endNetWorthP50 = input.monteCarlo?.percentiles.endNetWorthKrw.p50;

  return {
    simulate: {
      endNetWorthKrw: safeEndNetWorth(input.simulate),
      worstCashKrw: safeWorstCash(input.simulate),
      warnings: normalizeCodes(input.simulate.warnings.map((warning) => warning.reasonCode)),
      goals: normalizeGoals(input.simulate),
    },
    scenarios: {
      baseEndNetWorthKrw: safeEndNetWorth(input.scenarios.base),
      conservativeEndNetWorthKrw: safeEndNetWorth(conservative),
      aggressiveEndNetWorthKrw: safeEndNetWorth(aggressive),
    },
    ...(typeof retirementDepletion === "number" && typeof endNetWorthP50 === "number"
      ? {
        monteCarlo: {
          retirementDepletionBeforeEnd: roundProbability(retirementDepletion),
          endNetWorthP50Krw: roundMoney(endNetWorthP50),
        },
      }
      : {}),
    actions: {
      codes: normalizeCodes(input.actions.map((action) => action.code)),
    },
    ...(input.health ? {
      health: {
        criticalCount: Math.max(0, Math.trunc(input.health.criticalCount)),
        warnings: normalizeCodes(input.health.warningCodes),
      },
    } : {}),
    ...(input.debtStrategy ? {
      debtStrategy: {
        debtServiceRatio: roundProbability(input.debtStrategy.meta.debtServiceRatio),
        interestSavingsDirection: inferInterestSavingsDirection(input.debtStrategy),
      },
    } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortWarningEntries(values: unknown[]): unknown[] {
  return [...values].sort((a, b) => {
    const left = isRecord(a)
      ? (typeof a.reasonCode === "string" ? a.reasonCode : typeof a.code === "string" ? a.code : "")
      : "";
    const right = isRecord(b)
      ? (typeof b.reasonCode === "string" ? b.reasonCode : typeof b.code === "string" ? b.code : "")
      : "";
    return left.localeCompare(right);
  });
}

export function normalizePlanResultForTest<T>(input: T): T {
  if (!isRecord(input)) return input;
  const normalized = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;

  const meta = isRecord(normalized.meta) ? normalized.meta : null;
  if (meta) {
    delete meta.generatedAt;
    const snapshot = isRecord(meta.snapshot) ? meta.snapshot : null;
    if (snapshot) {
      delete snapshot.fetchedAt;
    }
  }

  const data = isRecord(normalized.data) ? normalized.data : null;
  if (data) {
    if (Array.isArray(data.warnings)) {
      data.warnings = sortWarningEntries(data.warnings);
    }
    if (Array.isArray(data.healthWarnings)) {
      data.healthWarnings = sortWarningEntries(data.healthWarnings);
    }
    if (Array.isArray(data.actions)) {
      data.actions = [...data.actions]
        .map((entry) => (isRecord(entry) ? entry : {}))
        .sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? "")));
    }
  }

  return normalized as T;
}
