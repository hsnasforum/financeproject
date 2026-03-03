import { parseCsvTransactions, type ParseCsvTransactionsOptions } from "./csvProvider";
import { type CsvColumnMapping } from "./types";

export type CsvPreviewRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

export type CsvPreviewResult = {
  rows: CsvPreviewRow[];
  stats: {
    total: number;
    ok: number;
    failed: number;
    inferredMonths?: number;
  };
};

export type PreviewCsvInput = {
  csvText: string;
  mapping: CsvColumnMapping;
  maxRows?: number;
};

const DEFAULT_MAX_ROWS = 30;

function clampMaxRows(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_ROWS;
  const rounded = Math.trunc(numeric);
  if (rounded < 1) return DEFAULT_MAX_ROWS;
  return Math.min(rounded, 50);
}

function buildPreviewCsvText(csvText: string, maxRows: number): string {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 1) return "";
  const head = lines[0] ?? "";
  const body = lines.slice(1).filter((line) => line.trim().length > 0).slice(0, maxRows);
  return [head, ...body].join("\n");
}

function toFailureReason(code: string, field: string | undefined): string {
  const normalizedField = (field ?? "row").trim() || "row";
  if (code === "CSV_ENCODING") return "인코딩 오류 가능성";
  if (code === "INVALID_DATE") return `${normalizedField} 형식 오류`;
  if (code === "INVALID_AMOUNT") return `${normalizedField} 형식 오류`;
  if (code === "MISSING_COLUMN") return `${normalizedField} 컬럼 누락`;
  return `${normalizedField} 파싱 실패`;
}

export function maskPreviewDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;

  const masked = trimmed
    .replace(/[A-Za-z0-9_]{3,}/g, "***")
    .replace(/\d+/g, "***")
    .replace(/\*{4,}/g, "***");

  if (masked.length <= 24) return masked;
  return `${masked.slice(0, 24)}...`;
}

function mappingToParseOptions(mapping: CsvColumnMapping): ParseCsvTransactionsOptions["mapping"] {
  return {
    ...(mapping.dateKey ? { dateKey: mapping.dateKey } : {}),
    ...(mapping.amountKey ? { amountKey: mapping.amountKey } : {}),
    ...(mapping.inflowKey ? { inflowKey: mapping.inflowKey } : {}),
    ...(mapping.outflowKey ? { outflowKey: mapping.outflowKey } : {}),
    ...(mapping.descKey ? { descKey: mapping.descKey } : {}),
  };
}

export function previewCsv(input: PreviewCsvInput): CsvPreviewResult {
  const maxRows = clampMaxRows(input.maxRows);
  const previewCsvText = buildPreviewCsvText(input.csvText, maxRows);

  if (!previewCsvText.trim()) {
    return {
      rows: [],
      stats: {
        total: 0,
        ok: 0,
        failed: 0,
      },
    };
  }

  const parsed = parseCsvTransactions(previewCsvText, {
    mapping: mappingToParseOptions(input.mapping),
    hasHeader: true,
  });

  const byRow = new Map<number, {
    dateIso: string;
    amountKrw: number;
    descMasked?: string;
  }>();
  for (const tx of parsed.transactions) {
    const rowIndex = tx.meta?.rowIndex;
    if (typeof rowIndex !== "number") continue;
    const maskedDescription = maskPreviewDescription(tx.description);
    byRow.set(rowIndex, {
      dateIso: tx.date,
      amountKrw: tx.amountKrw,
      ...(maskedDescription ? { descMasked: maskedDescription } : {}),
    });
  }

  const byError = new Map<number, string>();
  for (const error of parsed.errors) {
    if (byError.has(error.rowIndex)) continue;
    const field = error.path[0];
    byError.set(error.rowIndex, toFailureReason(error.code, field));
  }

  const rows: CsvPreviewRow[] = [];
  const total = parsed.stats.rows;
  for (let dataLine = 1; dataLine <= total; dataLine += 1) {
    const success = byRow.get(dataLine);
    if (success) {
      rows.push({
        line: dataLine,
        dateIso: success.dateIso,
        amountKrw: success.amountKrw,
        ...(success.descMasked ? { descMasked: success.descMasked } : {}),
        ok: true,
      });
      continue;
    }

    rows.push({
      line: dataLine,
      ok: false,
      reason: byError.get(dataLine) ?? "row 파싱 실패",
    });
  }

  if (rows.length < 1 && parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    rows.push({
      line: firstError?.rowIndex ?? 0,
      ok: false,
      reason: toFailureReason(firstError?.code ?? "PARSE_FAILED", firstError?.path?.[0]),
    });
  }

  const months = new Set(
    rows
      .filter((row) => row.ok && row.dateIso)
      .map((row) => String(row.dateIso).slice(0, 7)),
  );

  const okCount = rows.filter((row) => row.ok).length;
  const failedCount = rows.length - okCount;

  return {
    rows,
    stats: {
      total: rows.length,
      ok: okCount,
      failed: failedCount,
      ...(months.size > 0 ? { inferredMonths: months.size } : {}),
    },
  };
}
