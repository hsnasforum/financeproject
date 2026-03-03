import { parseCsvTransactions } from "./csvProvider";
import { type CsvColumnMapping } from "./types";

export type CsvPreviewRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

export type PreviewCsvResult = {
  rows: CsvPreviewRow[];
  stats: {
    total: number;
    ok: number;
    failed: number;
    inferredMonths?: number;
  };
};

type PreviewCsvInput = {
  csvText: string;
  mapping: Partial<CsvColumnMapping>;
  maxRows?: number;
  accountId?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampRows(value: unknown, fallback = 30): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function mapErrorReason(code: string, path: string[]): string {
  const field = path[0] ?? "field";
  if (code === "INVALID_DATE") return `${field} 파싱 실패`;
  if (code === "INVALID_AMOUNT") return `${field} 파싱 실패`;
  if (code === "MISSING_COLUMN") return `${field} 컬럼 누락`;
  if (code === "CSV_ENCODING") return "CSV 인코딩 문제";
  return "파싱 실패";
}

export function maskPreviewDescription(input: unknown): string | undefined {
  const raw = asString(input);
  if (!raw) return undefined;

  const masked = raw
    .replace(/\s+/g, " ")
    .replace(/\d+/g, "***")
    .replace(/[A-Za-z0-9_]{6,}/g, "***")
    .trim();

  if (!masked) return undefined;
  if (masked.length <= 24) return masked;
  return `${masked.slice(0, 21)}...`;
}

export function previewCsv(input: PreviewCsvInput): PreviewCsvResult {
  const parsed = parseCsvTransactions(input.csvText, {
    hasHeader: true,
    mapping: input.mapping,
    ...(asString(input.accountId) ? { accountId: asString(input.accountId) } : {}),
  });

  const rowLimit = clampRows(input.maxRows, 30);
  const transactionByLine = new Map<number, ReturnType<typeof parseCsvTransactions>["transactions"][number]>();
  for (const tx of parsed.transactions) {
    const line = tx.meta?.rowIndex;
    if (!Number.isFinite(line)) continue;
    const lineNo = Math.max(0, Math.trunc(line as number));
    if (!transactionByLine.has(lineNo)) {
      transactionByLine.set(lineNo, tx);
    }
  }

  const errorByLine = new Map<number, { code: string; path: string[] }>();
  for (const error of parsed.errors) {
    const lineNo = Math.max(0, Math.trunc(error.rowIndex));
    if (!errorByLine.has(lineNo)) {
      errorByLine.set(lineNo, { code: error.code, path: error.path });
    }
  }

  const rows: CsvPreviewRow[] = [];
  const months = new Set<string>();
  const maxLine = Math.min(parsed.stats.rows, rowLimit);
  for (let row = 1; row <= maxLine; row += 1) {
    const tx = transactionByLine.get(row);
    if (tx) {
      const month = tx.date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
      rows.push({
        line: row,
        dateIso: tx.date,
        amountKrw: tx.amountKrw,
        ...(maskPreviewDescription(tx.description) ? { descMasked: maskPreviewDescription(tx.description) } : {}),
        ok: true,
      });
      continue;
    }

    const issue = errorByLine.get(row);
    rows.push({
      line: row,
      ok: false,
      reason: mapErrorReason(issue?.code ?? "UNKNOWN", issue?.path ?? ["field"]),
    });
  }

  return {
    rows,
    stats: {
      total: parsed.stats.rows,
      ok: parsed.stats.parsed,
      failed: parsed.stats.skipped,
      ...(months.size > 0 ? { inferredMonths: months.size } : {}),
    },
  };
}

