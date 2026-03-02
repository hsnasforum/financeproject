import { sha256Hex, stableStringify } from "../../cache/key";
import { type AccountTransaction } from "../domain/types";
import {
  AccountSourceValidationError,
  asString,
  parseColumnRef,
  type AccountSourceProvider,
  type AccountSourceValidationIssue,
  type CsvAccountSourceInput,
  type CsvColumnRef,
} from "./accountSourceProvider";

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") {
      if (inQuotes && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      const trimmed = row.map((value) => value.trim());
      if (trimmed.some((value) => value.length > 0)) rows.push(trimmed);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  const trimmed = row.map((value) => value.trim());
  if (trimmed.some((value) => value.length > 0)) rows.push(trimmed);
  return rows;
}

function parseIsoDateStart(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

function parseAmountKrw(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const negativeByParens = /^\(.+\)$/.test(text);
  const cleaned = text
    .replace(/[,\s원₩]/g, "")
    .replace(/^\(|\)$/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const signed = negativeByParens ? -Math.abs(parsed) : parsed;
  return Math.round(signed);
}

function resolveSignByType(typeValue: string): 1 | -1 | null {
  const text = typeValue.trim().toLowerCase();
  if (!text) return null;
  if (["credit", "inflow", "deposit", "income", "입금", "수입"].includes(text)) return 1;
  if (["debit", "outflow", "withdrawal", "expense", "출금", "지출"].includes(text)) return -1;
  return null;
}

function buildHeaderMap(row: string[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((cell, index) => {
    const key = cell.trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, index);
  });
  return map;
}

function readCell(row: string[], ref: CsvColumnRef, headerMap: Map<string, number> | null): string {
  const index = parseColumnRef(ref, headerMap, row.length);
  if (typeof index !== "number") return "";
  return asString(row[index]);
}

function buildTransactionId(rowIndex: number, tx: Omit<AccountTransaction, "id">): string {
  const payload = {
    source: tx.source,
    postedAt: tx.postedAt,
    amountKrw: tx.amountKrw,
    description: tx.description,
    category: tx.category ?? "",
    rowIndex,
  };
  return `csv-${sha256Hex(stableStringify(payload)).slice(0, 16)}`;
}

export class CsvAccountSourceProvider implements AccountSourceProvider<CsvAccountSourceInput> {
  readonly id = "csv";

  async loadTransactions(input: CsvAccountSourceInput): Promise<AccountTransaction[]> {
    const delimiter = asString(input.delimiter) || ",";
    const hasHeader = input.hasHeader !== false;
    const rows = parseCsvRows(asString(input.csvText), delimiter);
    if (rows.length === 0) return [];

    const issues: AccountSourceValidationIssue[] = [];
    let startRow = 0;
    let headerMap: Map<string, number> | null = null;
    if (hasHeader) {
      headerMap = buildHeaderMap(rows[0]);
      startRow = 1;
    }

    const txList: AccountTransaction[] = [];
    for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const dateRaw = readCell(row, input.mapping.dateColumn, headerMap);
      const amountRaw = readCell(row, input.mapping.amountColumn, headerMap);
      const descRaw = readCell(row, input.mapping.descColumn, headerMap);
      const typeRaw = input.mapping.typeColumn !== undefined
        ? readCell(row, input.mapping.typeColumn, headerMap)
        : "";
      const categoryRaw = input.mapping.categoryColumn !== undefined
        ? readCell(row, input.mapping.categoryColumn, headerMap)
        : "";

      const postedAt = parseIsoDateStart(dateRaw);
      if (!postedAt) {
        issues.push({
          path: `rows[${rowIndex}].date`,
          code: "INVALID_DATE",
          message: `date parse failed: ${dateRaw || "(empty)"}`,
        });
        continue;
      }

      const amount = parseAmountKrw(amountRaw);
      if (amount === null) {
        issues.push({
          path: `rows[${rowIndex}].amount`,
          code: "INVALID_AMOUNT",
          message: `amount parse failed: ${amountRaw || "(empty)"}`,
        });
        continue;
      }

      const direction = resolveSignByType(typeRaw);
      const signedAmount = direction === null ? amount : Math.abs(amount) * direction;
      const description = descRaw || "(description missing)";
      const base: Omit<AccountTransaction, "id"> = {
        postedAt,
        amountKrw: signedAmount,
        description,
        category: categoryRaw || undefined,
        source: "csv",
      };
      txList.push({
        ...base,
        id: buildTransactionId(rowIndex, base),
      });
    }

    if (issues.length > 0) {
      throw new AccountSourceValidationError("CSV transaction validation failed", issues);
    }

    return txList;
  }
}
