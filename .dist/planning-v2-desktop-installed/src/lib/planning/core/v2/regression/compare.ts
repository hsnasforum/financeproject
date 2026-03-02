import { type RegressionNormalizedOutput } from "./normalize";

export const PROBABILITY_TOLERANCE = 0.03;

export type RegressionFieldDiff = {
  path: string;
  kind: "money" | "probability" | "set" | "goals" | "missing" | "exact";
  expected: unknown;
  actual: unknown;
  tolerance?: number;
  diff?: number;
  added?: string[];
  removed?: string[];
};

export type RegressionCompareResult = {
  ok: boolean;
  diffs: RegressionFieldDiff[];
};

export function moneyTolerance(expected: number): number {
  return Math.max(Math.abs(expected) * 0.01, 100_000);
}

function normalizeStringSet(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function compareMoney(
  path: string,
  expected: unknown,
  actual: unknown,
  diffs: RegressionFieldDiff[],
): void {
  if (typeof expected !== "number" || !Number.isFinite(expected)) {
    diffs.push({
      path,
      kind: "missing",
      expected,
      actual,
    });
    return;
  }
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    diffs.push({
      path,
      kind: "missing",
      expected,
      actual,
    });
    return;
  }

  const tolerance = moneyTolerance(expected);
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    diffs.push({
      path,
      kind: "money",
      expected,
      actual,
      tolerance,
      diff: delta,
    });
  }
}

function compareProbability(
  path: string,
  expected: unknown,
  actual: unknown,
  diffs: RegressionFieldDiff[],
): void {
  if (typeof expected !== "number" || !Number.isFinite(expected)) {
    diffs.push({
      path,
      kind: "missing",
      expected,
      actual,
    });
    return;
  }
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    diffs.push({
      path,
      kind: "missing",
      expected,
      actual,
    });
    return;
  }

  const delta = Math.abs(actual - expected);
  if (delta > PROBABILITY_TOLERANCE) {
    diffs.push({
      path,
      kind: "probability",
      expected,
      actual,
      tolerance: PROBABILITY_TOLERANCE,
      diff: delta,
    });
  }
}

function compareSet(path: string, expected: unknown, actual: unknown, diffs: RegressionFieldDiff[]): void {
  const expectedSet = normalizeStringSet(expected);
  const actualSet = normalizeStringSet(actual);

  const actualValues = new Set(actualSet);
  const expectedValues = new Set(expectedSet);

  const added = actualSet.filter((value) => !expectedValues.has(value));
  const removed = expectedSet.filter((value) => !actualValues.has(value));
  if (added.length > 0 || removed.length > 0) {
    diffs.push({
      path,
      kind: "set",
      expected: expectedSet,
      actual: actualSet,
      added,
      removed,
    });
  }
}

function compareExact(path: string, expected: unknown, actual: unknown, diffs: RegressionFieldDiff[]): void {
  if (expected !== actual) {
    diffs.push({
      path,
      kind: "exact",
      expected,
      actual,
    });
  }
}

function compareGoals(path: string, expected: unknown, actual: unknown, diffs: RegressionFieldDiff[]): void {
  const expectedGoals = Array.isArray(expected) ? expected : [];
  const actualGoals = Array.isArray(actual) ? actual : [];

  const toMap = (goals: unknown[]) => {
    const entries = goals
      .map((goal) => {
        if (!goal || typeof goal !== "object" || Array.isArray(goal)) return null;
        const row = goal as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) return null;
        return [id, row.achieved === true] as const;
      })
      .filter((entry): entry is readonly [string, boolean] => Array.isArray(entry) && entry.length === 2);
    return new Map(entries);
  };

  const expectedMap = toMap(expectedGoals);
  const actualMap = toMap(actualGoals);
  const allIds = Array.from(new Set([...expectedMap.keys(), ...actualMap.keys()])).sort((a, b) => a.localeCompare(b));
  const mismatches: string[] = [];

  for (const id of allIds) {
    if (!expectedMap.has(id) || !actualMap.has(id)) {
      mismatches.push(`${id}:missing`);
      continue;
    }
    if (expectedMap.get(id) !== actualMap.get(id)) {
      mismatches.push(`${id}:${String(expectedMap.get(id))}->${String(actualMap.get(id))}`);
    }
  }

  if (mismatches.length > 0) {
    diffs.push({
      path,
      kind: "goals",
      expected: expectedGoals,
      actual: actualGoals,
      added: mismatches,
      removed: [],
    });
  }
}

export function compareRegressionExpected(
  expected: RegressionNormalizedOutput,
  actual: RegressionNormalizedOutput,
): RegressionCompareResult {
  const diffs: RegressionFieldDiff[] = [];

  compareMoney("simulate.endNetWorthKrw", expected.simulate.endNetWorthKrw, actual.simulate.endNetWorthKrw, diffs);
  compareMoney("simulate.worstCashKrw", expected.simulate.worstCashKrw, actual.simulate.worstCashKrw, diffs);
  compareSet("simulate.warnings", expected.simulate.warnings, actual.simulate.warnings, diffs);
  compareGoals("simulate.goals", expected.simulate.goals, actual.simulate.goals, diffs);

  compareMoney("scenarios.baseEndNetWorthKrw", expected.scenarios.baseEndNetWorthKrw, actual.scenarios.baseEndNetWorthKrw, diffs);
  compareMoney(
    "scenarios.conservativeEndNetWorthKrw",
    expected.scenarios.conservativeEndNetWorthKrw,
    actual.scenarios.conservativeEndNetWorthKrw,
    diffs,
  );
  compareMoney(
    "scenarios.aggressiveEndNetWorthKrw",
    expected.scenarios.aggressiveEndNetWorthKrw,
    actual.scenarios.aggressiveEndNetWorthKrw,
    diffs,
  );

  if (expected.monteCarlo) {
    compareProbability(
      "monteCarlo.retirementDepletionBeforeEnd",
      expected.monteCarlo.retirementDepletionBeforeEnd,
      actual.monteCarlo?.retirementDepletionBeforeEnd,
      diffs,
    );
    compareMoney(
      "monteCarlo.endNetWorthP50Krw",
      expected.monteCarlo.endNetWorthP50Krw,
      actual.monteCarlo?.endNetWorthP50Krw,
      diffs,
    );
  }

  compareSet("actions.codes", expected.actions.codes, actual.actions.codes, diffs);

  if (expected.health) {
    compareExact("health.criticalCount", expected.health.criticalCount, actual.health?.criticalCount, diffs);
    compareSet("health.warnings", expected.health.warnings, actual.health?.warnings, diffs);
  }

  if (expected.debtStrategy) {
    compareProbability(
      "debtStrategy.debtServiceRatio",
      expected.debtStrategy.debtServiceRatio,
      actual.debtStrategy?.debtServiceRatio,
      diffs,
    );
    compareExact(
      "debtStrategy.interestSavingsDirection",
      expected.debtStrategy.interestSavingsDirection,
      actual.debtStrategy?.interestSavingsDirection,
      diffs,
    );
  }

  return {
    ok: diffs.length === 0,
    diffs,
  };
}
