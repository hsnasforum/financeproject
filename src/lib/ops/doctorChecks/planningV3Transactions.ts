import fs from "node:fs/promises";
import path from "node:path";
import { resolvePlanningDataDir } from "../../planning/storage/dataDir";
import { type DoctorCheck } from "../doctorChecks";

type PlanningV3DoctorOptions = {
  txFileWarnBytes?: number;
  recentBatchLimit?: number;
};

type ParsedNdjson = {
  rows: unknown[];
  invalidLines: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveStoreRoot(cwd = process.cwd()): string {
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "transactions");
}

async function parseNdjsonFile(filePath: string): Promise<ParsedNdjson> {
  const text = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!text.trim()) {
    return { rows: [], invalidLines: 0 };
  }

  const rows: unknown[] = [];
  let invalidLines = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as unknown);
    } catch {
      invalidLines += 1;
    }
  }

  return {
    rows,
    invalidLines,
  };
}

function normalizeBatch(entry: unknown): {
  id: string;
  total: number;
  ok: number;
  failed: number;
} | null {
  if (!isRecord(entry)) return null;
  const id = asString(entry.id);
  if (!id) return null;
  return {
    id,
    total: asNonNegativeInt(entry.total),
    ok: asNonNegativeInt(entry.ok),
    failed: asNonNegativeInt(entry.failed),
  };
}

export async function checkPlanningV3TransactionStore(
  options: PlanningV3DoctorOptions = {},
): Promise<DoctorCheck[]> {
  const txFileWarnBytes = asNonNegativeInt(options.txFileWarnBytes) || (50 * 1024 * 1024);
  const recentBatchLimit = asNonNegativeInt(options.recentBatchLimit) || 20;
  const root = resolveStoreRoot();
  const batchesPath = path.join(root, "batches.ndjson");
  const recordsPath = path.join(root, "records.ndjson");

  const checks: DoctorCheck[] = [];
  const rootExists = await fs.stat(root).then((stat) => stat.isDirectory()).catch(() => false);
  checks.push({
    id: "planning-v3/store-root",
    title: "Planning v3 transaction store root",
    status: rootExists ? "PASS" : "WARN",
    message: rootExists ? "store root found" : "store root is missing",
    details: { path: root },
    fixHref: "/ops/doctor",
  });

  const [batchesParsed, recordsParsed, recordsStat] = await Promise.all([
    parseNdjsonFile(batchesPath),
    parseNdjsonFile(recordsPath),
    fs.stat(recordsPath).catch(() => null),
  ]);

  checks.push({
    id: "planning-v3/batches-ndjson",
    title: "Planning v3 batches NDJSON parse",
    status: batchesParsed.invalidLines > 0 ? "FAIL" : "PASS",
    message: batchesParsed.invalidLines > 0 ? "invalid batches NDJSON lines found" : "batches NDJSON parse is healthy",
    details: {
      invalidLines: batchesParsed.invalidLines,
      rowCount: batchesParsed.rows.length,
    },
    fixHref: "/ops/doctor",
  });

  checks.push({
    id: "planning-v3/records-ndjson",
    title: "Planning v3 transaction records NDJSON parse",
    status: recordsParsed.invalidLines > 0 ? "FAIL" : "PASS",
    message: recordsParsed.invalidLines > 0 ? "invalid transaction NDJSON lines found" : "transaction NDJSON parse is healthy",
    details: {
      invalidLines: recordsParsed.invalidLines,
      rowCount: recordsParsed.rows.length,
    },
    fixHref: "/ops/doctor",
  });

  const batches = batchesParsed.rows
    .map((row) => normalizeBatch(row))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(-recentBatchLimit);
  const recordsByBatch = new Map<string, number>();
  for (const row of recordsParsed.rows) {
    if (!isRecord(row)) continue;
    const batchId = asString(row.batchId);
    if (!batchId) continue;
    recordsByBatch.set(batchId, (recordsByBatch.get(batchId) ?? 0) + 1);
  }

  let mismatchCount = 0;
  for (const batch of batches) {
    const hasMetaMismatch = batch.total < (batch.ok + batch.failed);
    const storedCount = recordsByBatch.get(batch.id) ?? 0;
    const hasStoredMismatch = storedCount < batch.ok;
    if (hasMetaMismatch || hasStoredMismatch) mismatchCount += 1;
  }

  checks.push({
    id: "planning-v3/batch-integrity",
    title: "Planning v3 batch integrity",
    status: mismatchCount > 0 ? "FAIL" : "PASS",
    message: mismatchCount > 0 ? "batch meta/records integrity mismatch detected" : "batch integrity is healthy",
    details: {
      checkedBatches: batches.length,
      mismatchCount,
    },
    fixHref: "/ops/doctor",
  });

  const txBytes = recordsStat?.size ?? 0;
  checks.push({
    id: "planning-v3/records-size",
    title: "Planning v3 records file size",
    status: txBytes > txFileWarnBytes ? "WARN" : "PASS",
    message: txBytes > txFileWarnBytes ? "records file exceeds warning threshold" : "records file size is within threshold",
    details: {
      bytes: txBytes,
      warnThresholdBytes: txFileWarnBytes,
    },
    fixHref: "/ops/doctor",
  });

  return checks;
}
