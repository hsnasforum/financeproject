import fs from "node:fs";
import path from "node:path";
import { loadPolicy, type RetentionPolicy } from "./retentionPolicy.ts";

const DAILY_REFRESH_LOG_KEEP_LINES = 2000;
const REPORT_FILE_NAME = "cleanup_report.json";
const CANONICAL_RESTORE_POINT_NAME = "backup_restore_point.json";
const RESTORE_POINT_PATTERN = /^backup_restore_point(?:[._-].+)?\.json$/;

type CleanupTargetStatus = "trimmed" | "truncated" | "removed" | "kept" | "skipped" | "error";

export type CleanupTargetReport = {
  target: string;
  status: CleanupTargetStatus;
  beforeCount?: number;
  afterCount?: number;
  removedCount?: number;
  beforeBytes?: number;
  afterBytes?: number;
  reason?: string;
};

export type CleanupReport = {
  generatedAt: string;
  policy: RetentionPolicy;
  summary: {
    removed: number;
    truncated: number;
    kept: number;
    skipped: number;
    errors: number;
  };
  targets: CleanupTargetReport[];
};

export type RunCleanupOptions = {
  now?: Date;
  cwd?: string;
  policyPath?: string;
};

export type RunCleanupResult = {
  ok: true;
  report: CleanupReport;
};

function asDate(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  return new Date();
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function trimArrayFile(filePath: string, limit: number, target: string): CleanupTargetReport {
  if (!fs.existsSync(filePath)) {
    return { target, status: "skipped", reason: "missing_file" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  } catch {
    return { target, status: "error", reason: "invalid_json" };
  }

  if (!Array.isArray(parsed)) {
    return { target, status: "error", reason: "invalid_format" };
  }

  const beforeCount = parsed.length;
  if (beforeCount <= limit) {
    return { target, status: "kept", beforeCount, afterCount: beforeCount, removedCount: 0 };
  }

  const next = parsed.slice(beforeCount - limit);
  writeJsonAtomic(filePath, next);
  return {
    target,
    status: "trimmed",
    beforeCount,
    afterCount: next.length,
    removedCount: beforeCount - next.length,
  };
}

function tailByBytes(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf-8");
  if (bytes.length <= maxBytes) return text;
  return bytes.subarray(bytes.length - maxBytes).toString("utf-8");
}

function truncateDailyRefreshLog(
  filePath: string,
  target: string,
  maxBytes: number,
  keepTailBytes: number,
): CleanupTargetReport {
  if (!fs.existsSync(filePath)) {
    return { target, status: "skipped", reason: "missing_file" };
  }

  let beforeBytes = 0;
  try {
    beforeBytes = fs.statSync(filePath).size;
  } catch {
    return { target, status: "error", reason: "stat_failed" };
  }

  if (beforeBytes <= maxBytes) {
    return { target, status: "kept", beforeBytes, afterBytes: beforeBytes };
  }

  let body = "";
  try {
    body = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { target, status: "error", reason: "read_failed" };
  }

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let tail = lines.slice(-DAILY_REFRESH_LOG_KEEP_LINES).join("\n");
  tail = tailByBytes(tail, keepTailBytes);
  if (tail.length > 0 && !tail.endsWith("\n")) {
    tail = `${tail}\n`;
  }

  try {
    fs.writeFileSync(filePath, tail, "utf-8");
  } catch {
    return { target, status: "error", reason: "write_failed" };
  }

  const afterBytes = Buffer.byteLength(tail, "utf-8");
  return {
    target,
    status: "truncated",
    beforeBytes,
    afterBytes,
    removedCount: Math.max(0, beforeBytes - afterBytes),
  };
}

type RestorePointEntry = {
  name: string;
  absolutePath: string;
  mtimeMs: number;
};

function cleanupRestorePoints(tmpDir: string, target: string, keepBackupRestorePoint: boolean): CleanupTargetReport {
  if (!fs.existsSync(tmpDir)) {
    return { target, status: "skipped", reason: "missing_tmp_dir" };
  }

  let names: string[] = [];
  try {
    names = fs.readdirSync(tmpDir);
  } catch {
    return { target, status: "error", reason: "list_failed" };
  }

  const candidates = names
    .filter((name) => RESTORE_POINT_PATTERN.test(name))
    .map((name): RestorePointEntry | null => {
      const absolutePath = path.join(tmpDir, name);
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile()) return null;
        return { name, absolutePath, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is RestorePointEntry => entry !== null);

  if (candidates.length < 1) {
    return { target, status: "skipped", reason: "missing_file" };
  }

  if (!keepBackupRestorePoint) {
    let removedCount = 0;
    for (const entry of candidates) {
      try {
        fs.unlinkSync(entry.absolutePath);
        removedCount += 1;
      } catch {
        // ignore per-file failure; report partial cleanup
      }
    }
    if (removedCount > 0) {
      return {
        target,
        status: "removed",
        beforeCount: candidates.length,
        afterCount: Math.max(0, candidates.length - removedCount),
        removedCount,
      };
    }
    return {
      target,
      status: "kept",
      beforeCount: candidates.length,
      afterCount: candidates.length,
      removedCount: 0,
    };
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  const latest = candidates[0];
  const canonicalPath = path.join(tmpDir, CANONICAL_RESTORE_POINT_NAME);

  let latestContent = "";
  try {
    latestContent = fs.readFileSync(latest.absolutePath, "utf-8");
  } catch {
    return { target, status: "error", reason: "read_failed" };
  }

  try {
    fs.writeFileSync(canonicalPath, latestContent, "utf-8");
  } catch {
    return { target, status: "error", reason: "write_failed" };
  }

  let removedCount = 0;
  for (const entry of candidates) {
    if (entry.name === CANONICAL_RESTORE_POINT_NAME) continue;
    try {
      fs.unlinkSync(entry.absolutePath);
      removedCount += 1;
    } catch {
      // ignore per-file failure; report partial cleanup
    }
  }

  if (removedCount > 0) {
    return {
      target,
      status: "removed",
      beforeCount: candidates.length,
      afterCount: 1,
      removedCount,
    };
  }

  return {
    target,
    status: "kept",
    beforeCount: candidates.length,
    afterCount: 1,
    removedCount: 0,
  };
}

function summarize(targets: CleanupTargetReport[]): CleanupReport["summary"] {
  const summary = {
    removed: 0,
    truncated: 0,
    kept: 0,
    skipped: 0,
    errors: 0,
  };

  for (const target of targets) {
    if (target.status === "trimmed" || target.status === "removed") {
      summary.removed += Math.max(0, Math.trunc(target.removedCount ?? 0));
      continue;
    }
    if (target.status === "truncated") {
      summary.truncated += 1;
      continue;
    }
    if (target.status === "kept") {
      summary.kept += 1;
      continue;
    }
    if (target.status === "skipped") {
      summary.skipped += 1;
      continue;
    }
    if (target.status === "error") {
      summary.errors += 1;
    }
  }

  return summary;
}

export function runCleanup(options: RunCleanupOptions = {}): RunCleanupResult {
  const now = asDate(options.now);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const tmpDir = path.join(cwd, "tmp");
  const policy = loadPolicy(options.policyPath ?? path.join(cwd, "config", "retention-policy.json"));

  const targets: CleanupTargetReport[] = [
    trimArrayFile(path.join(tmpDir, "fix_history.json"), policy.fixHistoryMaxItems, "tmp/fix_history.json"),
    trimArrayFile(path.join(tmpDir, "user_feedback.json"), policy.feedbackMaxItems, "tmp/user_feedback.json"),
    truncateDailyRefreshLog(
      path.join(tmpDir, "daily_refresh.log"),
      "tmp/daily_refresh.log",
      policy.refreshLogMaxBytes,
      policy.refreshLogKeepTailBytes,
    ),
    cleanupRestorePoints(tmpDir, "tmp/backup_restore_point.json", policy.keepBackupRestorePoint),
  ];

  const report: CleanupReport = {
    generatedAt: now.toISOString(),
    policy,
    summary: summarize(targets),
    targets,
  };

  writeJsonAtomic(path.join(tmpDir, REPORT_FILE_NAME), report);

  return {
    ok: true,
    report,
  };
}
