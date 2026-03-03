import fs from "node:fs/promises";
import path from "node:path";
import { type DoctorCheck } from "../doctorChecks";
import { resolvePlanningDataDir } from "../../planning/storage/dataDir";
import { sanitizeRecordId } from "../../planning/store/paths";

type PlanningV3TransactionStoreCheckOptions = {
  cwd?: string;
  maxRecentBatches?: number;
  txFileWarnBytes?: number;
};

type NdjsonScanResult = {
  exists: boolean;
  path: string;
  sizeBytes: number;
  totalLines: number;
  validLines: number;
  invalidLines: number;
  firstInvalidLine?: number;
  rows: unknown[];
};

type ParsedBatchRow = {
  id: string;
  createdAt: string;
  total: number;
  ok: number;
  failed: number;
};

type ParsedRecordRow = {
  batchId: string;
};

const DEFAULT_RECENT_BATCHES = 20;
const DEFAULT_TX_SIZE_WARN_BYTES = 50 * 1024 * 1024;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function resolveTransactionsDir(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_TRANSACTIONS_DIR);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "transactions");
}

function normalizeBatchRow(row: unknown): ParsedBatchRow | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const payload = row as Record<string, unknown>;
  try {
    const id = sanitizeRecordId(payload.id);
    const createdAt = asString(payload.createdAt);
    if (!createdAt) return null;
    return {
      id,
      createdAt,
      total: asNonNegativeInt(payload.total),
      ok: asNonNegativeInt(payload.ok),
      failed: asNonNegativeInt(payload.failed),
    };
  } catch {
    return null;
  }
}

function normalizeRecordRow(row: unknown): ParsedRecordRow | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const payload = row as Record<string, unknown>;
  try {
    return {
      batchId: sanitizeRecordId(payload.batchId),
    };
  } catch {
    return null;
  }
}

function summarizeIds(ids: string[], limit = 5): string[] {
  return ids.slice(0, limit);
}

async function scanNdjson(filePath: string): Promise<NdjsonScanResult> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return {
      exists: false,
      path: filePath,
      sizeBytes: 0,
      totalLines: 0,
      validLines: 0,
      invalidLines: 0,
      rows: [],
    };
  }

  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  const lines = raw.split(/\r?\n/);
  const rows: unknown[] = [];
  let totalLines = 0;
  let validLines = 0;
  let invalidLines = 0;
  let firstInvalidLine: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed) continue;

    totalLines += 1;
    try {
      rows.push(JSON.parse(trimmed) as unknown);
      validLines += 1;
    } catch {
      invalidLines += 1;
      if (!firstInvalidLine) {
        firstInvalidLine = index + 1;
      }
    }
  }

  return {
    exists: true,
    path: filePath,
    sizeBytes: stat.size,
    totalLines,
    validLines,
    invalidLines,
    ...(typeof firstInvalidLine === "number" ? { firstInvalidLine } : {}),
    rows,
  };
}

function toStatusCheck(input: {
  id: string;
  title: string;
  passMessage: string;
  failMessage?: string;
  warnMessage?: string;
  status: DoctorCheck["status"];
  details?: Record<string, unknown>;
}): DoctorCheck {
  const message = input.status === "PASS"
    ? input.passMessage
    : input.status === "FAIL"
      ? (input.failMessage ?? input.warnMessage ?? "검사 실패")
      : (input.warnMessage ?? input.failMessage ?? "검사 경고");

  return {
    id: input.id,
    title: input.title,
    status: input.status,
    message,
    fixHref: "/ops/doctor",
    ...(input.details ? { details: input.details } : {}),
  };
}

export async function checkPlanningV3TransactionStore(
  options: PlanningV3TransactionStoreCheckOptions = {},
): Promise<DoctorCheck[]> {
  const recentBatchLimit = Math.max(1, Math.min(100, asNonNegativeInt(options.maxRecentBatches || DEFAULT_RECENT_BATCHES)));
  const txSizeWarnBytes = Math.max(1, asNonNegativeInt(options.txFileWarnBytes || DEFAULT_TX_SIZE_WARN_BYTES));
  const transactionsDir = resolveTransactionsDir(options.cwd ?? process.cwd());
  const batchesPath = path.join(transactionsDir, "batches.ndjson");
  const recordsPath = path.join(transactionsDir, "records.ndjson");

  const checks: DoctorCheck[] = [];
  const dirStat = await fs.stat(transactionsDir).catch(() => null);
  const hasDir = Boolean(dirStat?.isDirectory());

  checks.push(toStatusCheck({
    id: "planning-v3/store-root",
    title: "Planning V3 transaction store root",
    status: hasDir ? "PASS" : "WARN",
    passMessage: "planning v3 transaction store 디렉터리가 존재합니다.",
    warnMessage: "planning v3 transaction store 디렉터리가 없습니다.",
    details: {
      transactionsDir,
      exists: hasDir,
    },
  }));

  const [batchesScan, recordsScan] = await Promise.all([
    scanNdjson(batchesPath),
    scanNdjson(recordsPath),
  ]);

  checks.push(toStatusCheck({
    id: "planning-v3/batches-file",
    title: "Planning V3 batches file",
    status: batchesScan.exists ? "PASS" : "WARN",
    passMessage: "batches.ndjson 파일이 존재합니다.",
    warnMessage: "batches.ndjson 파일이 없습니다.",
    details: {
      filePath: batchesPath,
      exists: batchesScan.exists,
    },
  }));

  checks.push(toStatusCheck({
    id: "planning-v3/records-file",
    title: "Planning V3 records file",
    status: recordsScan.exists ? "PASS" : "WARN",
    passMessage: "records.ndjson 파일이 존재합니다.",
    warnMessage: "records.ndjson 파일이 없습니다.",
    details: {
      filePath: recordsPath,
      exists: recordsScan.exists,
    },
  }));

  checks.push(toStatusCheck({
    id: "planning-v3/batches-ndjson",
    title: "Planning V3 batches NDJSON parse",
    status: !batchesScan.exists
      ? "WARN"
      : batchesScan.invalidLines > 0
        ? "FAIL"
        : "PASS",
    passMessage: "batches.ndjson 파싱이 정상입니다.",
    warnMessage: "batches.ndjson 파일이 없어 파싱을 건너뛰었습니다.",
    failMessage: "batches.ndjson에서 파싱 실패 라인이 발견되었습니다.",
    details: {
      filePath: batchesPath,
      totalLines: batchesScan.totalLines,
      validLines: batchesScan.validLines,
      invalidLines: batchesScan.invalidLines,
      ...(typeof batchesScan.firstInvalidLine === "number" ? { firstInvalidLine: batchesScan.firstInvalidLine } : {}),
    },
  }));

  checks.push(toStatusCheck({
    id: "planning-v3/records-ndjson",
    title: "Planning V3 records NDJSON parse",
    status: !recordsScan.exists
      ? "WARN"
      : recordsScan.invalidLines > 0
        ? "FAIL"
        : "PASS",
    passMessage: "records.ndjson 파싱이 정상입니다.",
    warnMessage: "records.ndjson 파일이 없어 파싱을 건너뛰었습니다.",
    failMessage: "records.ndjson에서 파싱 실패 라인이 발견되었습니다.",
    details: {
      filePath: recordsPath,
      totalLines: recordsScan.totalLines,
      validLines: recordsScan.validLines,
      invalidLines: recordsScan.invalidLines,
      ...(typeof recordsScan.firstInvalidLine === "number" ? { firstInvalidLine: recordsScan.firstInvalidLine } : {}),
    },
  }));

  const batches = batchesScan.rows
    .map((row) => normalizeBatchRow(row))
    .filter((row): row is ParsedBatchRow => row !== null)
    .sort((left, right) => {
      const leftTs = Date.parse(left.createdAt);
      const rightTs = Date.parse(right.createdAt);
      if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
        return rightTs - leftTs;
      }
      return right.id.localeCompare(left.id);
    });

  const recordBatchCounts = new Map<string, number>();
  for (const row of recordsScan.rows) {
    const parsed = normalizeRecordRow(row);
    if (!parsed) continue;
    recordBatchCounts.set(parsed.batchId, (recordBatchCounts.get(parsed.batchId) ?? 0) + 1);
  }

  const inconsistentMeta = batches
    .filter((batch) => batch.total !== batch.ok + batch.failed)
    .map((batch) => batch.id);
  const emptyBatches = batches
    .filter((batch) => batch.total < 1)
    .map((batch) => batch.id);
  const recentBatches = batches.slice(0, recentBatchLimit);
  const indexMismatches = recentBatches
    .filter((batch) => (recordBatchCounts.get(batch.id) ?? 0) !== batch.ok)
    .map((batch) => batch.id);

  const integrityStatus: DoctorCheck["status"] = (
    inconsistentMeta.length > 0 || indexMismatches.length > 0
  )
    ? "FAIL"
    : emptyBatches.length > 0
      ? "WARN"
      : "PASS";

  checks.push(toStatusCheck({
    id: "planning-v3/batch-integrity",
    title: "Planning V3 batch integrity",
    status: integrityStatus,
    passMessage: "최근 배치 메타와 인덱스 정합성이 정상입니다.",
    warnMessage: "빈 배치가 감지되었습니다.",
    failMessage: "배치 메타/인덱스 정합성 오류가 감지되었습니다.",
    details: {
      batchCount: batches.length,
      checkedRecentBatches: recentBatches.length,
      inconsistentMetaCount: inconsistentMeta.length,
      emptyBatchCount: emptyBatches.length,
      indexMismatchCount: indexMismatches.length,
      ...(inconsistentMeta.length > 0 ? { inconsistentMetaSample: summarizeIds(inconsistentMeta) } : {}),
      ...(emptyBatches.length > 0 ? { emptyBatchSample: summarizeIds(emptyBatches) } : {}),
      ...(indexMismatches.length > 0 ? { indexMismatchSample: summarizeIds(indexMismatches) } : {}),
    },
  }));

  checks.push(toStatusCheck({
    id: "planning-v3/records-size",
    title: "Planning V3 records file size",
    status: !recordsScan.exists
      ? "WARN"
      : recordsScan.sizeBytes > txSizeWarnBytes
        ? "WARN"
        : "PASS",
    passMessage: "records.ndjson 파일 크기가 정상 범위입니다.",
    warnMessage: !recordsScan.exists
      ? "records.ndjson 파일이 없어 크기 검사를 건너뛰었습니다."
      : "records.ndjson 파일 크기가 임계치를 초과했습니다.",
    details: {
      filePath: recordsPath,
      sizeBytes: recordsScan.sizeBytes,
      warnThresholdBytes: txSizeWarnBytes,
    },
  }));

  return checks;
}
