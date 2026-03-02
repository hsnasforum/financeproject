import { type ParseCsvTransactionsOptions } from "../providers/csv/csvProvider";
import { importCsvToDraft as importCsvPipeline } from "./importCsvDraft";

export type ImportCsvToDraftResult = {
  cashflow: ReturnType<typeof importCsvPipeline>["cashflows"];
  draftPatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
  meta: {
    rows: number;
    months: number;
  };
};

export class CsvImportInputError extends Error {
  readonly code = "INPUT";
  readonly meta?: Record<string, unknown>;

  constructor(message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = "CsvImportInputError";
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

  if (imported.parsed.errors.length > 0) {
    throw new CsvImportInputError("일부 CSV 행을 해석하지 못했습니다.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
      parseErrorSummary: summarizeParseErrors(imported.parsed.errors),
    });
  }

  if (imported.cashflows.length < 1) {
    throw new CsvImportInputError("유효한 거래 행이 없습니다.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
    });
  }

  return {
    cashflow: imported.cashflows,
    draftPatch: {
      monthlyIncomeNet: imported.draft.monthlyIncomeNet,
      monthlyEssentialExpenses: imported.draft.monthlyEssentialExpenses,
      monthlyDiscretionaryExpenses: imported.draft.monthlyDiscretionaryExpenses,
    },
    meta: {
      rows: imported.parsed.stats.rows,
      months: imported.cashflows.length,
    },
  };
}
