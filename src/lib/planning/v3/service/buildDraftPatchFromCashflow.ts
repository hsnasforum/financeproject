import { type ProfileV2 } from "../../v2/types";
import {
  type CashflowDraftPatch,
  type DraftSplitMode,
  type EvidenceRow,
  type MonthlyCashflow,
} from "../domain/types";

export type BuildDraftPatchFromCashflowResult = {
  draftPatch: CashflowDraftPatch;
  profilePatch: Pick<ProfileV2, "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses">;
};

export type BuildDraftPatchFromCashflowOptions = {
  splitMode?: DraftSplitMode;
  fixedRatio?: number;
  variableRatio?: number;
};

type NormalizedSplitOptions = {
  splitMode: DraftSplitMode;
  fixedRatio?: number;
  variableRatio?: number;
};

function medianRounded(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle]);
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function toRecentMonths(input: MonthlyCashflow[]): MonthlyCashflow[] {
  return [...input]
    .sort((left, right) => {
      const leftKey = left.month ?? left.ym;
      const rightKey = right.month ?? right.ym;
      return leftKey.localeCompare(rightKey);
    })
    .slice(-3);
}

function pickConfidence(months: MonthlyCashflow[]): "high" | "mid" | "low" {
  if (months.length < 1) return "low";
  const partial = months.some((row) => typeof row.daysCovered === "number" && row.daysCovered < 20);
  if (partial) return "low";
  if (months.length < 3) return "mid";
  return "high";
}

function normalizeRatio(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 1) return null;
  return parsed;
}

function normalizeSplitOptions(options: BuildDraftPatchFromCashflowOptions = {}): NormalizedSplitOptions {
  const splitMode = options.splitMode ?? "byCategory";
  if (splitMode !== "byCategory" && splitMode !== "byRatio" && splitMode !== "noSplit") {
    throw new Error("Invalid split mode");
  }

  if (splitMode !== "byRatio") {
    return { splitMode };
  }

  const fixedRatio = normalizeRatio(options.fixedRatio);
  const variableRatio = normalizeRatio(options.variableRatio);
  if (fixedRatio === null || variableRatio === null) {
    throw new Error("Invalid split ratio");
  }
  if (Math.abs((fixedRatio + variableRatio) - 1) > 0.000001) {
    throw new Error("Invalid split ratio");
  }

  return {
    splitMode,
    fixedRatio,
    variableRatio,
  };
}

function buildEvidenceRows(input: {
  months: MonthlyCashflow[];
  split: NormalizedSplitOptions;
  medianIncome: number;
  medianOutflow: number;
  essential: number;
  discretionary: number;
  medianFixed: number;
  medianVariable: number;
}): EvidenceRow[] {
  const sampleMonths = input.months.length;
  const splitAssumption = input.split.splitMode === "byRatio"
    ? `split mode byRatio (fixed=${Math.round((input.split.fixedRatio ?? 0) * 100)}%, variable=${Math.round((input.split.variableRatio ?? 0) * 100)}%)`
    : input.split.splitMode === "noSplit"
      ? "split mode noSplit (전체 지출을 재량지출로 처리)"
      : "split mode byCategory (rule-based categorization)";

  const essentialFormula = input.split.splitMode === "byRatio"
    ? "essential = median(recent3.outflowKrw) * fixedRatio"
    : input.split.splitMode === "noSplit"
      ? "essential = 0"
      : "essential = median(recent3.fixedOutflowKrw)";

  const discretionaryFormula = input.split.splitMode === "byRatio"
    ? "discretionary = median(recent3.outflowKrw) * variableRatio"
    : input.split.splitMode === "noSplit"
      ? "discretionary = median(recent3.outflowKrw)"
      : "discretionary = median(recent3.variableOutflowKrw)";

  return [
    {
      key: "monthly_income",
      title: "월평균 소득",
      formula: "income = median(recent3.inflowKrw)",
      inputs: {
        sampleMonths,
        method: "median",
        medianInflowKrw: input.medianIncome,
      },
      assumption: "최근 3개월(가용 범위) 기준",
    },
    {
      key: "monthly_essential_spend",
      title: "월평균 필수지출",
      formula: essentialFormula,
      inputs: {
        sampleMonths,
        medianOutflowKrw: input.medianOutflow,
        medianFixedOutflowKrw: input.medianFixed,
        medianVariableOutflowKrw: input.medianVariable,
        ...(input.split.fixedRatio !== undefined ? { fixedRatio: input.split.fixedRatio } : {}),
        valueKrw: input.essential,
      },
      assumption: splitAssumption,
    },
    {
      key: "monthly_discretionary_spend",
      title: "월평균 변동지출",
      formula: discretionaryFormula,
      inputs: {
        sampleMonths,
        medianOutflowKrw: input.medianOutflow,
        medianVariableOutflowKrw: input.medianVariable,
        ...(input.split.variableRatio !== undefined ? { variableRatio: input.split.variableRatio } : {}),
        valueKrw: input.discretionary,
      },
      assumption: splitAssumption,
    },
  ];
}

export function buildDraftPatchFromCashflow(
  cashflow: MonthlyCashflow[],
  options: BuildDraftPatchFromCashflowOptions = {},
): BuildDraftPatchFromCashflowResult {
  const split = normalizeSplitOptions(options);
  const recent = toRecentMonths(cashflow);

  const medianIncome = medianRounded(recent.map((row) => (
    Number.isFinite(row.inflowKrw) ? Number(row.inflowKrw) : Math.max(0, Number(row.incomeKrw) || 0)
  )));
  const medianOutflow = medianRounded(recent.map((row) => (
    Number.isFinite(row.outflowKrw) ? Number(row.outflowKrw) : Math.max(0, Math.abs(Number(row.expenseKrw) || 0))
  )));
  const medianFixed = medianRounded(recent.map((row) => (
    Number.isFinite(row.fixedOutflowKrw) ? Number(row.fixedOutflowKrw) : 0
  )));
  const medianVariable = medianRounded(recent.map((row) => (
    Number.isFinite(row.variableOutflowKrw)
      ? Number(row.variableOutflowKrw)
      : Math.max(0, Math.abs(Number(row.expenseKrw) || 0) - (Number(row.fixedOutflowKrw) || 0))
  )));

  let suggestedMonthlyEssentialSpendKrw = 0;
  let suggestedMonthlyDiscretionarySpendKrw = 0;

  if (split.splitMode === "byRatio") {
    suggestedMonthlyEssentialSpendKrw = Math.max(0, Math.round(medianOutflow * (split.fixedRatio ?? 0)));
    suggestedMonthlyDiscretionarySpendKrw = Math.max(0, Math.round(medianOutflow * (split.variableRatio ?? 0)));
  } else if (split.splitMode === "noSplit") {
    suggestedMonthlyEssentialSpendKrw = 0;
    suggestedMonthlyDiscretionarySpendKrw = Math.max(0, Math.round(medianOutflow));
  } else {
    suggestedMonthlyEssentialSpendKrw = Math.max(0, Math.round(medianFixed));
    suggestedMonthlyDiscretionarySpendKrw = Math.max(0, Math.round(medianVariable));
  }

  const draftPatch: CashflowDraftPatch = {
    suggestedMonthlyIncomeKrw: medianIncome,
    suggestedMonthlyEssentialSpendKrw,
    suggestedMonthlyDiscretionarySpendKrw,
    confidence: pickConfidence(recent),
    splitMode: split.splitMode,
    ...(split.fixedRatio !== undefined ? { fixedRatio: split.fixedRatio } : {}),
    ...(split.variableRatio !== undefined ? { variableRatio: split.variableRatio } : {}),
    evidence: buildEvidenceRows({
      months: recent,
      split,
      medianIncome,
      medianOutflow,
      essential: suggestedMonthlyEssentialSpendKrw,
      discretionary: suggestedMonthlyDiscretionarySpendKrw,
      medianFixed,
      medianVariable,
    }),
  };

  return {
    draftPatch,
    profilePatch: {
      monthlyIncomeNet: medianIncome,
      monthlyEssentialExpenses: suggestedMonthlyEssentialSpendKrw,
      monthlyDiscretionaryExpenses: suggestedMonthlyDiscretionarySpendKrw,
    },
  };
}
