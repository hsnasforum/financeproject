import { type AccountTransaction } from "../../domain/types";
import { parseCsvText, type ParseCsvTextOptions } from "./csvParse";
import { detectDelimiter } from "./detectDialect";
import { type CsvAmountSign, type CsvColumnMapping, type CsvDelimiter } from "./types";

export type CsvColumnRef = string | number;

export type ParseCsvError = {
  rowIndex: number;
  code: string;
  path: string[];
};

type LegacyCsvColumnMapping = {
  dateColumn?: CsvColumnRef;
  amountColumn?: CsvColumnRef;
  inflowColumn?: CsvColumnRef;
  outflowColumn?: CsvColumnRef;
  descColumn?: CsvColumnRef;
  descriptionColumn?: CsvColumnRef;
  typeColumn?: CsvColumnRef;
  delimiter?: CsvDelimiter;
};

export type ParseCsvTransactionsOptions = ParseCsvTextOptions & {
  mapping?: CsvColumnMapping | LegacyCsvColumnMapping;
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
  inflow: ["inflow", "credit", "입금", "입금액", "수입", "수입금액"],
  outflow: ["outflow", "debit", "출금", "출금액", "지출", "지출금액"],
  description: ["description", "desc", "적요", "내용", "메모", "거래내용", "내역"],
  type: ["type", "구분", "거래구분", "입출구분"],
} as const;

function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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
    if (canonical && !out.has(canonical)) out.set(canonical, index);
  });
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCsvDelimiter(value: unknown): CsvDelimiter | undefined {
  return value === "," || value === "\t" || value === ";" ? value : undefined;
}

type MappingRefs = {
  modernMapping: boolean;
  dateRef?: CsvColumnRef;
  amountRef?: CsvColumnRef;
  inflowRef?: CsvColumnRef;
  outflowRef?: CsvColumnRef;
  descRef?: CsvColumnRef;
  typeRef?: CsvColumnRef;
  amountSign: CsvAmountSign;
  delimiter?: CsvDelimiter;
};

function normalizeMappingRefs(mapping: ParseCsvTransactionsOptions["mapping"]): MappingRefs {
  if (!isRecord(mapping)) {
    return {
      modernMapping: false,
      amountSign: "signed",
    };
  }

  const modern = mapping as Partial<CsvColumnMapping>;
  const legacy = mapping as LegacyCsvColumnMapping;
  const modernMapping = Object.prototype.hasOwnProperty.call(modern, "dateKey")
    || Object.prototype.hasOwnProperty.call(modern, "amountKey")
    || Object.prototype.hasOwnProperty.call(modern, "inflowKey")
    || Object.prototype.hasOwnProperty.call(modern, "outflowKey")
    || Object.prototype.hasOwnProperty.call(modern, "descKey");

  const dateRef = typeof modern.dateKey === "string" ? modern.dateKey : legacy.dateColumn;
  const amountRef = typeof modern.amountKey === "string" ? modern.amountKey : legacy.amountColumn;
  const inflowRef = typeof modern.inflowKey === "string" ? modern.inflowKey : legacy.inflowColumn;
  const outflowRef = typeof modern.outflowKey === "string" ? modern.outflowKey : legacy.outflowColumn;
  const descRef = typeof modern.descKey === "string" ? modern.descKey : (legacy.descriptionColumn ?? legacy.descColumn);
  const typeRef = typeof modern.typeKey === "string" ? modern.typeKey : legacy.typeColumn;
  const amountSign = modern.amountSign === "inflowPositive" || modern.amountSign === "outflowPositive" || modern.amountSign === "signed"
    ? modern.amountSign
    : "signed";
  const delimiter = toCsvDelimiter(modern.delimiter) ?? toCsvDelimiter(legacy.delimiter);

  return {
    modernMapping,
    ...(dateRef !== undefined ? { dateRef } : {}),
    ...(amountRef !== undefined ? { amountRef } : {}),
    ...(inflowRef !== undefined ? { inflowRef } : {}),
    ...(outflowRef !== undefined ? { outflowRef } : {}),
    ...(descRef !== undefined ? { descRef } : {}),
    ...(typeRef !== undefined ? { typeRef } : {}),
    amountSign,
    ...(delimiter ? { delimiter } : {}),
  };
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
  if (text.length >= 10 && /[T\s]/.test(text)) text = text.slice(0, 10);
  if (/^\d{8}$/.test(text)) text = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;

  const normalized = text.replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function applyAmountSign(amount: number, rawType: string | undefined, amountSign: CsvAmountSign): number {
  const byType = normalizeAmountByType(amount, rawType);
  if (byType !== amount) return byType;
  if (amountSign === "outflowPositive") return -Math.abs(amount);
  if (amountSign === "inflowPositive") return Math.abs(amount);
  return amount;
}

type AmountResolveResult =
  | { ok: true; amount: number }
  | { ok: false; code: "MISSING_COLUMN" | "INVALID_AMOUNT"; path: "amount" | "inflow" | "outflow" };

function resolveAmountFromSigned(row: string[], amountIndex: number): AmountResolveResult {
  const amountRaw = normalizeAmount(row[amountIndex] ?? "");
  if (amountRaw === null) return { ok: false, code: "INVALID_AMOUNT", path: "amount" };
  return { ok: true, amount: amountRaw };
}

function resolveAmountFromInOut(
  row: string[],
  inflowIndex: number | null,
  outflowIndex: number | null,
): AmountResolveResult {
  if (inflowIndex === null || outflowIndex === null) {
    return {
      ok: false,
      code: "MISSING_COLUMN",
      path: inflowIndex === null ? "inflow" : "outflow",
    };
  }

  const inflowRawText = (row[inflowIndex] ?? "").trim();
  const outflowRawText = (row[outflowIndex] ?? "").trim();
  if (!inflowRawText && !outflowRawText) {
    return { ok: false, code: "INVALID_AMOUNT", path: "amount" };
  }

  const inflowRaw = inflowRawText ? normalizeAmount(inflowRawText) : 0;
  const outflowRaw = outflowRawText ? normalizeAmount(outflowRawText) : 0;
  if (inflowRaw === null) return { ok: false, code: "INVALID_AMOUNT", path: "inflow" };
  if (outflowRaw === null) return { ok: false, code: "INVALID_AMOUNT", path: "outflow" };
  return {
    ok: true,
    amount: Math.abs(inflowRaw) - Math.abs(outflowRaw),
  };
}

export function parseCsvTransactions(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ParseCsvTransactionsResult {
  const mapping = normalizeMappingRefs(options.mapping);
  const delimiter = mapping.delimiter ?? toCsvDelimiter(options.delimiter) ?? detectDelimiter(csvText);
  const parsed = parseCsvText(csvText, {
    ...options,
    delimiter,
  });
  const headerMap = parsed.header ? buildHeaderMap(parsed.header) : null;

  const transactions: AccountTransaction[] = [];
  const errors: ParseCsvError[] = [];

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i] ?? [];
    const rowIndex = i + (parsed.header ? 1 : 0);

    const dateIndex = resolveRefIndex(mapping.dateRef, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "date")
      ?? (parsed.header ? null : 0);
    const amountIndex = resolveRefIndex(mapping.amountRef, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "amount")
      ?? (parsed.header ? null : 1);
    const inflowIndex = resolveRefIndex(mapping.inflowRef, headerMap, row.length)
      ?? (mapping.modernMapping ? null : pickHeaderIndex(headerMap, "inflow"));
    const outflowIndex = resolveRefIndex(mapping.outflowRef, headerMap, row.length)
      ?? (mapping.modernMapping ? null : pickHeaderIndex(headerMap, "outflow"));
    const descIndex = resolveRefIndex(mapping.descRef, headerMap, row.length)
      ?? (mapping.modernMapping ? null : pickHeaderIndex(headerMap, "description"));
    const typeIndex = resolveRefIndex(mapping.typeRef, headerMap, row.length)
      ?? pickHeaderIndex(headerMap, "type");

    if (dateIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: ["date"] });
      continue;
    }

    const date = normalizeDate(row[dateIndex] ?? "");
    if (!date) {
      errors.push({ rowIndex, code: "INVALID_DATE", path: ["date"] });
      continue;
    }

    let amountResolved: AmountResolveResult;
    if (amountIndex !== null) {
      amountResolved = resolveAmountFromSigned(row, amountIndex);
    } else if (inflowIndex !== null || outflowIndex !== null) {
      amountResolved = resolveAmountFromInOut(row, inflowIndex, outflowIndex);
    } else {
      amountResolved = { ok: false, code: "MISSING_COLUMN", path: "amount" };
    }

    if (!amountResolved.ok) {
      errors.push({ rowIndex, code: amountResolved.code, path: [amountResolved.path] });
      continue;
    }

    const amountKrw = amountIndex !== null
      ? applyAmountSign(amountResolved.amount, typeIndex !== null ? row[typeIndex] : undefined, mapping.amountSign)
      : amountResolved.amount;
    const description = descIndex !== null ? (row[descIndex] ?? "").trim() || undefined : undefined;

    transactions.push({
      date,
      amountKrw,
      ...(description ? { description } : {}),
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

