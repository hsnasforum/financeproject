import { parseCsvText } from "./csvParse";
import { type CsvColumnMapping, type CsvDelimiter, type CsvInferResult } from "./types";
import { detectDelimiter } from "./detectDialect";

const DATE_HEADER_ALIASES = [
  "date",
  "날짜",
  "일자",
  "거래일",
  "거래일자",
  "approvaldate",
  "transdate",
] as const;

const AMOUNT_HEADER_ALIASES = [
  "amount",
  "금액",
  "거래금액",
  "입출금액",
  "거래액",
  "amt",
] as const;

const INFLOW_HEADER_ALIASES = [
  "inflow",
  "credit",
  "입금",
  "입금액",
  "수입",
  "수입금액",
] as const;

const OUTFLOW_HEADER_ALIASES = [
  "outflow",
  "debit",
  "출금",
  "출금액",
  "지출",
  "지출금액",
] as const;

const DESC_HEADER_ALIASES = [
  "description",
  "desc",
  "적요",
  "내용",
  "메모",
  "거래내용",
  "내역",
] as const;

const TYPE_HEADER_ALIASES = [
  "type",
  "구분",
  "거래구분",
  "입출구분",
  "drcr",
  "inout",
] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function findHeaderByAliases(headers: string[], aliases: readonly string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map((alias) => normalize(alias)));
  for (const header of headers) {
    const key = normalize(header);
    if (!key) continue;
    if (normalizedAliases.has(key)) return header;
  }
  for (const header of headers) {
    const key = normalize(header);
    if (!key) continue;
    for (const alias of normalizedAliases) {
      if (key.includes(alias)) return header;
    }
  }
  return undefined;
}

function inferDateFormatHint(sampleRows: Record<string, string>[], dateKey?: string): string | undefined {
  if (!dateKey) return undefined;
  const values = sampleRows
    .map((row) => row[dateKey] ?? "")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 8);
  if (values.length < 1) return undefined;
  if (values.some((value) => /^\d{8}$/.test(value))) return "yyyyMMdd";
  if (values.some((value) => /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(value))) return "yyyy-MM-dd";
  return undefined;
}

export type InferCsvMappingOptions = {
  delimiter?: CsvDelimiter;
};

export function inferCsvMapping(
  csvText: string,
  options: InferCsvMappingOptions = {},
): CsvInferResult {
  const delimiter = options.delimiter ?? detectDelimiter(csvText);
  const parsed = parseCsvText(csvText, { hasHeader: true, delimiter });
  const headers = parsed.header ?? [];
  const sampleRows = parsed.rows.slice(0, 5).map((row) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? "";
    });
    return item;
  });

  const dateKey = findHeaderByAliases(headers, DATE_HEADER_ALIASES);
  const amountKey = findHeaderByAliases(headers, AMOUNT_HEADER_ALIASES);
  const inflowKey = findHeaderByAliases(headers, INFLOW_HEADER_ALIASES);
  const outflowKey = findHeaderByAliases(headers, OUTFLOW_HEADER_ALIASES);
  const descKey = findHeaderByAliases(headers, DESC_HEADER_ALIASES);
  const typeKey = findHeaderByAliases(headers, TYPE_HEADER_ALIASES);
  const dateFormatHint = inferDateFormatHint(sampleRows, dateKey);

  const suggestions: Partial<CsvColumnMapping> = {
    ...(dateKey ? { dateKey } : {}),
    ...(amountKey ? { amountKey } : {}),
    ...(!amountKey && inflowKey ? { inflowKey } : {}),
    ...(!amountKey && outflowKey ? { outflowKey } : {}),
    ...(descKey ? { descKey } : {}),
    ...(typeKey ? { typeKey } : {}),
    ...(dateFormatHint ? { dateFormatHint } : {}),
    amountSign: "signed",
    delimiter,
  };

  return {
    headers,
    sampleRows,
    suggestions,
  };
}
