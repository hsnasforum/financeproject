export const PLANNING_RUN_INPUT_CONTRACT = {
  horizonMonths: {
    min: 1,
    max: 1200,
  },
  monteCarloPaths: {
    min: 1,
    max: 20000,
    defaultValue: 2000,
  },
  monteCarloSeed: {
    defaultValue: 12345,
  },
  maxCandidatesPerAction: {
    min: 1,
    max: 20,
  },
} as const;

function parseIntegerLike(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function isPlanningRunHorizonMonths(value: unknown): value is number {
  const parsed = parseIntegerLike(value);
  return parsed !== null
    && parsed >= PLANNING_RUN_INPUT_CONTRACT.horizonMonths.min
    && parsed <= PLANNING_RUN_INPUT_CONTRACT.horizonMonths.max;
}

export function parsePlanningRunHorizonMonthsText(value: string): number | null {
  const parsed = parseIntegerLike(value);
  return isPlanningRunHorizonMonths(parsed) ? parsed : null;
}

export function parsePlanningRunMonteCarloPaths(value: unknown): number | null {
  const parsed = parseIntegerLike(value);
  return parsed !== null
    && parsed >= PLANNING_RUN_INPUT_CONTRACT.monteCarloPaths.min
    && parsed <= PLANNING_RUN_INPUT_CONTRACT.monteCarloPaths.max
    ? parsed
    : null;
}

export function parsePlanningRunMonteCarloSeed(value: unknown): number | null {
  const parsed = parseIntegerLike(value);
  return parsed !== null ? parsed >>> 0 : null;
}

export function parsePlanningRunMaxCandidatesPerAction(value: unknown): number | null {
  const parsed = parseIntegerLike(value);
  return parsed !== null
    && parsed >= PLANNING_RUN_INPUT_CONTRACT.maxCandidatesPerAction.min
    && parsed <= PLANNING_RUN_INPUT_CONTRACT.maxCandidatesPerAction.max
    ? parsed
    : null;
}
