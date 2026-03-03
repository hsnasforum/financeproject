import { type AccountTransaction } from "../../domain/types";
import { buildTxnId, normalizeDescriptionForTxnId } from "../../service/txnId";
import {
  detectEncodingIssue,
  normalizeNewlines,
  parseCsvText,
  stripUtf8Bom,
  type ParseCsvTextOptions,
} from "./csvParse";
import { type CsvColumnMapping } from "./types";

export type CsvColumnRef = string | number;

export type ParseCsvError = {
  rowIndex: number;
  code: string;
  path: string[];
};

type LegacyCsvColumnMapping = {
  dateColumn?: CsvColumnRef;
  amountColumn?: CsvColumnRef;
  descColumn?: CsvColumnRef;
  descriptionColumn?: CsvColumnRef;
  typeColumn?: CsvColumnRef;
};

type ModernCsvColumnMapping = CsvColumnMapping & {
  typeKey?: string;
};

export type ParseCsvTransactionsOptions = ParseCsvTextOptions & {
  mapping?: LegacyCsvColumnMapping | ModernCsvColumnMapping;
  accountId?: string;
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
  date: ["date", "날짜", "일자", "거래일", "거래일자", "승인일", "승인일자"],
  amount: ["amount", "금액", "거래금액", "입출금액"],
  inflow: ["inflow", "deposit", "credit", "입금", "입금액", "수입"],
  outflow: ["outflow", "withdraw", "debit", "출금", "출금액", "지출"],
  description: ["description", "desc", "적요", "내용", "메모", "거래내용", "내역"],
  type: ["type", "구분", "거래구분"],
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
    if (canonical && !out.has(canonical)) {
      out.set(canonical, index);
    }
  });
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLooseCell(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function isIgnorableRow(row: string[]): boolean {
  const nonEmpty = row
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  if (nonEmpty.length < 1) return true;

  const first = nonEmpty[0] ?? "";
  if (first.startsWith("#") || first.startsWith("//") || first.startsWith(";")) {
    return true;
  }

  const SUMMARY_TOKENS = new Set([
    "합계",
    "총계",
    "소계",
    "total",
    "subtotal",
    "sum",
  ]);

  return nonEmpty.some((cell) => {
    const normalized = normalizeLooseCell(cell);
    if (!normalized) return false;
    if (SUMMARY_TOKENS.has(normalized)) return true;
    if (normalized.startsWith("합계:") || normalized.startsWith("총계:")) return true;
    if (normalized.startsWith("total:") || normalized.startsWith("subtotal:")) return true;
    return false;
  });
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

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year
    || dt.getUTCMonth() !== month - 1
    || dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateBestEffort(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  if (/[T\s]/.test(text)) {
    text = text.split(/[T\s]/)[0] ?? "";
  }

  text = text.trim();
  if (!text) return null;

  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  if (/^\d{8}$/.test(text)) {
    return toIsoDate(
      Number(text.slice(0, 4)),
      Number(text.slice(4, 6)),
      Number(text.slice(6, 8)),
    );
  }

  const mdy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mdy) {
    return toIsoDate(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  }

  return null;
}

export function normalizeAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const negativeByParen = /^\(.*\)$/.test(text);
  const cleaned = text
    .replace(/^\(|\)$/g, "")
    .replace(/[₩$¥€£]/g, "")
    .replace(/원/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");

  if (!cleaned) return null;
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const parsed = Number.parseFloat(cleaned);
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

type MappingRefs = {
  dateRef?: CsvColumnRef;
  amountRef?: CsvColumnRef;
  inflowRef?: CsvColumnRef;
  outflowRef?: CsvColumnRef;
  descRef?: CsvColumnRef;
  typeRef?: CsvColumnRef;
};

function normalizeOptionalRef(value: unknown): CsvColumnRef | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }
  return undefined;
}

function normalizeMappingRefs(mapping: ParseCsvTransactionsOptions["mapping"]): MappingRefs {
  if (!isRecord(mapping)) {
    return {};
  }

  const modern = mapping as ModernCsvColumnMapping;
  const legacy = mapping as LegacyCsvColumnMapping;

  const dateRef = normalizeOptionalRef(
    modern.dateKey !== undefined ? modern.dateKey : legacy.dateColumn,
  );
  const amountRef = normalizeOptionalRef(
    modern.amountKey !== undefined ? modern.amountKey : legacy.amountColumn,
  );
  const inflowRef = normalizeOptionalRef(modern.inflowKey);
  const outflowRef = normalizeOptionalRef(modern.outflowKey);
  const descRef = normalizeOptionalRef(
    modern.descKey !== undefined ? modern.descKey : (legacy.descriptionColumn ?? legacy.descColumn),
  );
  const typeRef = normalizeOptionalRef(
    modern.typeKey !== undefined ? modern.typeKey : legacy.typeColumn,
  );

  return {
    ...(dateRef !== undefined ? { dateRef } : {}),
    ...(amountRef !== undefined ? { amountRef } : {}),
    ...(inflowRef !== undefined ? { inflowRef } : {}),
    ...(outflowRef !== undefined ? { outflowRef } : {}),
    ...(descRef !== undefined ? { descRef } : {}),
    ...(typeRef !== undefined ? { typeRef } : {}),
  };
}

function resolveAmountFromInOut(
  row: string[],
  inflowIndex: number | null,
  outflowIndex: number | null,
): { ok: true; amount: number } | { ok: false; code: string; path: string } {
  if (inflowIndex === null || outflowIndex === null) {
    return {
      ok: false,
      code: "MISSING_COLUMN",
      path: inflowIndex === null ? "inflow" : "outflow",
    };
  }

  const inflowText = (row[inflowIndex] ?? "").trim();
  const outflowText = (row[outflowIndex] ?? "").trim();

  if (!inflowText && !outflowText) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      path: "amount",
    };
  }

  const inflow = inflowText ? normalizeAmount(inflowText) : 0;
  const outflow = outflowText ? normalizeAmount(outflowText) : 0;

  if (inflow === null) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      path: "inflow",
    };
  }

  if (outflow === null) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      path: "outflow",
    };
  }

  return {
    ok: true,
    amount: Math.abs(inflow) - Math.abs(outflow),
  };
}

export function parseCsvTransactions(
  csvText: string,
  options: ParseCsvTransactionsOptions = {},
): ParseCsvTransactionsResult {
  const accountId = (typeof options.accountId === "string" ? options.accountId.trim() : "") || "";
  const preparedCsvText = normalizeNewlines(stripUtf8Bom(csvText));
  if (detectEncodingIssue(preparedCsvText)) {
    return {
      transactions: [],
      stats: {
        rows: 0,
        parsed: 0,
        skipped: 1,
      },
      errors: [{
        rowIndex: 0,
        code: "CSV_ENCODING",
        path: ["csv"],
      }],
    };
  }

  const parsed = parseCsvText(preparedCsvText, options);
  const headerMap = parsed.header ? buildHeaderMap(parsed.header) : null;
  const mapping = normalizeMappingRefs(options.mapping);
  const hasHeader = Boolean(parsed.header);

  const transactions: AccountTransaction[] = [];
  const errors: ParseCsvError[] = [];
  let ignoredRows = 0;

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i] ?? [];
    const rowIndex = i + (hasHeader ? 1 : 0);

    const dateIndex = mapping.dateRef !== undefined
      ? resolveRefIndex(mapping.dateRef, headerMap, row.length)
      : (pickHeaderIndex(headerMap, "date") ?? (hasHeader ? null : 0));

    const amountIndex = mapping.amountRef !== undefined
      ? resolveRefIndex(mapping.amountRef, headerMap, row.length)
      : (pickHeaderIndex(headerMap, "amount") ?? (hasHeader ? null : 1));

    const inflowIndex = mapping.inflowRef !== undefined
      ? resolveRefIndex(mapping.inflowRef, headerMap, row.length)
      : pickHeaderIndex(headerMap, "inflow");

    const outflowIndex = mapping.outflowRef !== undefined
      ? resolveRefIndex(mapping.outflowRef, headerMap, row.length)
      : pickHeaderIndex(headerMap, "outflow");

    const descIndex = mapping.descRef !== undefined
      ? resolveRefIndex(mapping.descRef, headerMap, row.length)
      : (pickHeaderIndex(headerMap, "description") ?? (hasHeader ? null : 2));

    const typeIndex = mapping.typeRef !== undefined
      ? resolveRefIndex(mapping.typeRef, headerMap, row.length)
      : pickHeaderIndex(headerMap, "type");

    if (dateIndex === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: ["date"] });
      continue;
    }

    const date = parseDateBestEffort(row[dateIndex] ?? "");
    if (!date) {
      if (isIgnorableRow(row)) {
        ignoredRows += 1;
        continue;
      }
      errors.push({ rowIndex, code: "INVALID_DATE", path: ["date"] });
      continue;
    }

    let amountKrw: number | null = null;

    const preferInflowOutflow = mapping.amountRef === undefined
      && (
        mapping.inflowRef !== undefined
        || mapping.outflowRef !== undefined
      );

    if (amountIndex !== null && !preferInflowOutflow) {
      const amountRaw = normalizeAmount(row[amountIndex] ?? "");
      if (amountRaw === null) {
        errors.push({ rowIndex, code: "INVALID_AMOUNT", path: ["amount"] });
        continue;
      }
      amountKrw = normalizeAmountByType(amountRaw, typeIndex !== null ? row[typeIndex] : undefined);
    } else if (
      mapping.inflowRef !== undefined
      || mapping.outflowRef !== undefined
      || (amountIndex === null && (inflowIndex !== null || outflowIndex !== null))
    ) {
      const resolved = resolveAmountFromInOut(row, inflowIndex, outflowIndex);
      if (!resolved.ok) {
        errors.push({ rowIndex, code: resolved.code, path: [resolved.path] });
        continue;
      }
      amountKrw = resolved.amount;
    }

    if (amountKrw === null) {
      errors.push({ rowIndex, code: "MISSING_COLUMN", path: ["amount"] });
      continue;
    }

    const description = descIndex !== null ? (row[descIndex] ?? "").trim() || undefined : undefined;
    const txnId = buildTxnId({
      dateIso: date,
      amountKrw,
      descNorm: normalizeDescriptionForTxnId(description),
      ...(accountId ? { accountId } : {}),
    });

    transactions.push({
      txnId,
      ...(accountId ? { accountId } : {}),
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
      skipped: Math.max(0, parsed.rows.length - transactions.length),
    },
    errors,
  };
}
