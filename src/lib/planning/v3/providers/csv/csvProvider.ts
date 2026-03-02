import { type AccountTransaction } from "../../domain/types";
import { parseCsvText, type ParseCsvTextOptions } from "./csvParse";

type CsvColumnRef = string | number;

export type ParseCsvError = {
  rowIndex: number;
  code: string;
  path: string[];
};

export type ParseCsvTransactionsOptions = ParseCsvTextOptions & {
  mapping?: {
    dateColumn?: CsvColumnRef;
    amountColumn?: CsvColumnRef;
    descColumn?: CsvColumnRef;
    descriptionColumn?: CsvColumnRef;
    typeColumn?: CsvColumnRef;
    categoryColumn?: CsvColumnRef;
  };
};

export type ParseCsvTransactionsResult = {
  transactions: AccountTransaction[];
  stats: {
    rows: number;
    parsed: number;
    skipped: number;
  };
  errors: ParseCsvError[];
};

const HEADER_ALIASES = {
  date: ["date", "날짜", "일자", "거래일", "거래일자"],
  amount: ["amount", "금액", "거래금액", "입출금액"],
  description: ["description", "desc", "적요", "내용", "메모", "거래내용", "내역"],
  type: ["type", "구분", "거래구분"],
  category: ["category", "카테고리"],
} as const;

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_/().]/g, "");
}

const ALIAS_TO_CANONICAL = (() => {
  const out = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    out.set(normalizeHeaderKey(canonical), canonical);
    for (const alias of aliases) {
      out.set(normalizeHeaderKey(alias), canonical);
    }
  }
  return out;
})();

function buildHeaderMap(header: string[]): Map<string, number> {
  const out = new Map<string, number>();
  header.forEach((raw, index) => {
    const normalized = normalizeHeaderKey(raw);
    if (!normalized) return;
    if (!out.has(normalized)) out.set(normalized, index);
    const canonical = ALIAS_TO_CANONICAL.get(normalized);
    if (canonical && !out.has(canonical)) {
      out.set(canonical, index);
    }
  });
  return out;
}

function resolveRefIndex(
  ref: CsvColumnRef | undefined,
  headerMap: Map<string, number> | null,
  rowLength: number,
): number | null {
  if (typeof ref === "number") {
    return Number.isInteger(ref) && ref >= 0 && ref < rowLength ? ref : null;
  }
  if (typeof ref === "string") {
    const key = normalizeHeaderKey(ref);
    if (!key) return null;
    if (headerMap?.has(key)) return headerMap.get(key) ?? null;
    const numeric = Number(key);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < rowLength) return numeric;
  }
  return null;
}

function pickHeaderIndex(headerMap: Map<string, number> | null, key: string): number | null {
  if (!headerMap) return null;
  const found = headerMap.get(normalizeHeaderKey(key));
  return typeof found === "number" ? found : null;
}

function normalizeDate(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  if (text.length >= 10 && /[T\s]/.test(text)) {
    text = text.slice(0, 10);
  }

  if (/^\d{8}$/.test(text)) {
    text = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  const normalized = text.replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year
    || dt.getUTCMonth() !== month - 1
    || dt.getUTCDate() !== day
  ) {
    return null;
  }

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const negativeByParen = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/^\(|\)$/g, "")
    .replace(/[₩$¥원,\s]/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  const signed = negativeByParen ? -Math.abs(parsed) : parsed;
  return Math.round(signed);
}

function normalizeAmountByType(amount: number, rawType?: string): number {
  const normalized = normalizeHeaderKey(rawType ?? "");
  if (!normalized) return amount;

  const inflowHints = ["입금", "credit", "deposit", "income", "수입"];
  const outflowHints = ["출금", "debit", "withdrawal", "payment", "지출"];

  if (inflowHints.some((hint) => normalized.includes(hint))) return Math.abs(amount);
  if (outflowHints.some((hint) => normalized.includes(hint))) return -Math.abs(amount);
  return amount;
}

function buildStableTransactionId(
  date: string,
  amountKrw: number,
  description: string | undefined,
  rowIndex: number,
): string {
  const seed = `${date}|${amountKrw}|${description ?? ""}|${rowIndex}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `csv-${(hash >>> 0).toString(16).padStart(8, "0")}-${rowIndex}`;
}

export function parseCsvTransactions(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ParseCsvTransactionsResult {
  const parsed = parseCsvText(csvText, options);
  const headerMap = parsed.header ? buildHeaderMap(parsed.header) : null;
  const mapping = options.mapping ?? {};

  const transactions: AccountTransaction[] = [];
  const errors: ParseCsvError[] = [];

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i] ?? [];
    const rowIndex = i + (parsed.header ? 1 : 0);

    const dateIndex = resolveRefIndex(mapping.dateColumn, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "date")
      ?? (parsed.header ? null : 0);
    const amountIndex = resolveRefIndex(mapping.amountColumn, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "amount")
      ?? (parsed.header ? null : 1);
    const descIndex = resolveRefIndex(mapping.descriptionColumn ?? mapping.descColumn, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "description")
      ?? (parsed.header ? null : 2);
    const typeIndex = resolveRefIndex(mapping.typeColumn, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "type");
    const categoryIndex = resolveRefIndex(mapping.categoryColumn, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "category");

    if (dateIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: ["date"] });
      continue;
    }
    if (amountIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: ["amount"] });
      continue;
    }

    const date = normalizeDate(row[dateIndex] ?? "");
    if (!date) {
      errors.push({ rowIndex, code: "INVALID_DATE", path: ["date"] });
      continue;
    }

    const amountRaw = normalizeAmount(row[amountIndex] ?? "");
    if (amountRaw === null) {
      errors.push({ rowIndex, code: "INVALID_AMOUNT", path: ["amount"] });
      continue;
    }
    const amountKrw = normalizeAmountByType(amountRaw, typeIndex !== null ? row[typeIndex] : undefined);
    const description = descIndex !== null ? (row[descIndex] ?? "").trim() || undefined : undefined;
    const type = typeIndex !== null ? (row[typeIndex] ?? "").trim() || undefined : undefined;
    const category = categoryIndex !== null ? (row[categoryIndex] ?? "").trim() || undefined : undefined;

    transactions.push({
      id: buildStableTransactionId(date, amountKrw, description, rowIndex),
      date,
      amountKrw,
      ...(description ? { description } : {}),
      ...(type ? { type } : {}),
      ...(category ? { category } : {}),
      source: "csv",
      meta: { rowIndex },
    });
  }

  return {
    transactions,
    stats: {
      rows: parsed.rows.length,
      parsed: transactions.length,
      skipped: errors.length,
    },
    errors,
  };
}
