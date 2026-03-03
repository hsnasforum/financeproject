import { type MonthlyCashflow, type ProfileV2DraftPatch } from "../domain/types";

export type ProfileDraftEvidence = {
  monthsUsed: string[];
  stats: {
    sampleMonths: number;
    windowMonths: number;
    incomeMedianKrw: number;
    fixedMedianKrw: number;
    variableMedianKrw: number;
    emergencyFundTargetKrw: number;
  };
  notes: string[];
};

export type BuildProfileDraftEstimateFromCashflowResult = {
  patch: ProfileV2DraftPatch & {
    emergencyFundTargetKrw: number;
  };
  evidence: ProfileDraftEvidence;
};

export type BuildProfileDraftEstimateFromCashflowOptions = {
  recentMonths?: number;
  minMonths?: number;
  maxMonths?: number;
};

export class ProfileDraftFromCashflowInputError extends Error {
  readonly code: "INSUFFICIENT_DATA" | "INVALID_INPUT";

  constructor(message: string, code: "INSUFFICIENT_DATA" | "INVALID_INPUT") {
    super(message);
    this.name = "ProfileDraftFromCashflowInputError";
    this.code = code;
  }
}

type NormalizedMonthRow = {
  ym: string;
  incomeKrw: number;
  fixedOutflowKrw: number;
  variableOutflowKrw: number;
};

function asNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function asYearMonth(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}$/.test(text)) return "";
  return text;
}

function medianRounded(values: number[]): number {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle] ?? 0);
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function clampWindow(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCashflowRows(cashflow: MonthlyCashflow[]): NormalizedMonthRow[] {
  return cashflow
    .map((row) => {
      const ym = asYearMonth(row.ym || row.month);
      if (!ym) return null;

      const fixedOutflowKrw = Math.max(0, asNumber(row.fixedOutflowKrw));
      const variableOutflowKrw = Math.max(0, asNumber(row.variableOutflowKrw));

      return {
        ym,
        incomeKrw: asNumber(row.incomeKrw ?? row.inflowKrw),
        fixedOutflowKrw,
        variableOutflowKrw,
      };
    })
    .filter((row): row is NormalizedMonthRow => Boolean(row))
    .sort((left, right) => left.ym.localeCompare(right.ym));
}

function selectRecentMonths(
  rows: NormalizedMonthRow[],
  windowMonths: number,
): NormalizedMonthRow[] {
  const uniqueByMonth = new Map<string, NormalizedMonthRow>();
  for (const row of rows) {
    uniqueByMonth.set(row.ym, row);
  }
  const sorted = [...uniqueByMonth.values()].sort((left, right) => left.ym.localeCompare(right.ym));
  return sorted.slice(Math.max(0, sorted.length - windowMonths));
}

export function buildProfileDraftEstimateFromCashflow(
  cashflow: MonthlyCashflow[],
  options: BuildProfileDraftEstimateFromCashflowOptions = {},
): BuildProfileDraftEstimateFromCashflowResult {
  const windowMonths = clampWindow(options.recentMonths, 3, 1, clampWindow(options.maxMonths, 6, 1, 12));
  const minMonths = clampWindow(options.minMonths, 3, 1, 12);
  const normalized = normalizeCashflowRows(cashflow);
  const months = selectRecentMonths(normalized, windowMonths);

  if (months.length < minMonths) {
    throw new ProfileDraftFromCashflowInputError(
      `insufficient data: requires at least ${minMonths} months`,
      "INSUFFICIENT_DATA",
    );
  }

  const monthsUsed = months.map((row) => row.ym);
  const incomeMedianKrw = medianRounded(months.map((row) => row.incomeKrw));
  const fixedMedianKrw = medianRounded(months.map((row) => row.fixedOutflowKrw));
  const variableMedianKrw = medianRounded(months.map((row) => row.variableOutflowKrw));
  const emergencyFundTargetKrw = Math.max(0, Math.round(fixedMedianKrw * 3));

  const assumptions = [
    `income estimate uses median of recent ${months.length} months`,
    `essential expense estimate uses fixed median of recent ${months.length} months`,
    `variable expense estimate uses variable median of recent ${months.length} months`,
    "emergency fund target = essential expense x 3 months (assumption)",
    "transfers are excluded from draft estimation",
  ];

  return {
    patch: {
      monthlyIncomeNet: incomeMedianKrw,
      monthlyEssentialExpenses: fixedMedianKrw,
      monthlyDiscretionaryExpenses: variableMedianKrw,
      emergencyFundTargetKrw,
      assumptions,
      monthsConsidered: months.length,
    },
    evidence: {
      monthsUsed,
      stats: {
        sampleMonths: months.length,
        windowMonths,
        incomeMedianKrw,
        fixedMedianKrw,
        variableMedianKrw,
        emergencyFundTargetKrw,
      },
      notes: [
        "estimates from monthly cashflow statistics",
        "debt-related fields are not estimated in this draft",
      ],
    },
  };
}
