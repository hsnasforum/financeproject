import { createHash } from "node:crypto";
import { type ImportBatchMeta, type StoredTransaction } from "../domain/transactions";
import { parseCsvTransactions } from "../providers/csv/csvProvider";
import { detectEncodingIssue, normalizeNewlines, parseCsvText, stripUtf8Bom } from "../providers/csv/csvParse";
import { inferCsvMapping } from "../providers/csv/inferMapping";
import { type CsvColumnMapping } from "../providers/csv/types";
import { validateCsvMapping } from "../providers/csv/validateMapping";
import { saveBatch } from "../store/batchesStore";
import { normalizeDescriptionForTxnId } from "./txnId";

type Primitive = string | number | boolean | null;

export type ImportCsvToBatchInput = {
  csvText: string;
  mapping?: Partial<CsvColumnMapping>;
  sanitizeTextFields?: boolean;
  options?: {
    accountId?: string;
    accountName?: string;
    [key: string]: unknown;
  };
};

export type ImportCsvToBatchResult = {
  batchMeta: ImportBatchMeta;
  transactions: StoredTransaction[];
  mappingUsed: CsvColumnMapping;
};

export class ImportCsvToBatchInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "ImportCsvToBatchInputError";
    this.details = details;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

function normalizeMappingInput(mapping: Partial<CsvColumnMapping> | undefined): Partial<CsvColumnMapping> {
  return {
    ...(asString(mapping?.dateKey) ? { dateKey: asString(mapping?.dateKey) } : {}),
    ...(asString(mapping?.amountKey) ? { amountKey: asString(mapping?.amountKey) } : {}),
    ...(asString(mapping?.inflowKey) ? { inflowKey: asString(mapping?.inflowKey) } : {}),
    ...(asString(mapping?.outflowKey) ? { outflowKey: asString(mapping?.outflowKey) } : {}),
    ...(asString(mapping?.descKey) ? { descKey: asString(mapping?.descKey) } : {}),
  };
}

function toStableObject(value: unknown): Record<string, Primitive> {
  if (!isRecord(value)) return {};
  const out: Record<string, Primitive> = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    if (key === "csrf") continue;
    const candidate = value[key];
    if (
      typeof candidate === "string"
      || typeof candidate === "number"
      || typeof candidate === "boolean"
      || candidate === null
    ) {
      out[key] = candidate;
    }
  }
  return out;
}

function normalizeMappingCandidate(headers: string[], mapping: Partial<CsvColumnMapping> | undefined): CsvColumnMapping {
  const normalizedInput = normalizeMappingInput(mapping);
  const hasExplicitMapping = Object.keys(normalizedInput).length > 0;
  const inferred = inferCsvMapping(headers);

  const candidate: CsvColumnMapping = hasExplicitMapping
    ? normalizedInput
    : {
        ...(inferred.dateKey ? { dateKey: inferred.dateKey } : {}),
        ...(inferred.amountKey ? { amountKey: inferred.amountKey } : {}),
        ...(inferred.inflowKey ? { inflowKey: inferred.inflowKey } : {}),
        ...(inferred.outflowKey ? { outflowKey: inferred.outflowKey } : {}),
        ...(inferred.descKey ? { descKey: inferred.descKey } : {}),
      };

  const validation = validateCsvMapping(candidate, { headers });
  if (!validation.ok) {
    throw new ImportCsvToBatchInputError("invalid mapping", validation.errors);
  }

  return candidate;
}

function buildBatchId(csvNormalizedText: string, mapping: CsvColumnMapping, options?: ImportCsvToBatchInput["options"]): string {
  const signature = JSON.stringify({
    csvNormalizedText,
    mapping: {
      ...(mapping.dateKey ? { dateKey: mapping.dateKey } : {}),
      ...(mapping.amountKey ? { amountKey: mapping.amountKey } : {}),
      ...(mapping.inflowKey ? { inflowKey: mapping.inflowKey } : {}),
      ...(mapping.outflowKey ? { outflowKey: mapping.outflowKey } : {}),
      ...(mapping.descKey ? { descKey: mapping.descKey } : {}),
    },
    options: toStableObject(options),
  });
  return sha256(signature).slice(0, 16);
}

function buildDeterministicTxnId(input: {
  batchId: string;
  dateIso: string;
  amountKrw: number;
  description?: string;
  accountId?: string;
}): string {
  const descNorm = normalizeDescriptionForTxnId(input.description);
  const accountId = asString(input.accountId);
  const canonical = `${input.batchId}|${input.dateIso}|${Math.round(input.amountKrw)}|${descNorm}|${accountId}|KRW`;
  return sha256(canonical).slice(0, 16);
}

function sortTransactionsDeterministic(transactions: StoredTransaction[]): StoredTransaction[] {
  return [...transactions].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
    return left.txnId.localeCompare(right.txnId);
  });
}

function inferYmRange(transactions: StoredTransaction[]): { ymMin?: string; ymMax?: string } {
  const months = transactions
    .map((row) => row.date.slice(0, 7))
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort((left, right) => left.localeCompare(right));

  if (months.length < 1) return {};
  return {
    ymMin: months[0],
    ymMax: months[months.length - 1],
  };
}

export async function importCsvToBatch(input: ImportCsvToBatchInput): Promise<ImportCsvToBatchResult> {
  const csvText = asString(input.csvText);
  if (!csvText) {
    throw new ImportCsvToBatchInputError("csvText is required", [
      { field: "csvText", message: "CSV 텍스트를 입력해 주세요." },
    ]);
  }

  const preparedCsvText = normalizeNewlines(stripUtf8Bom(csvText));
  if (detectEncodingIssue(preparedCsvText)) {
    throw new ImportCsvToBatchInputError("csv encoding issue", [
      { field: "csvEncoding", message: "CSV 인코딩을 확인해 주세요." },
    ]);
  }

  const parsedHeader = parseCsvText(preparedCsvText, { hasHeader: true });
  const headers = parsedHeader.header ?? [];
  if (headers.length < 1) {
    throw new ImportCsvToBatchInputError("header not found", [
      { field: "headers", message: "헤더 행을 찾을 수 없습니다." },
    ]);
  }

  const mappingUsed = normalizeMappingCandidate(headers, input.mapping);
  const accountId = asString(input.options?.accountId);
  const parsed = parseCsvTransactions(preparedCsvText, {
    mapping: mappingUsed,
    hasHeader: true,
    ...(accountId ? { accountId } : {}),
  });

  const encodingError = parsed.errors.find((row) => row.code === "CSV_ENCODING");
  if (encodingError) {
    throw new ImportCsvToBatchInputError("csv encoding issue", [
      { field: "csvEncoding", message: "CSV 인코딩을 확인해 주세요." },
    ]);
  }

  const batchId = buildBatchId(preparedCsvText, mappingUsed, input.options);
  const dedupedMap = new Map<string, StoredTransaction>();

  for (const tx of parsed.transactions) {
    const rawDescription = asString(tx.description) || undefined;
    const txnId = buildDeterministicTxnId({
      batchId,
      dateIso: tx.date,
      amountKrw: tx.amountKrw,
      ...(rawDescription ? { description: rawDescription } : {}),
      ...(asString(tx.accountId) ? { accountId: asString(tx.accountId) } : {}),
    });
    if (dedupedMap.has(txnId)) continue;

    const description = input.sanitizeTextFields === true ? undefined : rawDescription;

    dedupedMap.set(txnId, {
      date: tx.date,
      amountKrw: tx.amountKrw,
      source: tx.source,
      ...(asString(tx.accountId) ? { accountId: asString(tx.accountId) } : {}),
      ...(tx.kind ? { kind: tx.kind } : {}),
      ...(tx.transfer ? { transfer: tx.transfer } : {}),
      ...(tx.category ? { category: tx.category } : {}),
      ...(tx.categoryId ? { categoryId: tx.categoryId } : {}),
      ...(tx.classificationReason ? { classificationReason: tx.classificationReason } : {}),
      ...(tx.matchedRuleId ? { matchedRuleId: tx.matchedRuleId } : {}),
      ...(tx.meta ? { meta: tx.meta } : {}),
      ...(description ? { description } : {}),
      txnId,
      batchId,
    });
  }

  const transactions = sortTransactionsDeterministic([...dedupedMap.values()]);
  const ymRange = inferYmRange(transactions);
  const accountList = accountId
    ? [{
        id: accountId,
        ...(asString(input.options?.accountName) ? { name: asString(input.options?.accountName) } : {}),
      }]
    : [];

  const batchMeta: ImportBatchMeta = {
    id: batchId,
    createdAt: nowIso(),
    source: "csv",
    rowCount: transactions.length,
    ...(ymRange.ymMin ? { ymMin: ymRange.ymMin } : {}),
    ...(ymRange.ymMax ? { ymMax: ymRange.ymMax } : {}),
    ...(accountList.length > 0 ? { accounts: accountList } : {}),
  };

  await saveBatch(batchMeta, transactions);

  return {
    batchMeta,
    transactions,
    mappingUsed,
  };
}
