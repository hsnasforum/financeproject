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

function hasErrorCode(
  summary: Array<{ code: string; count: number }>,
  code: string,
): boolean {
  return summary.some((row) => row.code === code);
}

function uniqueFields(errors: Array<{ path?: string[] }>): string[] {
  const out = new Set<string>();
  for (const row of errors) {
    const field = Array.isArray(row.path) ? String(row.path[0] ?? "").trim() : "";
    if (field) out.add(field);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function sampleParseErrors(
  errors: Array<{ rowIndex: number; code: string; path?: string[] }>,
): Array<{ row: number; code: string; field?: string }> {
  return errors
    .slice(0, 5)
    .map((row) => ({
      row: Number.isFinite(row.rowIndex) ? Math.max(0, Math.floor(row.rowIndex)) : 0,
      code: row.code,
      ...(Array.isArray(row.path) && typeof row.path[0] === "string" && row.path[0].trim()
        ? { field: row.path[0].trim() }
        : {}),
    }));
}

export function importCsvToDraft(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ImportCsvToDraftResult {
  const imported = importCsvPipeline(csvText, options);

  if (imported.parsed.errors.length > 0) {
    const parseErrorSummary = summarizeParseErrors(imported.parsed.errors);
    const fields = uniqueFields(imported.parsed.errors);
    const parseErrorRows = sampleParseErrors(imported.parsed.errors);

    let message = "일부 CSV 행을 해석하지 못했습니다.";
    if (hasErrorCode(parseErrorSummary, "MISSING_COLUMN")) {
      message = "CSV 헤더에서 필수 컬럼(date/amount)을 찾지 못했습니다.";
    } else if (hasErrorCode(parseErrorSummary, "INVALID_AMOUNT")) {
      message = "금액 형식을 해석하지 못했습니다.";
    } else if (hasErrorCode(parseErrorSummary, "INVALID_DATE")) {
      message = "날짜 형식을 해석하지 못했습니다.";
    } else if (hasErrorCode(parseErrorSummary, "CSV_ENCODING")) {
      message = "CSV 인코딩을 확인해 주세요.";
    }

    throw new CsvImportInputError(message, {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
      parseErrorSummary,
      ...(fields.length > 0 ? { fields } : {}),
      ...(parseErrorRows.length > 0 ? { parseErrorRows } : {}),
    });
  }

  if (imported.cashflows.length < 1) {
    throw new CsvImportInputError("유효한 거래 행이 없습니다. CSV 헤더/필수 컬럼을 확인해 주세요.", {
      rows: imported.parsed.stats.rows,
      skippedRows: imported.parsed.stats.skipped,
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
      rows: imported.parsed.stats.rows,
      months: imported.cashflows.length,
    },
  };
}
