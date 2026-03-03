import { type ParseCsvTransactionsOptions } from "../providers/csv/csvProvider";
import { importCsvToDraft as importCsvPipeline } from "./importCsvDraft";

export type ImportCsvToDraftResult = {
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
  meta: {
    rows: number;
    months: number;
    warnings: number;
  };
};

export class CsvImportInputError extends Error {
  readonly code: "INPUT" | "PARSE";
  readonly meta?: Record<string, unknown>;

  constructor(code: "INPUT" | "PARSE", message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = "CsvImportInputError";
    this.code = code;
    this.meta = meta;
  }
}

function summarizeParseErrors(errors: Array<{ code: string }>): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of errors) {
    counts.set(row.code, (counts.get(row.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => ({ code, count }));
}

export function importCsvToDraft(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ImportCsvToDraftResult {
  const imported = importCsvPipeline(csvText, options);

  if (imported.cashflows.length < 1) {
    throw new CsvImportInputError("PARSE", "유효한 거래 행이 없습니다.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
      parseErrorSummary: summarizeParseErrors(imported.parsed.errors),
    });
  }

  return {
    cashflow: imported.cashflows.map((row) => ({
      ym: row.ym,
      incomeKrw: row.incomeKrw,
      expenseKrw: row.expenseKrw,
      netKrw: row.netKrw,
      txCount: row.txCount,
    })),
    draftPatch: {
      monthlyIncomeNet: imported.draft.monthlyIncomeNet,
      monthlyEssentialExpenses: imported.draft.monthlyEssentialExpenses,
      monthlyDiscretionaryExpenses: imported.draft.monthlyDiscretionaryExpenses,
    },
    meta: {
      rows: imported.parsed.stats.parsed,
      months: imported.cashflows.length,
      warnings: imported.parsed.errors.length,
    },
  };
}
