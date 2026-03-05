import {
  DraftSummaryBandsSchema,
  DraftSummaryInputSchema,
  type CategoricalBand,
  type DraftSummaryBands,
} from "./contracts";

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function classifyByThresholds(value: number | null, mid: number, high: number): CategoricalBand {
  if (value === null) return "unknown";
  if (value >= high) return "high";
  if (value >= mid) return "med";
  return "low";
}

function classifyNet(value: number | null): CategoricalBand {
  if (value === null) return "unknown";
  if (value >= 500_000) return "high";
  if (value >= 0) return "med";
  return "low";
}

function classifyExpensePressure(expense: number | null, income: number | null): CategoricalBand {
  if (expense === null || income === null || income <= 0) return "unknown";
  const ratio = expense / income;
  if (ratio >= 1) return "high";
  if (ratio >= 0.75) return "med";
  return "low";
}

export function extractDraftSummaryBands(input: unknown): DraftSummaryBands {
  const parsed = DraftSummaryInputSchema.safeParse(input ?? {});
  const row = parsed.success ? parsed.data : {};
  const income = toFiniteNumber(row.medianIncomeKrw);
  const expense = toFiniteNumber(row.medianExpenseKrw);
  const net = toFiniteNumber(row.avgNetKrw);

  return DraftSummaryBandsSchema.parse({
    incomeBand: classifyByThresholds(income, 3_000_000, 6_000_000),
    expenseBand: classifyByThresholds(expense, 2_000_000, 4_000_000),
    netBand: classifyNet(net),
    expensePressureBand: classifyExpensePressure(expense, income),
  });
}
