import fs from "node:fs/promises";
import path from "node:path";
import {
  ASSUMPTIONS_HISTORY_DIR,
  ASSUMPTIONS_PATH,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
  saveLatestAssumptionsSnapshot,
} from "../assumptions/storage";
import { decodeStoragePayload } from "../security/vaultStorage";
import {
  getRun,
  readRunIndexEntries,
  rebuildRunIndexFromDisk,
  scanRunIndexEntriesFromDisk,
  type RunIndexEntry,
} from "../store/runStore";
import {
  resolveProfileRunBlobsDir,
  resolveProfileRunMetaPath,
  resolveRunBlobsDir,
  resolveRunMetaPath,
  resolveRunsIndexPath,
} from "../store/paths";
import { type PlanningRunRecord } from "../store/types";
import {
  compactStorageJournal,
  endStorageTransaction,
  listPendingStorageTransactions,
  type PendingStorageTransaction,
} from "./journal";

export type StorageConsistencySeverity = "warn" | "fail";

export type StorageConsistencyIssue = {
  code: string;
  severity: StorageConsistencySeverity;
  message: string;
  data?: Record<string, unknown>;
};

export type StorageConsistencyReport = {
  ok: boolean;
  issues: StorageConsistencyIssue[];
  summary: {
    total: number;
    warn: number;
    fail: number;
  };
};

export type StorageRecoverySummary = {
  scanned: number;
  recoveredCommit: number;
  recoveredRollback: number;
  notes: string[];
};

export type CleanupOrphanBlobsResult = {
  removed: number;
  skipped: number;
  paths: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativePath(filePath: string, cwd = process.cwd()): string {
  return path.relative(cwd, path.resolve(filePath)).replaceAll("\\", "/");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listJsonFiles(dirPath: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name));
}

async function validateEnvelope(filePath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    await decodeStoragePayload(parsed);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "DECODE_FAILED",
    };
  }
}

function collectOutputRefs(runRow: PlanningRunRecord): Record<string, string> {
  const refs: Record<string, string> = {};
  const row = runRow as unknown as Record<string, unknown>;
  const outputs = isRecord(row.outputs) ? (row.outputs as Record<string, unknown>) : {};
  for (const [section, value] of Object.entries(outputs)) {
    if (!isRecord(value)) continue;
    const ref = isRecord(value.ref) ? value.ref : null;
    const refPath = asString(ref?.path);
    if (!refPath) continue;
    refs[section] = refPath;
  }
  return refs;
}

async function findBlobDir(entry: RunIndexEntry): Promise<string | null> {
  const partition = resolveProfileRunBlobsDir(entry.profileId, entry.id);
  if (await fileExists(partition)) return partition;
  const legacy = resolveRunBlobsDir(entry.id);
  if (await fileExists(legacy)) return legacy;
  return null;
}

function summarizeIssues(issues: StorageConsistencyIssue[]): StorageConsistencyReport["summary"] {
  const warn = issues.filter((issue) => issue.severity === "warn").length;
  const fail = issues.filter((issue) => issue.severity === "fail").length;
  return {
    total: issues.length,
    warn,
    fail,
  };
}

export async function checkPlanningStorageConsistency(): Promise<StorageConsistencyReport> {
  const issues: StorageConsistencyIssue[] = [];

  const indexEntries = await readRunIndexEntries();
  const diskEntries = await scanRunIndexEntriesFromDisk();
  const indexIds = new Set(indexEntries.map((entry) => entry.id));
  const diskIds = new Set(diskEntries.map((entry) => entry.id));

  for (const diskEntry of diskEntries) {
    if (!indexIds.has(diskEntry.id)) {
      issues.push({
        code: "RUN_INDEX_MISSING_ENTRY",
        severity: "warn",
        message: "run index에 없는 run 폴더가 존재합니다.",
        data: { runId: diskEntry.id, profileId: diskEntry.profileId },
      });
    }
  }
  for (const indexEntry of indexEntries) {
    if (!diskIds.has(indexEntry.id)) {
      issues.push({
        code: "RUN_INDEX_ORPHAN_ENTRY",
        severity: "warn",
        message: "run index에만 남아있는 고아 항목이 있습니다.",
        data: { runId: indexEntry.id, profileId: indexEntry.profileId },
      });
    }
  }

  for (const entry of diskEntries) {
    const run = await getRun(entry.id);
    if (!run) continue;
    const metaPath = resolveProfileRunMetaPath(entry.profileId, entry.id);
    const legacyMetaPath = resolveRunMetaPath(entry.id);
    const resolvedMetaPath = (await fileExists(metaPath)) ? metaPath : legacyMetaPath;

    const metaEnvelope = await validateEnvelope(resolvedMetaPath);
    if (!metaEnvelope.ok) {
      issues.push({
        code: "STORAGE_ENVELOPE_INVALID",
        severity: metaEnvelope.error.includes("VAULT_LOCKED") ? "warn" : "fail",
        message: "run meta 암호화 envelope 검증에 실패했습니다.",
        data: {
          runId: entry.id,
          path: normalizeRelativePath(resolvedMetaPath),
          error: metaEnvelope.error,
        },
      });
      continue;
    }

    const blobDir = await findBlobDir(entry);
    const blobFiles = blobDir ? await listJsonFiles(blobDir) : [];
    const blobNames = new Set(
      blobFiles.map((filePath) => path.basename(filePath).replace(/\.json$/i, "")),
    );

    const refs = collectOutputRefs(run);
    for (const [section, refPath] of Object.entries(refs)) {
      const absRefPath = path.resolve(process.cwd(), refPath);
      if (!(await fileExists(absRefPath))) {
        issues.push({
          code: "RUN_BLOB_REF_MISSING",
          severity: "fail",
          message: "run meta의 blob ref가 실제 파일을 가리키지 않습니다.",
          data: {
            runId: entry.id,
            section,
            refPath,
          },
        });
      } else {
        const envelope = await validateEnvelope(absRefPath);
        if (!envelope.ok) {
          issues.push({
            code: "STORAGE_ENVELOPE_INVALID",
            severity: envelope.error.includes("VAULT_LOCKED") ? "warn" : "fail",
            message: "run blob 암호화 envelope 검증에 실패했습니다.",
            data: {
              runId: entry.id,
              section,
              refPath,
              error: envelope.error,
            },
          });
        }
      }
    }

    const expectedBlobNames = new Set(
      Object.values(refs)
        .map((refPath) => path.basename(refPath).replace(/\.json$/i, ""))
        .filter((value) => value.length > 0),
    );

    for (const blobName of blobNames) {
      if (expectedBlobNames.has(blobName)) continue;
      issues.push({
        code: "RUN_BLOB_ORPHAN",
        severity: "warn",
        message: "run blob 파일이 meta ref에 연결되어 있지 않습니다.",
        data: {
          runId: entry.id,
          blobName,
          path: normalizeRelativePath(path.join(blobDir ?? "", `${blobName}.json`)),
        },
      });
    }
  }

  const runsIndexEnvelope = await validateEnvelope(resolveRunsIndexPath());
  if (!runsIndexEnvelope.ok && !runsIndexEnvelope.error.includes("ENOENT")) {
    issues.push({
      code: "STORAGE_ENVELOPE_INVALID",
      severity: runsIndexEnvelope.error.includes("VAULT_LOCKED") ? "warn" : "fail",
      message: "runs index envelope 검증에 실패했습니다.",
      data: {
        path: normalizeRelativePath(resolveRunsIndexPath()),
        error: runsIndexEnvelope.error,
      },
    });
  }

  const assumptionsPath = path.resolve(process.cwd(), (process.env.PLANNING_ASSUMPTIONS_PATH ?? ASSUMPTIONS_PATH).trim() || ASSUMPTIONS_PATH);
  if (await fileExists(assumptionsPath)) {
    const latestEnvelope = await validateEnvelope(assumptionsPath);
    if (!latestEnvelope.ok) {
      issues.push({
        code: "STORAGE_ENVELOPE_INVALID",
        severity: latestEnvelope.error.includes("VAULT_LOCKED") ? "warn" : "fail",
        message: "latest assumptions envelope 검증에 실패했습니다.",
        data: {
          path: normalizeRelativePath(assumptionsPath),
          error: latestEnvelope.error,
        },
      });
    }
  }

  const historyDir = path.resolve(
    process.cwd(),
    (process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR ?? ASSUMPTIONS_HISTORY_DIR).trim() || ASSUMPTIONS_HISTORY_DIR,
  );
  const historyFiles = await listJsonFiles(historyDir);
  for (const filePath of historyFiles.slice(0, 200)) {
    const envelope = await validateEnvelope(filePath);
    if (envelope.ok) continue;
    issues.push({
      code: "STORAGE_ENVELOPE_INVALID",
      severity: envelope.error.includes("VAULT_LOCKED") ? "warn" : "fail",
      message: "assumptions history envelope 검증에 실패했습니다.",
      data: {
        path: normalizeRelativePath(filePath),
        error: envelope.error,
      },
    });
  }

  const summary = summarizeIssues(issues);
  return {
    ok: summary.fail === 0,
    issues,
    summary,
  };
}

function txPayloadValue(
  tx: PendingStorageTransaction,
  key: string,
): string {
  return asString(tx.begin.payload?.[key]);
}

function txStepPayloadValue(
  tx: PendingStorageTransaction,
  step: string,
  key: string,
): string {
  const row = [...tx.steps].reverse().find((entry) => entry.step === step);
  return asString(row?.payload?.[key]);
}

async function recoverRunCreateTransaction(tx: PendingStorageTransaction): Promise<{ outcome: "commit" | "rollback"; note: string }> {
  const runId = txPayloadValue(tx, "runId");
  const profileId = txPayloadValue(tx, "profileId");
  if (!runId || !profileId) {
    return { outcome: "rollback", note: "invalid run-create payload" };
  }

  const metaPath = resolveProfileRunMetaPath(profileId, runId);
  if (await fileExists(metaPath)) {
    await rebuildRunIndexFromDisk();
    return { outcome: "commit", note: "meta exists; index rebuilt" };
  }

  await fs.rm(path.dirname(metaPath), { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(resolveRunBlobsDir(runId), { recursive: true, force: true }).catch(() => undefined);
  return { outcome: "rollback", note: "meta missing; cleaned partial blobs" };
}

async function recoverRunIndexTransaction(): Promise<{ outcome: "commit"; note: string }> {
  const result = await rebuildRunIndexFromDisk();
  return {
    outcome: "commit",
    note: `index rebuilt (${result.entries})`,
  };
}

async function recoverSnapshotWriteTransaction(tx: PendingStorageTransaction): Promise<{ outcome: "commit" | "rollback"; note: string }> {
  const snapshotId = txStepPayloadValue(tx, "WRITE_HISTORY", "snapshotId");
  if (!snapshotId) {
    return { outcome: "rollback", note: "snapshotId missing in journal steps" };
  }

  const historySnapshot = await loadAssumptionsSnapshotById(snapshotId);
  if (!historySnapshot) {
    return { outcome: "rollback", note: "history snapshot not found" };
  }
  const latest = await loadLatestAssumptionsSnapshot();
  if (!latest || latest.fetchedAt !== historySnapshot.fetchedAt || latest.asOf !== historySnapshot.asOf) {
    await saveLatestAssumptionsSnapshot(historySnapshot);
  }
  return { outcome: "commit", note: "latest snapshot restored from history" };
}

export async function recoverPlanningStorageTransactions(): Promise<StorageRecoverySummary> {
  const pending = await listPendingStorageTransactions();
  const notes: string[] = [];
  let recoveredCommit = 0;
  let recoveredRollback = 0;

  for (const tx of pending) {
    try {
      if (tx.begin.kind === "RUN_CREATE") {
        const recovered = await recoverRunCreateTransaction(tx);
        if (recovered.outcome === "commit") {
          recoveredCommit += 1;
          await endStorageTransaction({ txId: tx.begin.txId, kind: tx.begin.kind }, "RECOVERED_COMMIT", recovered.note);
        } else {
          recoveredRollback += 1;
          await endStorageTransaction({ txId: tx.begin.txId, kind: tx.begin.kind }, "RECOVERED_ROLLBACK", recovered.note);
        }
        notes.push(`${tx.begin.txId}: ${recovered.note}`);
        continue;
      }

      if (tx.begin.kind === "RUN_INDEX_UPDATE") {
        const recovered = await recoverRunIndexTransaction();
        recoveredCommit += 1;
        await endStorageTransaction({ txId: tx.begin.txId, kind: tx.begin.kind }, "RECOVERED_COMMIT", recovered.note);
        notes.push(`${tx.begin.txId}: ${recovered.note}`);
        continue;
      }

      if (tx.begin.kind === "SNAPSHOT_WRITE") {
        const recovered = await recoverSnapshotWriteTransaction(tx);
        if (recovered.outcome === "commit") {
          recoveredCommit += 1;
          await endStorageTransaction({ txId: tx.begin.txId, kind: tx.begin.kind }, "RECOVERED_COMMIT", recovered.note);
        } else {
          recoveredRollback += 1;
          await endStorageTransaction({ txId: tx.begin.txId, kind: tx.begin.kind }, "RECOVERED_ROLLBACK", recovered.note);
        }
        notes.push(`${tx.begin.txId}: ${recovered.note}`);
      }
    } catch (error) {
      recoveredRollback += 1;
      const note = error instanceof Error ? error.message : "recovery failed";
      notes.push(`${tx.begin.txId}: ${note}`);
      await endStorageTransaction(
        { txId: tx.begin.txId, kind: tx.begin.kind },
        "RECOVERED_ROLLBACK",
        note,
      ).catch(() => undefined);
    }
  }

  await compactStorageJournal().catch(() => undefined);
  return {
    scanned: pending.length,
    recoveredCommit,
    recoveredRollback,
    notes,
  };
}

export async function repairRunIndexConsistency(): Promise<{
  entries: number;
  indexPath: string;
}> {
  return rebuildRunIndexFromDisk();
}

export async function cleanupOrphanRunBlobs(): Promise<CleanupOrphanBlobsResult> {
  const report = await checkPlanningStorageConsistency();
  const orphanIssues = report.issues.filter((issue) => issue.code === "RUN_BLOB_ORPHAN");
  const removedPaths: string[] = [];
  let skipped = 0;

  for (const issue of orphanIssues) {
    const relPath = asString(issue.data?.path);
    if (!relPath) {
      skipped += 1;
      continue;
    }
    const absPath = path.resolve(process.cwd(), relPath);
    try {
      await fs.unlink(absPath);
      removedPaths.push(relPath);
    } catch {
      skipped += 1;
    }
  }

  return {
    removed: removedPaths.length,
    skipped,
    paths: removedPaths,
  };
}
