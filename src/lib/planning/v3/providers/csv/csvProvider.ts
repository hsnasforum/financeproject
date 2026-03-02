import { type AccountTransaction } from "../../domain/types";

export type CsvColumnRef = string | number;

export type ParseCsvTransactionsOptions = {
  delimiter?: string;
  hasHeader?: boolean;
  mapping?: {
    dateColumn?: CsvColumnRef;
    amountColumn?: CsvColumnRef;
    descColumn?: CsvColumnRef;
    typeColumn?: CsvColumnRef;
    categoryColumn?: CsvColumnRef;
  };
};

export type CsvParseErrorCode = "MISSING_COLUMN" | "INVALID_DATE" | "INVALID_AMOUNT";

export type CsvParseError = {
  rowIndex: number;
  code: CsvParseErrorCode;
  path: string;
};

export type ParseCsvTransactionsResult = {
  transactions: AccountTransaction[];
  stats: {
    rows: number;
    parsed: number;
    skipped: number;
  };
  errors: CsvParseError[];
};

const HEADER_ALIASES = {
  date: ["date", "날짜", "일자", "거래일", "거래일자"],
  amount: ["amount", "금액", "거래금액", "입출금액"],
  description: ["description", "desc", "적요", "내용", "메모", "거래내용"],
  type: ["type", "구분", "거래구분"],
  category: ["category", "카테고리"],
} as const;

const DEFAULT_COLUMN_CANDIDATES = {
  date: ["date"],
  amount: ["amount"],
  description: ["description"],
} as const;

const ALIAS_TO_CANONICAL = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    map.set(normalizeHeaderKey(canonical), canonical);
    for (const alias of aliases) {
      map.set(normalizeHeaderKey(alias), canonical);
    }
  }
  return map;
})();

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"") {
      if (quoted && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((entry) => entry.trim().length > 0)) {
        rows.push(row.map((entry) => entry.trim()));
      }
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  if (row.some((entry) => entry.trim().length > 0)) {
    rows.push(row.map((entry) => entry.trim()));
  }
  return rows;
}

function buildHeaderMap(row: string[]): Map<string, number> {
  const out = new Map<string, number>();
  row.forEach((value, index) => {
    const key = normalizeHeaderKey(value);
    if (!key || out.has(key)) return;
    out.set(key, index);
    const canonicalKey = ALIAS_TO_CANONICAL.get(key);
    if (canonicalKey && !out.has(canonicalKey)) {
      out.set(canonicalKey, index);
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
    if (headerMap && headerMap.has(key)) return headerMap.get(key) ?? null;
    const asNumber = Number(key);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber < rowLength) return asNumber;
  }
  return null;
}

function pickHeaderColumn(
  headerMap: Map<string, number> | null,
  candidates: string[],
): number | null {
  if (!headerMap) return null;
  for (const candidate of candidates) {
    const idx = headerMap.get(candidate.toLowerCase());
    if (typeof idx === "number") return idx;
  }
  return null;
}

function buildStableTransactionId(
  date: string,
  amount: number,
  desc: string | undefined,
  rowIndex: number,
): string {
  const seed = `${date}|${amount}|${desc ?? ""}|${rowIndex}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `csv-${(hash >>> 0).toString(16).padStart(8, "0")}-${rowIndex}`;
}

function toIsoDate(raw: string): `${number}-${number}-${number}` | null {
  const text = raw.trim();
  if (!text) return null;
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
  return `${yyyy}-${mm}-${dd}` as `${number}-${number}-${number}`;
}

function toAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const negativeParen = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/[₩$¥원\s]/g, "")
    .replace(/,/g, "")
    .replace(/^\(|\)$/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  const signed = negativeParen ? -Math.abs(parsed) : parsed;
  return Math.round(signed);
}

export function parseCsvTransactions(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ParseCsvTransactionsResult {
  const delimiter = options.delimiter ?? ",";
  const hasHeader = options.hasHeader !== false;
  const rows = splitCsv(csvText, delimiter);

  if (rows.length === 0) {
    return {
      transactions: [],
      stats: { rows: 0, parsed: 0, skipped: 0 },
      errors: [],
    };
  }

  const headerMap = hasHeader ? buildHeaderMap(rows[0]) : null;
  const startRow = hasHeader ? 1 : 0;
  const mapping = options.mapping ?? {};

  const transactions: AccountTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = startRow; i < rows.length; i += 1) {
    const row = rows[i];
    const rowIndex = i;

    const dateIndex = resolveRefIndex(mapping.dateColumn, headerMap, row.length)
      ?? pickHeaderColumn(headerMap, [...DEFAULT_COLUMN_CANDIDATES.date])
      ?? (!hasHeader && row.length > 0 ? 0 : null);
    const amountIndex = resolveRefIndex(mapping.amountColumn, headerMap, row.length)
      ?? pickHeaderColumn(headerMap, [...DEFAULT_COLUMN_CANDIDATES.amount])
      ?? (!hasHeader && row.length > 1 ? 1 : null);
    const descIndex = resolveRefIndex(mapping.descColumn, headerMap, row.length)
      ?? pickHeaderColumn(headerMap, [...DEFAULT_COLUMN_CANDIDATES.description])
      ?? (!hasHeader && row.length > 2 ? 2 : null);

    if (dateIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: "date" });
      continue;
    }
    if (amountIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: "amount" });
      continue;
    }

    const date = toIsoDate(row[dateIndex] ?? "");
    if (!date) {
      errors.push({ rowIndex, code: "INVALID_DATE", path: "date" });
      continue;
    }

    const amount = toAmount(row[amountIndex] ?? "");
    if (amount === null) {
      errors.push({ rowIndex, code: "INVALID_AMOUNT", path: "amount" });
      continue;
    }

    const desc = descIndex !== null ? (row[descIndex] ?? "").trim() || undefined : undefined;
    transactions.push({
      id: buildStableTransactionId(date, amount, desc, rowIndex),
      date,
      amount,
      ...(desc ? { desc } : {}),
      source: "csv",
      meta: { rowIndex },
    });
  }

  const stats = {
    rows: Math.max(0, rows.length - startRow),
    parsed: transactions.length,
    skipped: errors.length,
  };

  return { transactions, stats, errors };
}
