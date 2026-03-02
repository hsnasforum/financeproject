import { type ProfileV2 } from "./types";

export type ScenarioPatchOp = "set" | "add" | "multiply";

export type ScenarioPatch = {
  path: string;
  op: ScenarioPatchOp;
  value: number;
};

export type ScenarioMeta = {
  id: string;
  name: string;
  templateId?: string;
  baselineRunId?: string;
  createdAt: string;
  patches: ScenarioPatch[];
};

export type ScenarioValidationIssue = {
  path: string;
  message: string;
  code: "SCENARIO_PATCH_INVALID" | "SCENARIO_PATH_INVALID" | "SCENARIO_VALUE_INVALID";
};

type NumericTarget = {
  kind: "root" | "debt";
  path: string;
  value: number;
  apply: (next: number) => void;
};

export type RunDeltaMetric = {
  key:
    | "monthlySurplusKrw"
    | "dsrPct"
    | "emergencyFundMonths"
    | "endNetWorthKrw"
    | "worstCashKrw"
    | "totalWarnings"
    | "criticalWarnings";
  label: string;
  baseline: number;
  scenario: number;
  delta: number;
};

export type RunDeltaSummary = {
  baselineRunId: string;
  scenarioRunId: string;
  metrics: RunDeltaMetric[];
  warnings: {
    added: string[];
    removed: string[];
  };
  goals: {
    achievedBaseline: number;
    achievedScenario: number;
    achievedDelta: number;
  };
};

type ReportComparable = {
  header: { runId: string };
  summaryCards: {
    monthlySurplusKrw?: number;
    dsrPct?: number;
    emergencyFundMonths?: number;
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    totalWarnings?: number;
    criticalWarnings?: number;
  };
  warningAgg: Array<{ code: string }>;
  goalsTable: Array<{ achieved: boolean }>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function splitPath(path: string): string[] {
  const normalized = asString(path);
  if (!normalized.startsWith("/")) return [];
  return normalized.split("/").filter((part) => part.length > 0);
}

function resolveNumericTarget(profile: ProfileV2, path: string): NumericTarget | null {
  const tokens = splitPath(path);
  if (tokens.length === 1) {
    const key = tokens[0];
    if (
      key === "monthlyIncomeNet"
      || key === "monthlyEssentialExpenses"
      || key === "monthlyDiscretionaryExpenses"
      || key === "liquidAssets"
      || key === "investmentAssets"
    ) {
      const current = asFiniteNumber((profile as Record<string, unknown>)[key]);
      if (current === null) return null;
      return {
        kind: "root",
        path,
        value: current,
        apply: (next) => {
          (profile as Record<string, unknown>)[key] = next;
        },
      };
    }
    return null;
  }

  if (tokens.length === 3 && tokens[0] === "debts" && tokens[2] === "minimumPayment") {
    const debtId = tokens[1];
    const debt = profile.debts.find((row) => row.id === debtId);
    if (!debt) return null;
    const current = asFiniteNumber(debt.minimumPayment);
    if (current === null) return null;
    return {
      kind: "debt",
      path,
      value: current,
      apply: (next) => {
        debt.minimumPayment = next;
      },
    };
  }

  return null;
}

function applyNumericOperation(base: number, op: ScenarioPatchOp, value: number): number {
  if (op === "set") return value;
  if (op === "add") return base + value;
  return base * value;
}

function validatePatchShape(patch: unknown, index: number): ScenarioValidationIssue[] {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return [{
      code: "SCENARIO_PATCH_INVALID",
      path: `/patches/${index}`,
      message: "patch는 객체여야 합니다.",
    }];
  }
  const row = patch as Record<string, unknown>;
  const op = asString(row.op) as ScenarioPatchOp;
  const path = asString(row.path);
  const value = asFiniteNumber(row.value);
  const issues: ScenarioValidationIssue[] = [];

  if (!path.startsWith("/")) {
    issues.push({
      code: "SCENARIO_PATCH_INVALID",
      path: `/patches/${index}/path`,
      message: "path는 '/'로 시작해야 합니다.",
    });
  }
  if (!(op === "set" || op === "add" || op === "multiply")) {
    issues.push({
      code: "SCENARIO_PATCH_INVALID",
      path: `/patches/${index}/op`,
      message: "op는 set/add/multiply 중 하나여야 합니다.",
    });
  }
  if (value === null) {
    issues.push({
      code: "SCENARIO_PATCH_INVALID",
      path: `/patches/${index}/value`,
      message: "value는 유한 숫자여야 합니다.",
    });
  }
  return issues;
}

export function validateScenario(profile: ProfileV2, patches: ScenarioPatch[]): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];
  const nextProfile = safeClone(profile);
  const rows = Array.isArray(patches) ? patches : [];

  rows.forEach((patch, index) => {
    issues.push(...validatePatchShape(patch, index));
    const path = asString(patch?.path);
    const op = asString(patch?.op) as ScenarioPatchOp;
    const value = asFiniteNumber(patch?.value);
    if (!path || value === null || !(op === "set" || op === "add" || op === "multiply")) return;

    const target = resolveNumericTarget(nextProfile, path);
    if (!target) {
      issues.push({
        code: "SCENARIO_PATH_INVALID",
        path: `/patches/${index}/path`,
        message: "지원하지 않는 patch path입니다. (지원: /monthly*, /liquidAssets, /investmentAssets, /debts/{id}/minimumPayment)",
      });
      return;
    }

    const nextValue = applyNumericOperation(target.value, op, value);
    if (!Number.isFinite(nextValue)) {
      issues.push({
        code: "SCENARIO_VALUE_INVALID",
        path: `/patches/${index}/value`,
        message: "연산 결과가 유효한 숫자가 아닙니다.",
      });
      return;
    }
    if (nextValue < 0) {
      issues.push({
        code: "SCENARIO_VALUE_INVALID",
        path: `/patches/${index}`,
        message: `${target.path} 결과는 0 이상이어야 합니다.`,
      });
      return;
    }
    target.apply(nextValue);
  });

  return issues;
}

export function applyScenario(profile: ProfileV2, patches: ScenarioPatch[]): ProfileV2 {
  const issues = validateScenario(profile, patches);
  if (issues.length > 0) {
    const message = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`SCENARIO_INVALID: ${message}`);
  }
  const next = safeClone(profile);
  for (const patch of patches) {
    const target = resolveNumericTarget(next, patch.path);
    if (!target) continue;
    target.apply(applyNumericOperation(target.value, patch.op, patch.value));
  }
  return next;
}

function metricLabel(key: RunDeltaMetric["key"]): string {
  if (key === "monthlySurplusKrw") return "월 잉여현금";
  if (key === "dsrPct") return "DSR";
  if (key === "emergencyFundMonths") return "비상금(개월)";
  if (key === "endNetWorthKrw") return "말기 순자산";
  if (key === "worstCashKrw") return "최저 현금";
  if (key === "totalWarnings") return "총 경고 수";
  return "치명 경고 수";
}

function metricValue(row: ReportComparable, key: RunDeltaMetric["key"]): number {
  const value = row.summaryCards[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function warningCodes(row: ReportComparable): Set<string> {
  return new Set(
    row.warningAgg
      .map((warning) => asString(warning.code))
      .filter((code) => code.length > 0),
  );
}

function achievedGoalsCount(row: ReportComparable): number {
  return row.goalsTable.filter((goal) => goal.achieved === true).length;
}

export function computeRunDelta(baseReportVM: ReportComparable, scenReportVM: ReportComparable): RunDeltaSummary {
  const keys: RunDeltaMetric["key"][] = [
    "monthlySurplusKrw",
    "dsrPct",
    "emergencyFundMonths",
    "endNetWorthKrw",
    "worstCashKrw",
    "totalWarnings",
    "criticalWarnings",
  ];

  const metrics = keys.map((key) => {
    const baseline = metricValue(baseReportVM, key);
    const scenario = metricValue(scenReportVM, key);
    return {
      key,
      label: metricLabel(key),
      baseline,
      scenario,
      delta: scenario - baseline,
    } satisfies RunDeltaMetric;
  });

  const baseWarnings = warningCodes(baseReportVM);
  const scenWarnings = warningCodes(scenReportVM);

  return {
    baselineRunId: baseReportVM.header.runId,
    scenarioRunId: scenReportVM.header.runId,
    metrics,
    warnings: {
      added: [...scenWarnings].filter((code) => !baseWarnings.has(code)).sort((a, b) => a.localeCompare(b)),
      removed: [...baseWarnings].filter((code) => !scenWarnings.has(code)).sort((a, b) => a.localeCompare(b)),
    },
    goals: {
      achievedBaseline: achievedGoalsCount(baseReportVM),
      achievedScenario: achievedGoalsCount(scenReportVM),
      achievedDelta: achievedGoalsCount(scenReportVM) - achievedGoalsCount(baseReportVM),
    },
  };
}

