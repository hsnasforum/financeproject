import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type AccountTransaction } from "../domain/types";
import { type V3ImportBatch, type V3TransactionRecord } from "../domain/transactions";
import { parseCsvTransactions } from "../providers/csv/csvProvider";
import { detectEncodingIssue, normalizeNewlines, parseCsvText, stripUtf8Bom } from "../providers/csv/csvParse";
import { inferCsvMapping } from "../providers/csv/inferMapping";
import { maskPreviewDescription, previewCsv, type CsvPreviewRow } from "../providers/csv/previewCsv";
import { type CsvColumnMapping } from "../providers/csv/types";
import { validateCsvMapping } from "../providers/csv/validateMapping";

type BatchCursorPayload = {
  createdAt: string;
  id: string;
};

export type AppendBatchFromCsvInput = {
  csvText: string;
  mapping?: Partial<CsvColumnMapping>;
  fileName?: string;
};

export type AppendBatchFromCsvResult = {
  batch: V3ImportBatch;
  stats: {
    total: number;
    ok: number;
    failed: number;
    stored: number;
  };
  sampleRedactedRows: CsvPreviewRow[];
  mappingUsed: CsvColumnMapping;
};

export type ListBatchesOptions = {
  limit?: number;
  cursor?: string;
};

export type ListBatchesResult = {
  items: V3ImportBatch[];
  nextCursor?: string;
};

export type ReadBatchResult = {
  batch: V3ImportBatch;
  sample: CsvPreviewRow[];
  stats: {
    total: number;
    ok: number;
    failed: number;
    inferredMonths?: number;
  };
  monthsSummary: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
};

export type ReadBatchTransactionsResult = {
  batch: V3ImportBatch;
  transactions: AccountTransaction[];
};

export class TransactionStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TransactionStoreInputError";
    this.details = details;
  }
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 transaction store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function normalizeFileName(value: unknown): string | undefined {
  const text = asString(value).replace(/[\u0000-\u001F\u007F]/g, "");
  if (!text) return undefined;
  return text.slice(0, 200);
}

function resolveTransactionsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_TRANSACTIONS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "transactions");
}

function resolveBatchesPath(cwd = process.cwd()): string {
  return path.join(resolveTransactionsDir(cwd), "batches.ndjson");
}

function resolveRecordsPath(cwd = process.cwd()): string {
  return path.join(resolveTransactionsDir(cwd), "records.ndjson");
}

async function appendNdjsonLine(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function parseIso(value: unknown): string {
  const raw = asString(value);
  const timestamp = Date.parse(raw);
  if (!raw || !Number.isFinite(timestamp)) {
    throw new Error("invalid iso");
  }
  return new Date(timestamp).toISOString();
}

function normalizeImportBatch(value: unknown): V3ImportBatch | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const createdAt = parseIso(value.createdAt);
    const kind = value.kind === "csv" ? "csv" : null;
    if (!kind) return null;

    const total = asPositiveInt(value.total, 0, 0, Number.MAX_SAFE_INTEGER);
    const ok = asPositiveInt(value.ok, 0, 0, Number.MAX_SAFE_INTEGER);
    const failed = asPositiveInt(value.failed, 0, 0, Number.MAX_SAFE_INTEGER);

    return {
      id,
      createdAt,
      kind,
      ...(normalizeFileName(value.fileName) ? { fileName: normalizeFileName(value.fileName) } : {}),
      ...(asString(value.sha256) ? { sha256: asString(value.sha256).slice(0, 128) } : {}),
      total,
      ok,
      failed,
    };
  } catch {
    return null;
  }
}

function normalizeTransactionRecord(value: unknown): V3TransactionRecord | null {
  if (!isRecord(value)) return null;
  try {
    const id = sanitizeRecordId(value.id);
    const batchId = sanitizeRecordId(value.batchId);
    const createdAt = parseIso(value.createdAt);
    const date = asString(value.date);
    const amountKrw = Number(value.amountKrw);
    const source = value.source === "csv" ? "csv" : null;
    if (!date || !Number.isFinite(amountKrw) || !source) return null;

    const description = asString(value.description) || undefined;
    const rowIndex = Math.trunc(Number((value.meta as Record<string, unknown> | undefined)?.rowIndex));

    const sourceInfo = isRecord(value.sourceInfo) && value.sourceInfo.kind === "csv"
      ? {
          kind: "csv" as const,
          ...(normalizeFileName(value.sourceInfo.fileName) ? { fileName: normalizeFileName(value.sourceInfo.fileName) } : {}),
          ...(asString(value.sourceInfo.sha256) ? { sha256: asString(value.sourceInfo.sha256).slice(0, 128) } : {}),
        }
      : undefined;

    const normalized: V3TransactionRecord = {
      id,
      batchId,
      createdAt,
      date,
      amountKrw: Math.round(amountKrw),
      ...(description ? { description } : {}),
      source,
      ...(Number.isFinite(rowIndex) && rowIndex > 0 ? { meta: { rowIndex } } : {}),
      ...(sourceInfo ? { sourceInfo } : {}),
    };

    return normalized;
  } catch {
    return null;
  }
}

async function readNdjsonRows(filePath: string): Promise<unknown[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return [];

  const rows: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as unknown);
    } catch {
      continue;
    }
  }
  return rows;
}

async function readBatches(): Promise<V3ImportBatch[]> {
  const rows = await readNdjsonRows(resolveBatchesPath());
  const batches = rows
    .map((row) => normalizeImportBatch(row))
    .filter((row): row is V3ImportBatch => row !== null);

  return batches.sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id);
  });
}

async function readTransactionRecords(): Promise<V3TransactionRecord[]> {
  const rows = await readNdjsonRows(resolveRecordsPath());
  return rows
    .map((row) => normalizeTransactionRecord(row))
    .filter((row): row is V3TransactionRecord => row !== null);
}

function encodeCursor(payload: BatchCursorPayload): string {
  const text = JSON.stringify(payload);
  return Buffer.from(text, "utf-8").toString("base64");
}

function decodeCursor(cursor: string): BatchCursorPayload | null {
  const raw = asString(cursor);
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as unknown;
    if (!isRecord(parsed)) return null;
    const id = asString(parsed.id);
    const createdAt = asString(parsed.createdAt);
    if (!id || !createdAt) return null;
    return { id, createdAt };
  } catch {
    return null;
  }
}

function normalizeMappingCandidate(
  headers: string[],
  mapping: Partial<CsvColumnMapping> | undefined,
): CsvColumnMapping {
  const normalizedInput: Partial<CsvColumnMapping> = {
    ...(asString(mapping?.dateKey) ? { dateKey: asString(mapping?.dateKey) } : {}),
    ...(asString(mapping?.amountKey) ? { amountKey: asString(mapping?.amountKey) } : {}),
    ...(asString(mapping?.inflowKey) ? { inflowKey: asString(mapping?.inflowKey) } : {}),
    ...(asString(mapping?.outflowKey) ? { outflowKey: asString(mapping?.outflowKey) } : {}),
    ...(asString(mapping?.descKey) ? { descKey: asString(mapping?.descKey) } : {}),
  };

  const hasExplicit = Object.keys(normalizedInput).length > 0;
  const inferred = inferCsvMapping(headers);

  const candidate: CsvColumnMapping = hasExplicit
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
    throw new TransactionStoreInputError("invalid mapping", validation.errors);
  }

  return candidate;
}

async function createDeterministicBatchId(csvSha256: string, mapping: CsvColumnMapping): Promise<string> {
  const mappingSignature = JSON.stringify({
    ...(mapping.dateKey ? { dateKey: mapping.dateKey } : {}),
    ...(mapping.amountKey ? { amountKey: mapping.amountKey } : {}),
    ...(mapping.inflowKey ? { inflowKey: mapping.inflowKey } : {}),
    ...(mapping.outflowKey ? { outflowKey: mapping.outflowKey } : {}),
    ...(mapping.descKey ? { descKey: mapping.descKey } : {}),
  });

  const base = `b_${toSha256(`${csvSha256}:${mappingSignature}`).slice(0, 24)}`;
  const safeBase = sanitizeRecordId(base);

  const existing = new Set((await readBatches()).map((batch) => batch.id));
  if (!existing.has(safeBase)) return safeBase;

  for (let seq = 1; seq < 10_000; seq += 1) {
    const candidate = sanitizeRecordId(`${safeBase}_${seq}`);
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error("failed to allocate batch id");
}

function summarizeMonths(records: V3TransactionRecord[]): Array<{
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
}> {
  const byMonth = new Map<string, {
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>();

  for (const record of records) {
    const ym = record.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;

    const current = byMonth.get(ym) ?? {
      ym,
      incomeKrw: 0,
      expenseKrw: 0,
      netKrw: 0,
      txCount: 0,
    };

    if (record.amountKrw >= 0) {
      current.incomeKrw += record.amountKrw;
    } else {
      current.expenseKrw += record.amountKrw;
    }
    current.netKrw += record.amountKrw;
    current.txCount += 1;
    byMonth.set(ym, current);
  }

  return [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function compareMaskedTransaction(left: AccountTransaction, right: AccountTransaction): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  const leftDesc = asString(left.description);
  const rightDesc = asString(right.description);
  if (leftDesc !== rightDesc) return leftDesc.localeCompare(rightDesc);
  const leftLine = left.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  const rightLine = right.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
  return leftLine - rightLine;
}

function toAccountTransaction(record: V3TransactionRecord): AccountTransaction {
  return {
    date: record.date,
    amountKrw: record.amountKrw,
    ...(asString(record.description) ? { description: asString(record.description) } : {}),
    source: "csv",
    ...(typeof record.meta?.rowIndex === "number" ? { meta: { rowIndex: record.meta.rowIndex } } : {}),
  };
}

function toBatchDetailSample(record: V3TransactionRecord): CsvPreviewRow {
  return {
    line: record.meta?.rowIndex ?? 0,
    dateIso: record.date,
    amountKrw: record.amountKrw,
    ...(record.description ? { descMasked: record.description } : {}),
    ok: true,
  };
}

export async function appendBatchFromCsv(input: AppendBatchFromCsvInput): Promise<AppendBatchFromCsvResult> {
  assertServerOnly();

  const csvText = asString(input.csvText);
  if (!csvText) {
    throw new TransactionStoreInputError("csvText is required", [
      { field: "csvText", message: "CSV 텍스트를 입력해 주세요." },
    ]);
  }

  const preparedCsvText = normalizeNewlines(stripUtf8Bom(csvText));
  if (detectEncodingIssue(preparedCsvText)) {
    throw new TransactionStoreInputError("csv encoding issue", [
      { field: "csvEncoding", message: "CSV 인코딩을 확인해 주세요. UTF-8로 저장 후 다시 시도해 주세요." },
    ]);
  }

  const parsedHeader = parseCsvText(preparedCsvText, { hasHeader: true });
  const headers = parsedHeader.header ?? [];
  if (headers.length < 1) {
    throw new TransactionStoreInputError("header not found", [
      { field: "headers", message: "헤더 행을 찾을 수 없습니다." },
    ]);
  }

  const mappingUsed = normalizeMappingCandidate(headers, input.mapping);
  const parsed = parseCsvTransactions(preparedCsvText, {
    mapping: mappingUsed,
    hasHeader: true,
  });
  if (parsed.errors.some((error) => error.code === "CSV_ENCODING")) {
    throw new TransactionStoreInputError("csv encoding issue", [
      { field: "csvEncoding", message: "CSV 인코딩을 확인해 주세요. UTF-8로 저장 후 다시 시도해 주세요." },
    ]);
  }
  const preview = previewCsv({
    csvText: preparedCsvText,
    mapping: mappingUsed,
    maxRows: 30,
  });

  const createdAt = nowIso();
  const csvSha256 = toSha256(preparedCsvText);
  const fileName = normalizeFileName(input.fileName);
  const batchId = await createDeterministicBatchId(csvSha256, mappingUsed);

  const batch: V3ImportBatch = {
    id: batchId,
    createdAt,
    kind: "csv",
    ...(fileName ? { fileName } : {}),
    sha256: csvSha256,
    total: parsed.stats.rows,
    ok: parsed.stats.parsed,
    failed: parsed.stats.skipped,
  };

  await appendNdjsonLine(resolveBatchesPath(), batch);

  for (const tx of parsed.transactions) {
    const lineNo = tx.meta?.rowIndex ?? 0;
    const descMasked = maskPreviewDescription(tx.description);
    const txId = sanitizeRecordId(`t_${toSha256(`${batchId}:${lineNo}:${tx.date}:${tx.amountKrw}:${descMasked ?? ""}`).slice(0, 24)}`);

    const record: V3TransactionRecord = {
      id: txId,
      batchId,
      createdAt,
      date: tx.date,
      amountKrw: tx.amountKrw,
      ...(descMasked ? { description: descMasked } : {}),
      source: "csv",
      ...(Number.isFinite(lineNo) && lineNo > 0 ? { meta: { rowIndex: lineNo } } : {}),
      sourceInfo: {
        kind: "csv",
        ...(fileName ? { fileName } : {}),
        sha256: csvSha256,
      },
    };

    await appendNdjsonLine(resolveRecordsPath(), record);
  }

  return {
    batch,
    stats: {
      total: batch.total,
      ok: batch.ok,
      failed: batch.failed,
      stored: parsed.transactions.length,
    },
    sampleRedactedRows: preview.rows,
    mappingUsed,
  };
}

export async function listBatches(options: ListBatchesOptions = {}): Promise<ListBatchesResult> {
  assertServerOnly();

  const limit = asPositiveInt(options.limit, 20, 1, 100);
  const batches = await readBatches();

  const cursor = decodeCursor(asString(options.cursor));
  let start = 0;

  if (cursor) {
    const index = batches.findIndex((batch) => (
      batch.id === cursor.id
      && batch.createdAt === cursor.createdAt
    ));
    if (index >= 0) {
      start = index + 1;
    }
  }

  const items = batches.slice(start, start + limit);
  const next = batches[start + limit];

  return {
    items,
    ...(next
      ? { nextCursor: encodeCursor({ id: items[items.length - 1]?.id ?? next.id, createdAt: items[items.length - 1]?.createdAt ?? next.createdAt }) }
      : {}),
  };
}

export async function readBatch(batchId: string): Promise<ReadBatchResult | null> {
  assertServerOnly();

  const safeBatchId = sanitizeRecordId(batchId);
  const batches = await readBatches();
  const batch = batches.find((entry) => entry.id === safeBatchId);
  if (!batch) return null;

  const records = (await readTransactionRecords())
    .filter((record) => record.batchId === safeBatchId)
    .sort((left, right) => {
      const leftLine = left.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
      const rightLine = right.meta?.rowIndex ?? Number.MAX_SAFE_INTEGER;
      if (leftLine !== rightLine) return leftLine - rightLine;
      return left.id.localeCompare(right.id);
    });

  const sample = records.slice(0, 20).map((record) => toBatchDetailSample(record));
  const monthsSummary = summarizeMonths(records);

  return {
    batch,
    sample,
    stats: {
      total: batch.total,
      ok: batch.ok,
      failed: batch.failed,
      ...(monthsSummary.length > 0 ? { inferredMonths: monthsSummary.length } : {}),
    },
    monthsSummary,
  };
}

export async function readBatchTransactions(batchId: string): Promise<ReadBatchTransactionsResult | null> {
  assertServerOnly();

  const safeBatchId = sanitizeRecordId(batchId);
  const batches = await readBatches();
  const batch = batches.find((entry) => entry.id === safeBatchId);
  if (!batch) return null;

  const transactions = (await readTransactionRecords())
    .filter((record) => record.batchId === safeBatchId)
    .map((record) => toAccountTransaction(record))
    .sort(compareMaskedTransaction);

  return {
    batch,
    transactions,
  };
}

export async function readAllTransactions(): Promise<AccountTransaction[]> {
  assertServerOnly();
  return (await readTransactionRecords())
    .map((record) => toAccountTransaction(record))
    .sort(compareMaskedTransaction);
}
