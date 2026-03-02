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
  row: number;
  code: CsvParseErrorCode;
  field: "date" | "amount" | "description";
  message: string;
};

export type ParseCsvTransactionsResult = {
  transactions: AccountTransaction[];
  errors: CsvParseError[];
  stats: {
    totalRows: number;
    parsedRows: number;
    skippedRows: number;
  };
};

const DEFAULT_MAPPING = {
  dateColumn: "date",
  amountColumn: "amount",
  descColumn: "description",
  typeColumn: "type",
  categoryColumn: "category",
} satisfies Required<NonNullable<ParseCsvTransactionsOptions["mapping"]>>;

function splitCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row.map((value) => value.trim()));
      }
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row.map((value) => value.trim()));
  }

  return rows;
}

function buildHeaderMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((value, index) => {
    const key = value.trim().toLowerCase();
    if (!key || map.has(key)) return;
    map.set(key, index);
  });
  return map;
}

function resolveColumnIndex(
  ref: CsvColumnRef,
  headerMap: Map<string, number> | null,
  rowLength: number,
): number | null {
  if (typeof ref === "number") {
    return Number.isInteger(ref) && ref >= 0 && ref < rowLength ? ref : null;
  }

  const key = ref.trim().toLowerCase();
  if (!key) return null;

  if (headerMap) {
    const headerIndex = headerMap.get(key);
    if (typeof headerIndex === "number") return headerIndex;
  }

  const asIndex = Number(key);
  if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < rowLength) {
    return asIndex;
  }

  return null;
}

function parseDateToIsoDay(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  const normalized = text.replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year
    || dt.getUTCMonth() !== month - 1
    || dt.getUTCDate() !== day
  ) {
    return null;
  }

  return dt.toISOString();
}

function parseAmountKrw(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const wrappedNegative = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[₩$¥원\s]/g, "")
    .replace(/,/g, "")
    .replace(/^\(|\)$/g, "");

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return null;

  const signed = wrappedNegative ? -Math.abs(numeric) : numeric;
  const value = Math.round(signed);
  return Object.is(value, -0) ? 0 : value;
}

function resolveDirection(typeValue: string): 1 | -1 | null {
  const text = typeValue.trim().toLowerCase();
  if (!text) return null;

  if (["credit", "inflow", "income", "deposit", "입금", "수입"].includes(text)) return 1;
  if (["debit", "outflow", "expense", "withdrawal", "출금", "지출"].includes(text)) return -1;

  return null;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
}

function buildTransactionId(
  rowNumber: number,
  postedAt: string,
  amountKrw: number,
  description: string,
  category: string | undefined,
): string {
  const payload = `${rowNumber}|${postedAt}|${amountKrw}|${description}|${category ?? ""}`;
  return `csv-${hashString(payload)}`;
}

export function parseCsvTransactions(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ParseCsvTransactionsResult {
  const delimiter = options.delimiter ?? ",";
  const hasHeader = options.hasHeader !== false;
  const mapping = {
    ...DEFAULT_MAPPING,
    ...(options.mapping ?? {}),
  };

  const rows = splitCsvRows(csvText, delimiter);
  if (rows.length === 0) {
    return {
      transactions: [],
      errors: [],
      stats: {
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
      },
    };
  }

  let startIndex = 0;
  let headerMap: Map<string, number> | null = null;

  if (hasHeader) {
    headerMap = buildHeaderMap(rows[0]);
    startIndex = 1;
  }

  const transactions: AccountTransaction[] = [];
  const errors: CsvParseError[] = [];

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 1;

    const dateIndex = resolveColumnIndex(mapping.dateColumn, headerMap, row.length);
    const amountIndex = resolveColumnIndex(mapping.amountColumn, headerMap, row.length);
    const descIndex = resolveColumnIndex(mapping.descColumn, headerMap, row.length);
    const typeIndex = resolveColumnIndex(mapping.typeColumn, headerMap, row.length);
    const categoryIndex = resolveColumnIndex(mapping.categoryColumn, headerMap, row.length);

    if (dateIndex === null) {
      errors.push({ row: rowNumber, code: "MISSING_COLUMN", field: "date", message: "date column not found" });
      continue;
    }

    if (amountIndex === null) {
      errors.push({ row: rowNumber, code: "MISSING_COLUMN", field: "amount", message: "amount column not found" });
      continue;
    }

    const dateValue = (row[dateIndex] ?? "").trim();
    const amountValue = (row[amountIndex] ?? "").trim();
    const description = descIndex === null ? "" : (row[descIndex] ?? "").trim();
    const typeValue = typeIndex === null ? "" : (row[typeIndex] ?? "").trim();
    const categoryValue = categoryIndex === null ? "" : (row[categoryIndex] ?? "").trim();

    const postedAt = parseDateToIsoDay(dateValue);
    if (!postedAt) {
      errors.push({ row: rowNumber, code: "INVALID_DATE", field: "date", message: "invalid date format" });
      continue;
    }

    const amountKrwRaw = parseAmountKrw(amountValue);
    if (amountKrwRaw === null) {
      errors.push({ row: rowNumber, code: "INVALID_AMOUNT", field: "amount", message: "invalid amount format" });
      continue;
    }

    const direction = resolveDirection(typeValue);
    const amountKrw = direction === null ? amountKrwRaw : Math.abs(amountKrwRaw) * direction;

    transactions.push({
      id: buildTransactionId(rowNumber, postedAt, amountKrw, description, categoryValue || undefined),
      postedAt,
      amountKrw,
      description,
      category: categoryValue || undefined,
      source: "csv",
    });
  }

  const totalRows = rows.length - startIndex;
  return {
    transactions,
    errors,
    stats: {
      totalRows,
      parsedRows: transactions.length,
      skippedRows: Math.max(0, totalRows - transactions.length),
    },
  };
}
